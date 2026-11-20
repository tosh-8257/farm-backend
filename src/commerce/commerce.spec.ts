import { BadRequestException } from '@nestjs/common';
import {
  commissionBps,
  commissionFarm,
  margin,
  orderTransition,
  supplierAdminTransition,
} from './order-rules';
import { CommerceService } from './commerce.service';

describe('dropshipping rules', () => {
  it('does not assume a 10% commission when the env is unset', () => {
    expect(commissionBps({})).toBeNull();
    expect(commissionFarm(1000, null)).toBeNull();
    expect(margin(1000, 700, null)).toMatchObject({
      estimated_net: 300,
      commission_configured: false,
    });
  });

  it('uses a configured basis-point rate', () => {
    expect(commissionBps({ DROPSHIP_COMMISSION_BPS: '1000' })).toBe(1000);
    expect(commissionFarm(1000, 1000)).toBe(100);
  });

  it('only allows the order and supplier transitions that are defined', () => {
    expect(orderTransition('placed', 'paid')).toBe(true);
    expect(orderTransition('placed', 'forwarded')).toBe(false);
    expect(supplierAdminTransition('submitted', 'approved')).toBe(true);
    expect(supplierAdminTransition('draft', 'approved')).toBe(false);
  });
});

describe('markPaid', () => {
  it('rejects a client success when the server transaction is not completed', async () => {
    const prisma: any = {
      transactions: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 't', status: 'pending', amount: 10 }),
      },
      sales_orders: { findUnique: jest.fn(), update: jest.fn() },
    };
    const svc = new CommerceService(prisma, { log: jest.fn() } as any);
    await expect(svc.markPaid('o', 't')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.sales_orders.update).not.toHaveBeenCalled();
  });

  it('marks paid once when the completed amount matches', async () => {
    const prisma: any = {
      transactions: {
        findUnique: jest.fn().mockResolvedValue({
          id: 't',
          status: 'completed',
          amount: 100,
        }),
      },
      sales_orders: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'o',
          status: 'placed',
          retail_total: 100,
          payment_transaction_id: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'o', status: 'paid' }),
      },
    };
    const svc = new CommerceService(prisma, { log: jest.fn() } as any);
    const row = await svc.markPaid('o', 't');
    expect(row.status).toBe('paid');
  });
});
