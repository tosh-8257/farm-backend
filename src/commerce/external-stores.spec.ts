import { ServiceUnavailableException } from '@nestjs/common';
import { ExternalStoresService } from './external-stores.service';

describe('external stores', () => {
  const prev = process.env.SHOPIFY_ENABLED;
  afterEach(() => {
    if (prev === undefined) delete process.env.SHOPIFY_ENABLED;
    else process.env.SHOPIFY_ENABLED = prev;
  });

  it('stores a connection as unverified and does not claim a provider call', async () => {
    process.env.SHOPIFY_ENABLED = 'true';
    const prisma: any = {
      external_store_connections: {
        upsert: jest.fn().mockResolvedValue({ id: 'c', status: 'unverified' }),
      },
    };
    const svc = new ExternalStoresService(prisma);
    const res = await svc.connect('b', 'shopify', 'Shop.Example.com');
    expect(res.verified).toBe(false);
    expect(res.connection.status).toBe('unverified');
    expect(
      prisma.external_store_connections.upsert.mock.calls[0][0].create
        .shop_domain,
    ).toBe('shop.example.com');
  });

  it('refuses sync even when the flag is on', async () => {
    process.env.SHOPIFY_ENABLED = 'true';
    const prisma: any = {
      external_store_connections: {
        findUnique: jest.fn(),
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'c', platform: 'shopify' }),
      },
      external_store_sync_jobs: { create: jest.fn() },
    };
    const svc = new ExternalStoresService(prisma);
    await expect(svc.sync('b', 'c')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(prisma.external_store_sync_jobs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'refused' }),
      }),
    );
  });
});
