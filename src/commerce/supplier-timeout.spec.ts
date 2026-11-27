import { SupplierTimeoutService } from './supplier-timeout.service';

describe('supplier timeout', () => {
  it('dead-letters a fulfilment the supplier left pending', async () => {
    const row = { id: 'f', order_id: 'o', status: 'pending' };
    const prisma: any = {
      supplier_fulfilments: {
        findMany: jest.fn().mockResolvedValue([row]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      platform_jobs: { create: jest.fn() },
      sales_orders: { findUnique: jest.fn().mockResolvedValue({ merchant_id: 'm' }) },
      merchants: { findUnique: jest.fn().mockResolvedValue({ user_id: 'seller' }) },
    };
    const notify = { once: jest.fn() };
    const out = await new SupplierTimeoutService(prisma, notify as any).sweep(
      new Date('2026-02-01'),
    );
    expect(out.dead).toBe(1);
    expect(prisma.platform_jobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'dead', kind: 'supplier_timeout' }),
      }),
    );
    expect(notify.once).toHaveBeenCalledWith(
      'seller',
      'fulfilment:f:timed_out',
      'Order update',
      'A supplier did not respond in time.',
    );
  });
});
