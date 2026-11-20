import { BadRequestException } from '@nestjs/common';
import { SettlementService } from './settlement.service';

describe('settlement', () => {
  const order = {
    id: 'o',
    status: 'paid',
    payment_transaction_id: 't',
    retail_total: 1000,
    supplier_total: 700,
    commission_farm: 100,
  };

  it('records the split once and does not touch wallets', async () => {
    const prisma: any = {
      commerce_settlements: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 's' }),
        create: jest.fn().mockResolvedValue({ id: 's', seller_net: 200, status: 'recorded' }),
      },
      sales_orders: { findUnique: jest.fn().mockResolvedValue(order) },
      wallets: { update: jest.fn() },
    };
    const svc = new SettlementService(prisma);
    const first = await svc.record('o');
    expect(first.replayed).toBe(false);
    expect(first.settlement.seller_net).toBe(200);
    expect(prisma.wallets.update).not.toHaveBeenCalled();
    prisma.commerce_settlements.findUnique.mockResolvedValue({ id: 's', seller_net: 200 });
    const second = await svc.record('o');
    expect(second.replayed).toBe(true);
    expect(prisma.commerce_settlements.create).toHaveBeenCalledTimes(1);
  });

  it('refuses an unpaid order', async () => {
    const prisma: any = {
      commerce_settlements: { findUnique: jest.fn().mockResolvedValue(null) },
      sales_orders: {
        findUnique: jest.fn().mockResolvedValue({ ...order, status: 'placed', payment_transaction_id: null }),
      },
    };
    await expect(new SettlementService(prisma).record('o')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
