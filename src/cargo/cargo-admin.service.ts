import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';

@Injectable()
export class CargoAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list() {
    const rates = await this.prisma.cargo_rates.findMany({
      orderBy: [{ from_zone: 'asc' }, { to_zone: 'asc' }, { min_kg: 'asc' }],
    });
    return { data: rates };
  }

  async zones() {
    const rates = await this.prisma.cargo_rates.findMany({
      where: { active: true },
      select: { from_zone: true, to_zone: true },
    });
    const names = new Set<string>();
    for (const rate of rates) {
      names.add(rate.from_zone);
      names.add(rate.to_zone);
    }
    return { data: [...names].sort() };
  }

  async create(
    adminId: string,
    input: {
      fromZone: string;
      toZone: string;
      baseFeeFarm: number;
      perKgFarm: number;
    },
  ) {
    const fromZone = input.fromZone.trim().toLowerCase();
    const toZone = input.toZone.trim().toLowerCase();
    if (!fromZone || !toZone)
      throw new BadRequestException('Both zones are required');
    if (input.baseFeeFarm < 0 || input.perKgFarm < 0)
      throw new BadRequestException('Rates cannot be negative');
    if (input.baseFeeFarm === 0 && input.perKgFarm === 0)
      throw new BadRequestException('Set a base fee or a per-kilogram rate');
    const existing = await this.prisma.cargo_rates.findFirst({
      where: { from_zone: fromZone, to_zone: toZone, active: true },
    });
    if (existing)
      throw new ConflictException(
        'Turn off the active rate for this zone pair before adding another',
      );
    const rate = await this.prisma.cargo_rates.create({
      data: {
        from_zone: fromZone,
        to_zone: toZone,
        min_kg: 0,
        max_kg: 0,
        price_farm: input.baseFeeFarm,
        base_fee_farm: input.baseFeeFarm,
        per_kg_farm: input.perKgFarm,
        active: true,
      },
    });
    await this.audit.log({
      userId: adminId,
      action: 'cargo_rate_create',
      resource: 'cargo_rates',
      resourceId: rate.id,
      newValues: {
        fromZone,
        toZone,
        baseFeeFarm: input.baseFeeFarm,
        perKgFarm: input.perKgFarm,
      },
      status: 'success',
    });
    return { data: rate };
  }

  async setActive(adminId: string, id: string, active: boolean) {
    const row = await this.prisma.cargo_rates.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Rate not found');
    const updated = await this.prisma.cargo_rates.update({
      where: { id },
      data: { active },
    });
    await this.audit.log({
      userId: adminId,
      action: 'cargo_rate_active',
      resource: 'cargo_rates',
      resourceId: id,
      oldValues: { active: row.active },
      newValues: { active },
      status: 'success',
    });
    return { data: updated };
  }

  async setSplit(
    adminId: string,
    input: { farmShareBps: number; partnerShareBps: number },
  ) {
    if (
      !Number.isInteger(input.farmShareBps) ||
      !Number.isInteger(input.partnerShareBps) ||
      input.farmShareBps < 0 ||
      input.partnerShareBps < 0 ||
      input.farmShareBps + input.partnerShareBps !== 10_000
    ) {
      throw new BadRequestException(
        'Farm and partner shares must be whole basis points that sum to 10000',
      );
    }
    const row = await this.prisma.cargo_revenue_settings.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        farm_share_bps: input.farmShareBps,
        partner_share_bps: input.partnerShareBps,
      },
      update: {
        farm_share_bps: input.farmShareBps,
        partner_share_bps: input.partnerShareBps,
      },
    });
    await this.audit.log({
      userId: adminId,
      action: 'cargo_split',
      resource: 'cargo_revenue_settings',
      resourceId: '1',
      newValues: input,
      status: 'success',
    });
    return { data: row };
  }
}
