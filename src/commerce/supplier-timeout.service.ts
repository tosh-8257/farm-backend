import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { Optional } from '@nestjs/common';
import { EcosystemNotifyService } from '../notifications/ecosystem-notify.service';

/** Hours a supplier may leave a fulfilment pending before it is dead-lettered. */
export function supplierDecisionHours(
  env: Record<string, string | undefined> = process.env,
) {
  const n = Number(env.SUPPLIER_DECISION_HOURS ?? 48);
  if (!Number.isFinite(n) || n < 1) return 48;
  return Math.min(Math.floor(n), 24 * 30);
}

@Injectable()
export class SupplierTimeoutService {
  private readonly log = new Logger(SupplierTimeoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notify?: EcosystemNotifyService,
  ) {}

  @Interval('supplier-timeout', 300_000)
  async tick() {
    try {
      await this.sweep();
    } catch (err) {
      this.log.error(
        `Supplier timeout sweep failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async sweep(now = new Date()) {
    const cutoff = new Date(now.getTime() - supplierDecisionHours() * 3600_000);
    const rows = await this.prisma.supplier_fulfilments.findMany({
      where: { status: 'pending', created_at: { lt: cutoff } },
      take: 50,
    });
    let dead = 0;
    for (const row of rows) {
      const claim = await this.prisma.supplier_fulfilments.updateMany({
        where: { id: row.id, status: 'pending' },
        data: { status: 'timed_out' },
      });
      if (!claim.count) continue;
      try {
        await this.prisma.platform_jobs.create({
          data: {
            kind: 'supplier_timeout',
            idempotency_key: `timeout:${row.id}`,
            status: 'dead',
            attempts: 1,
            payload: { fulfilment_id: row.id, order_id: row.order_id },
            last_error: 'Supplier did not decide before the deadline',
          },
        });
      } catch (err) {
        if (
          !(err instanceof Prisma.PrismaClientKnownRequestError) ||
          err.code !== 'P2002'
        )
          throw err;
      }
      const order = await this.prisma.sales_orders.findUnique({
        where: { id: row.order_id },
      });
      const merchant = order
        ? await this.prisma.merchants.findUnique({
            where: { id: order.merchant_id },
          })
        : null;
      await this.notify?.once(
        merchant?.user_id,
        `fulfilment:${row.id}:timed_out`,
        'Order update',
        'A supplier did not respond in time.',
      );
      this.log.error(`ALERT supplier fulfilment ${row.id} dead-lettered`);
      dead += 1;
    }
    return { dead };
  }
}
