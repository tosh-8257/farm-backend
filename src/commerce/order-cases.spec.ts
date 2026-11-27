import { BadRequestException } from '@nestjs/common';
import { OrderCasesService } from './order-cases.service';

describe('order cases', () => {
  function svc(order: any, existing?: any) {
    const prisma: any = {
      sales_orders: {
        findFirst: jest.fn().mockResolvedValue(order),
        update: jest.fn(),
      },
      product_variants: { update: jest.fn() },
      commerce_cases: {
        findUnique: jest.fn().mockResolvedValue(existing ?? null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'c', ...data })),
      },
      ledger_entries: { create: jest.fn() },
      wallets: { update: jest.fn() },
      $transaction: async (fn: any) => fn(prisma),
    };
    const commerce: any = {
      approvedMerchant: jest.fn().mockResolvedValue({ id: 'm' }),
    };
    return { svc: new OrderCasesService(prisma, commerce), prisma };
  }

  it('cancels an unpaid order and releases reserved stock', async () => {
    const { svc: service, prisma } = svc({
      id: 'o',
      status: 'placed',
      items: [{ variant_id: 'v', qty: 2 }],
    });
    const out = await service.cancel('u', 'o', {
      idempotencyKey: 'cancel-key',
      reason: 'Buyer changed their mind',
    });
    expect(out.replayed).toBe(false);
    expect(prisma.product_variants.update).toHaveBeenCalled();
    expect(prisma.sales_orders.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'cancelled' } }),
    );
    expect(prisma.wallets.update).not.toHaveBeenCalled();
  });

  it('refuses to cancel a paid order', async () => {
    const { svc: service } = svc({ id: 'o', status: 'paid', items: [] });
    await expect(
      service.cancel('u', 'o', {
        idempotencyKey: 'cancel-key',
        reason: 'too late',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records a return ledger memo and does not move a wallet', async () => {
    const { svc: service, prisma } = svc({
      id: 'o',
      status: 'paid',
      retail_total: 100,
      supplier_total: 70,
      commission_farm: null,
      items: [],
    });
    const out = await service.openCase('u', 'o', 'return', {
      idempotencyKey: 'return-key',
      reason: 'Damaged on arrival',
    });
    expect(out.replayed).toBe(false);
    expect(prisma.ledger_entries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entry_type: 'memo',
          category: 'dropship_return',
        }),
      }),
    );
    expect(prisma.wallets.update).not.toHaveBeenCalled();
  });

  it('replays a dispute with the same key', async () => {
    const { svc: service, prisma } = svc(
      { id: 'o', status: 'paid', items: [] },
      { id: 'c', kind: 'dispute' },
    );
    const out = await service.openCase('u', 'o', 'dispute', {
      idempotencyKey: 'dispute-key',
      reason: 'Not delivered',
    });
    expect(out).toEqual({ replayed: true, data: { id: 'c', kind: 'dispute' } });
    expect(prisma.ledger_entries.create).not.toHaveBeenCalled();
  });
});
