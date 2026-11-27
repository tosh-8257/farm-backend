import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { supplierAdminTransition } from '../commerce/order-rules';
import { EcosystemNotifyService } from '../notifications/ecosystem-notify.service';

const KINDS = [
  'individual_rider',
  'individual_vehicle',
  'logistics_company',
] as const;

@Injectable()
export class PartnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Optional() private readonly notify?: EcosystemNotifyService,
  ) {}

  async apply(
    userId: string,
    input: {
      kind: string;
      legalName: string;
      phone?: string;
      serviceArea?: string;
      companyRegistration?: string;
    },
  ) {
    if (!KINDS.includes(input.kind as (typeof KINDS)[number]))
      throw new BadRequestException('Partner kind is not supported');
    const legal = input.legalName?.trim();
    if (!legal || legal.length < 2)
      throw new BadRequestException('Legal name is required');
    if (input.kind === 'logistics_company' && !input.companyRegistration?.trim())
      throw new BadRequestException('A company registration number is required');
    const existing = await this.prisma.delivery_partner_profiles.findUnique({
      where: { user_id: userId },
    });
    if (
      existing &&
      !['draft', 'rejected', 'more_information_required'].includes(
        existing.status,
      )
    ) {
      throw new ConflictException('This application cannot be resubmitted');
    }
    const data = {
      kind: input.kind,
      legal_name: legal,
      phone: input.phone?.trim() || null,
      service_area: input.serviceArea?.trim() || null,
      company_registration: input.companyRegistration?.trim() || null,
      status: 'submitted',
    };
    const row = await this.prisma.delivery_partner_profiles.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: data,
    });
    return { data: row };
  }

  async me(userId: string) {
    const row = await this.prisma.delivery_partner_profiles.findUnique({
      where: { user_id: userId },
      include: { vehicles: true, drivers: true },
    });
    if (!row) throw new NotFoundException('Partner profile not found');
    return { data: row };
  }

  async addVehicle(
    userId: string,
    input: {
      category: string;
      makeModel: string;
      registration: string;
      capacityKg: number;
    },
  ) {
    const partner = await this.own(userId);
    if (!(input.capacityKg > 0))
      throw new BadRequestException('Capacity must be positive');
    const row = await this.prisma.partner_vehicles.create({
      data: {
        partner_id: partner.id,
        category: input.category.trim(),
        make_model: input.makeModel.trim(),
        registration: input.registration.trim(),
        capacity_kg: input.capacityKg,
      },
    });
    return { data: row };
  }

  async addDriver(
    userId: string,
    input: { legalName: string; licenceRef: string },
  ) {
    const partner = await this.own(userId);
    if (partner.kind !== 'logistics_company')
      throw new ForbiddenException('Only a logistics company records drivers');
    const row = await this.prisma.partner_drivers.create({
      data: {
        partner_id: partner.id,
        legal_name: input.legalName.trim(),
        licence_ref: input.licenceRef.trim(),
      },
    });
    return { data: row };
  }

  async adminDecision(
    adminId: string,
    partnerId: string,
    to: string,
    notes?: string,
  ) {
    const row = await this.prisma.delivery_partner_profiles.findUnique({
      where: { id: partnerId },
    });
    if (!row) throw new NotFoundException('Partner not found');
    if (!supplierAdminTransition(row.status, to))
      throw new BadRequestException(`Cannot move ${row.status} to ${to}`);
    const updated = await this.prisma.delivery_partner_profiles.update({
      where: { id: partnerId },
      data: { status: to },
    });
    await this.notify?.once(
      updated.user_id,
      `partner:${partnerId}:${to}`,
      'Partner update',
      'Your partner application status changed.',
    );
    await this.audit.log({
      userId: adminId,
      action: 'partner_decision',
      resource: 'delivery_partner_profiles',
      resourceId: partnerId,
      oldValues: { status: row.status },
      newValues: { status: to, notes: notes ?? null },
      status: 'success',
    });
    return { data: updated };
  }

  private async own(userId: string) {
    const row = await this.prisma.delivery_partner_profiles.findUnique({
      where: { user_id: userId },
    });
    if (!row) throw new NotFoundException('Partner profile not found');
    if (['rejected', 'suspended'].includes(row.status))
      throw new ForbiddenException('This partner cannot update records');
    return row;
  }
}
