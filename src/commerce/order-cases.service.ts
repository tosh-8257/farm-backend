import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Optional } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { EcosystemNotifyService } from '../notifications/ecosystem-notify.service';
import { CommerceService } from './commerce.service';
import { listQuery } from './list-query';

const PAID = ['paid', 'forwarded', 'accepted', 'fulfilled'];

/**
 * Cancellations, returns, and disputes stay inside FARM.
 * A ledger row is written for a return or dispute. Wallet balances are not moved.
 */
@Injectable()
export class OrderCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commerce: CommerceService,
    @Optional()
    private readonly payouts?: { freezeOrder(orderId: string): Promise<unknown> },
    @Optional() private readonly notify?: EcosystemNotifyService,
  ) {}

  async listForMerchant(
    userId: string,
    query: { page?: string; limit?: string; sort?: string; status?: string } = {},
  ) {
    const merchant = await this.commerce.approvedMerchant(userId);
    const list = listQuery(query);
    const orders = await this.prisma.sales_orders.findMany({
      where: {
        merchant_id: merchant.id,
        ...(list.status ? { status: list.status } : {}),
      },
      include: { items: true },
      orderBy: { created_at: list.order },
      skip: list.skip,
      take: list.limit,
    });
    return { data: orders, meta: { page: list.page, limit: list.limit, sort: list.order } };
  }

  async listForSupplier(
    userId: string,
    query: { page?: string; limit?: string; sort?: string; status?: string } = {},
  ) {
    const supplier = await this.commerce.ownSupplier(userId);
    const list = listQuery(query);
    const rows = await this.prisma.supplier_fulfilments.findMany({
      where: {
        supplier_id: supplier.id,
        ...(list.status ? { status: list.status } : {}),
      },
      orderBy: { created_at: list.order },
      skip: list.skip,
      take: list.limit,
    });
    return { data: rows, meta: { page: list.page, limit: list.limit, sort: list.order } };
  }

  async cancel(
    userId: string,
    orderId: string,
    input: { idempotencyKey: string; reason: string },
  ) {
    this.requireKey(input.idempotencyKey, input.reason);
    const merchant = await this.commerce.approvedMerchant(userId);
    const existing = await this.findCase(orderId, input.idempotencyKey);
    if (existing) return { replayed: true, data: existing };
    const order = await this.owned(orderId, merchant.id);
    if (order.status === 'cancelled')
      throw new ConflictException('This order is already cancelled');
    if (order.status !== 'placed')
      throw new BadRequestException(
        'A paid order cannot be cancelled. Open a return or a dispute.',
      );
    const row = await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product_variants.update({
          where: { id: item.variant_id },
          data: { reserved: { decrement: item.qty } },
        });
      }
      await tx.sales_orders.update({
        where: { id: orderId },
        data: { status: 'cancelled' },
      });
      return tx.commerce_cases.create({
        data: {
          order_id: orderId,
          kind: 'cancellation',
          status: 'closed',
          reason: input.reason.trim(),
          idempotency_key: input.idempotencyKey,
          opened_by: userId,
          ledger: { balances_moved: false },
        },
      });
    });
    await this.notify?.once(
      userId,
      `order:${orderId}:cancelled`,
      'Order update',
      'An order on your account was updated.',
    );
    return { replayed: false, data: row };
  }

  async openCase(
    userId: string,
    orderId: string,
    kind: 'return' | 'dispute',
    input: { idempotencyKey: string; reason: string },
  ) {
    this.requireKey(input.idempotencyKey, input.reason);
    const merchant = await this.commerce.approvedMerchant(userId);
    const existing = await this.findCase(orderId, input.idempotencyKey);
    if (existing) {
      if (existing.kind !== kind)
        throw new ConflictException(
          'Idempotency key was used for a different case',
        );
      return { replayed: true, data: existing };
    }
    const order = await this.owned(orderId, merchant.id);
    if (!PAID.includes(order.status))
      throw new BadRequestException(
        'Returns and disputes start from a paid order',
      );
    if (kind === 'dispute') await this.payouts?.freezeOrder(orderId);
    const ledger = {
      balances_moved: false,
      retail: Number(order.retail_total),
      supplier_payable: Number(order.supplier_total),
      commission_farm:
        order.commission_farm == null ? null : Number(order.commission_farm),
      category: kind === 'return' ? 'dropship_return' : 'dropship_dispute',
    };
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.commerce_cases.create({
          data: {
            order_id: orderId,
            kind,
            reason: input.reason.trim(),
            idempotency_key: input.idempotencyKey,
            opened_by: userId,
            ledger,
          },
        });
        await tx.ledger_entries.create({
          data: {
            entry_type: 'memo',
            amount: order.retail_total,
            category: ledger.category,
            description:
              'Dropshipping case recorded. Wallet balances were not changed.',
          },
        });
        return created;
      });
      await this.notify?.once(
        userId,
        `order:${orderId}:${kind}`,
        'Order update',
        'An order on your account was updated.',
      );
      return { replayed: false, data: row };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const again = await this.findCase(orderId, input.idempotencyKey);
        return { replayed: true, data: again };
      }
      throw e;
    }
  }

  private requireKey(key: string, reason: string) {
    if (!key || key.length < 8)
      throw new BadRequestException('Idempotency key is required');
    if (!reason?.trim()) throw new BadRequestException('A reason is required');
  }

  private async owned(orderId: string, merchantId: string) {
    const order = await this.prisma.sales_orders.findFirst({
      where: { id: orderId, merchant_id: merchantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private findCase(orderId: string, key: string) {
    return this.prisma.commerce_cases.findUnique({
      where: {
        order_id_idempotency_key: { order_id: orderId, idempotency_key: key },
      },
    });
  }
}
