import { ConflictException } from '@nestjs/common';
import { IdempotencyService, requestHash } from './idempotency.service';
import { PlatformJobsService } from './platform-jobs.service';
import { integrationConfig } from './integration-config';
import { farmRuntime } from './runtime';
import { isOperationalPermission } from './permissions';

describe('runtime and integrations', () => {
  it('treats FARM_RUNTIME=staging as staging even when NODE_ENV is production', () => {
    expect(
      farmRuntime({ NODE_ENV: 'production', FARM_RUNTIME: 'staging' }),
    ).toBe('staging');
    expect(farmRuntime({ NODE_ENV: 'production' })).toBe('production');
  });

  it('keeps external providers unverified and off by default', () => {
    const rows = integrationConfig({});
    expect(rows.every((r) => r.verified === false && r.enabled === false)).toBe(
      true,
    );
    const on = integrationConfig({ SHOPIFY_ENABLED: 'true' });
    expect(on.find((r) => r.provider === 'shopify')).toMatchObject({
      enabled: true,
      verified: false,
    });
  });

  it('does not invent a fourth customer role', () => {
    expect(isOperationalPermission('supplier:manage_own')).toBe(true);
    expect(isOperationalPermission('super_customer')).toBe(false);
  });
});

describe('idempotency', () => {
  function svc(existing?: any) {
    const prisma: any = {
      idempotency_records: {
        findUnique: jest.fn().mockResolvedValue(existing ?? null),
        create: jest.fn().mockResolvedValue({ id: 'i' }),
        update: jest.fn(),
      },
    };
    return { svc: new IdempotencyService(prisma), prisma };
  }

  it('hashes objects independently of key order', () => {
    expect(requestHash({ b: 1, a: 2 })).toBe(requestHash({ a: 2, b: 1 }));
  });

  it('replays a completed response and rejects a different body', async () => {
    const hash = requestHash({ amount: 5 });
    const done = svc({
      request_hash: hash,
      status: 'completed',
      response: { ok: true },
    });
    const replay = await done.svc.run(
      'orders',
      'k1',
      { amount: 5 },
      async () => ({
        ok: false,
      }),
    );
    expect(replay).toEqual({ replayed: true, result: { ok: true } });
    await expect(
      done.svc.run('orders', 'k1', { amount: 9 }, async () => ({})),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('stores the first result', async () => {
    const { svc: service, prisma } = svc();
    const out = await service.run('orders', 'k', { n: 1 }, async () => ({
      n: 1,
    }));
    expect(out).toEqual({ replayed: false, result: { n: 1 } });
    expect(prisma.idempotency_records.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });
});

describe('platform jobs', () => {
  it('runs a due job once and records success', async () => {
    const job = {
      id: 'j',
      kind: 'ping',
      status: 'queued',
      attempts: 0,
      max_attempts: 5,
      payload: { n: 1 },
    };
    const prisma: any = {
      platform_jobs: {
        findMany: jest.fn().mockResolvedValue([job]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
    };
    const jobs = new PlatformJobsService(prisma);
    const seen: unknown[] = [];
    jobs.register('ping', async (payload) => {
      seen.push(payload);
    });
    const result = await jobs.processDue();
    expect(result.ran).toBe(1);
    expect(seen).toEqual([{ n: 1 }]);
    expect(prisma.platform_jobs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    );
  });

  it('does not double-run a job another worker claimed', async () => {
    const prisma: any = {
      platform_jobs: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'j',
            kind: 'ping',
            status: 'queued',
            attempts: 0,
            max_attempts: 5,
            payload: {},
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    };
    const jobs = new PlatformJobsService(prisma);
    jobs.register('ping', async () => {
      throw new Error('should not run');
    });
    expect(await jobs.processDue()).toEqual({ ran: 0, seen: 1 });
  });
});
