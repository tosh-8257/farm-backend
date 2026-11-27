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
      minKg: number;
      maxKg: number;
      priceFarm: number;
    },
  ) {
    const fromZone = input.fromZone.trim().toLowerCase();
    const toZone = input.toZone.trim().toLowerCase();
    if (!fromZone || !toZone)
      throw new BadRequestException('Both zones are required');
    if (!(input.maxKg >= input.minKg) || input.minKg < 0)
      throw new BadRequestException('Weight band is invalid');
    if (!(input.priceFarm > 0))
      throw new BadRequestException('Price must be positive');
    const existing = await this.prisma.cargo_rates.findMany({
      where: { from_zone: fromZone, to_zone: toZone, active: true },
    });
    const overlap = existing.some(
      (row) =>
        input.minKg <= Number(row.max_kg) && input.maxKg >= Number(row.min_kg),
    );
    if (overlap)
      throw new ConflictException('This weight band overlaps an active rate');
    const rate = await this.prisma.cargo_rates.create({
      data: {
        from_zone: fromZone,
        to_zone: toZone,
        min_kg: input.minKg,
        max_kg: input.maxKg,
        price_farm: input.priceFarm,
        active: true,
      },
    });
    await this.audit.log({
      userId: adminId,
      action: 'cargo_rate_create',
      resource: 'cargo_rates',
      resourceId: rate.id,
      newValues: { fromZone, toZone, priceFarm: input.priceFarm },
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
}
