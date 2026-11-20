import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { money } from './order-rules';

/**
 * Records the split for a paid order exactly once. Wallet balances are not
 * changed: supplier and partner payout destinations are not configured.
 */
@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async record(orderId: string) {
    const existing = await this.prisma.commerce_settlements.findUnique({
      where: { order_id: orderId },
    });
    if (existing) return { replayed: true, settlement: existing };
    const order = await this.prisma.sales_orders.findUnique({ where: { id: orderId } });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.payment_transaction_id || !['paid', 'forwarded', 'accepted', 'fulfilled'].includes(order.status))
      throw new BadRequestException('Only a paid order can be settled');
    const retail = Number(order.retail_total);
    const supplier = Number(order.supplier_total);
    const commission = Number(order.commission_farm ?? 0);
    const seller = money(retail - supplier - commission);
    if (seller < -0.01)
      throw new BadRequestException('Settlement does not balance');
    const lines = [
      { bucket: 'collection', amount: money(retail) },
      { bucket: 'supplier_payable', amount: money(supplier) },
      { bucket: 'farm_commission', amount: money(commission) },
      { bucket: 'seller_net', amount: seller },
    ];
    try {
      const settlement = await this.prisma.commerce_settlements.create({
        data: {
          order_id: orderId,
          retail: money(retail),
          supplier_payable: money(supplier),
          commission_farm: money(commission),
          seller_net: seller,
          lines,
          status: 'recorded',
        },
      });
      return { replayed: false, settlement };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const row = await this.prisma.commerce_settlements.findUnique({
          where: { order_id: orderId },
        });
        return { replayed: true, settlement: row };
      }
      throw e;
    }
  }
}
