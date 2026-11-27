import { existsSync, readFileSync } from 'fs';
import { ConflictException } from '@nestjs/common';
import { IdempotencyService, requestHash } from './idempotency.service';
import { PlatformJobsService } from './platform-jobs.service';
import { integrationConfig } from './integration-config';
import { farmRuntime } from './runtime';
import { isOperationalPermission } from './permissions';
import { platformStatus } from './platform-status';
import { PlatformController } from './platform.controller';

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

describe('public platform status', () => {
  const shipped = [
    'dropshipping_lite',
    'supplier_portal',
    'cargo_quotes',
    'cargo_bookings',
    'partner_assignment',
    'settlement_records',
    'escrow_payments',
    'payouts',
    'partner_applications',
  ];

  function enabled(body: ReturnType<typeof platformStatus>, id: string) {
    return body.data.modules.find((row) => row.id === id)?.enabled;
  }

  function integration(
    body: ReturnType<typeof platformStatus>,
    provider: string,
  ) {
    return body.data.integrations.find((row) => row.provider === provider);
  }

  it('reports shipped modules on and external providers off', () => {
    const body = platformStatus({});
    expect(body.data.runtime).toBe('development');
    for (const id of shipped) {
      expect(body.data.modules.find((row) => row.id === id)).toEqual({
        id,
        enabled: true,
        gated_by: null,
      });
    }
    for (const provider of ['shopify', 'woocommerce', 'maps', 'x402']) {
      expect(integration(body, provider)).toMatchObject({
        provider,
        enabled: false,
        verified: false,
      });
      expect(enabled(body, provider)).toBe(false);
    }
    expect(body.data.commission).toEqual({ enabled: false, bps: null });
    expect(enabled(body, 'commission')).toBe(false);
  });

  it('does not turn shipped modules off for staging or production', () => {
    for (const runtime of ['staging', 'production']) {
      const body = platformStatus({ FARM_RUNTIME: runtime });
      expect(body.data.runtime).toBe(runtime);
      expect(shipped.every((id) => enabled(body, id) === true)).toBe(true);
    }
  });

  it('enables an integration only when its flag is the string true', () => {
    const body = platformStatus({
      SHOPIFY_ENABLED: 'true',
      WOOCOMMERCE_ENABLED: 'yes',
      MAPS_ENABLED: 'true',
      X402_ENABLED: 'true',
    });
    expect(integration(body, 'shopify')?.enabled).toBe(true);
    expect(integration(body, 'shopify')?.verified).toBe(false);
    expect(integration(body, 'woocommerce')?.enabled).toBe(false);
    expect(integration(body, 'maps')).toMatchObject({
      enabled: true,
      verified: false,
    });
    expect(integration(body, 'x402')?.enabled).toBe(true);
    expect(enabled(body, 'shopify')).toBe(true);
    expect(enabled(body, 'woocommerce')).toBe(false);
  });

  it('enables commission only when DROPSHIP_COMMISSION_BPS is a valid rate', () => {
    expect(platformStatus({}).data.commission.enabled).toBe(false);
    expect(
      platformStatus({ DROPSHIP_COMMISSION_BPS: '' }).data.commission.enabled,
    ).toBe(false);
    expect(
      platformStatus({ DROPSHIP_COMMISSION_BPS: '10%' }).data.commission
        .enabled,
    ).toBe(false);
    const on = platformStatus({ DROPSHIP_COMMISSION_BPS: '1000' });
    expect(on.data.commission).toEqual({ enabled: true, bps: 1000 });
    expect(enabled(on, 'commission')).toBe(true);
    expect(shipped.every((id) => enabled(on, id) === true)).toBe(true);
  });

  it('returns that body from the public controller', () => {
    expect(new PlatformController().status()).toEqual(platformStatus());
  });

  it('keeps phase 1-6 migrations on the deploy start command', () => {
    expect(readFileSync('start.sh', 'utf8')).toContain(
      'prisma/build/index.js migrate deploy',
    );
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: { start: string };
    };
    expect(pkg.scripts.start).toContain('migrate deploy');
    for (const dir of [
      '20261128090000_phase1_foundation',
      '20261128100000_phase2_dropshipping',
      '20261128110000_phase3_external_stores',
      '20261128120000_phase4_cargo',
      '20261128130000_phase5_dispatch',
      '20261128140000_phase6_settlements',
    ]) {
      expect(existsSync(`prisma/migrations/${dir}/migration.sql`)).toBe(true);
    }
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
