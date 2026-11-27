import { PayoutService, PAYOUT_HOLD_MS } from './payout.service';

describe('payout releases', () => {
  const start = new Date('2026-01-01T00:00:00Z');

  function harness(balance = 500) {
    const row = {
      id: 'pay-1',
      kind: 'supplier:s',
      subject_type: 'order',
      subject_id: 'order-1',
      payee_user_id: 'supplier-user',
      source_wallet_id: 'source',
      amount: 70,
      status: 'scheduled',
      hold_until: new Date(start.getTime() + PAYOUT_HOLD_MS),
    };
    const wallets = new Map<string, number>([
      ['source', balance],
      ['payee', 0],
    ]);
    const prisma: any = {
      payout_releases: {
        findMany: jest.fn().mockImplementation(async ({ where }) => {
          if (row.status === 'scheduled' && row.hold_until <= where.hold_until.lte)
            return [row];
          return [];
        }),
        findUnique: jest.fn().mockImplementation(async () => ({ ...row })),
        updateMany: jest.fn().mockImplementation(async ({ where, data }) => {
          if (row.status !== where.status) return { count: 0 };
          if (where.hold_until && !(row.hold_until <= where.hold_until.lte))
            return { count: 0 };
          if (data.status) row.status = data.status;
          if ('last_error' in data) row.last_error = data.last_error;
          return { count: 1 };
        }),
        update: jest.fn().mockImplementation(async ({ data }) => {
          Object.assign(row, data);
          return row;
        }),
        create: jest.fn(),
      },
      transactions: {
        create: jest.fn().mockResolvedValue({ id: 'txn-1' }),
        update: jest.fn(),
      },
      wallets: {
        findFirst: jest.fn().mockResolvedValue({ id: 'payee' }),
        findUnique: jest.fn().mockImplementation(async ({ where }) => ({
          id: where.id,
          balance: wallets.get(where.id) ?? 0,
        })),
        update: jest.fn().mockImplementation(async ({ where, data }) => {
          const next = (wallets.get(where.id) ?? 0) + data.balance.increment;
          wallets.set(where.id, next);
          return { id: where.id, balance: next };
        }),
      },
      ledger_entries: { create: jest.fn() },
      users: { findFirst: jest.fn() },
      $executeRaw: jest.fn().mockImplementation(async () => {
        if ((wallets.get('source') ?? 0) < 70) return 0;
        wallets.set('source', (wallets.get('source') ?? 0) - 70);
        return 1;
      }),
      $transaction: async (fn: any) => {
        const snapshot = row.status;
        try {
          return await fn(prisma);
        } catch (err) {
          row.status = snapshot;
          throw err;
        }
      },
    };
    const svc = new PayoutService(prisma, { log: jest.fn() } as any);
    return { svc, prisma, row, wallets };
  }

  it('does not pay during the 24 hour dispute hold', async () => {
    const { svc, prisma } = harness();
    const out = await svc.releaseDue(new Date(start.getTime() + PAYOUT_HOLD_MS - 1));
    expect(out).toEqual({ paid: 0, seen: 0 });
    expect(prisma.transactions.create).not.toHaveBeenCalled();
  });

  it('pays exactly once after the hold and writes both ledger sides', async () => {
    const { svc, prisma, wallets } = harness();
    const due = new Date(start.getTime() + PAYOUT_HOLD_MS);
    const first = await svc.releaseDue(due);
    expect(first.paid).toBe(1);
    expect(wallets.get('source')).toBe(430);
    expect(wallets.get('payee')).toBe(70);
    expect(prisma.ledger_entries.create).toHaveBeenCalledTimes(2);
    const second = await svc.releaseDue(due);
    expect(second.paid).toBe(0);
    expect(wallets.get('payee')).toBe(70);
  });

  it('leaves the payout scheduled when the source wallet cannot cover it', async () => {
    const { svc, row, wallets } = harness(10);
    row.hold_until = start;
    const out = await svc.releaseDue(start);
    expect(out.paid).toBe(0);
    expect(row.status).toBe('scheduled');
    expect(wallets.get('source')).toBe(10);
    expect(row.last_error).toContain('Insufficient');
  });
});
