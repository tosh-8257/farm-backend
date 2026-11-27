import { BadRequestException, ConflictException } from '@nestjs/common';
import { httpsImageUrl } from './catalogue';
import { CatalogueService } from './catalogue.service';

describe('catalogue images', () => {
  it('accepts https and rejects anything else', () => {
    expect(httpsImageUrl(' https://cdn.example/a.png ')).toBe(
      'https://cdn.example/a.png',
    );
    expect(httpsImageUrl('')).toBeNull();
    expect(() => httpsImageUrl('http://cdn.example/a.png')).toThrow(
      BadRequestException,
    );
    expect(() => httpsImageUrl('javascript:alert(1)')).toThrow(
      BadRequestException,
    );
  });
});

describe('catalogue stock', () => {
  function svc(prior?: { stock: number } | null) {
    const prisma: any = {
      product_variants: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'v',
          stock: 5,
          reserved: 2,
        }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'v', stock: prior?.stock ?? 5 }),
        update: jest.fn().mockResolvedValue({ id: 'v', stock: 4 }),
      },
      variant_stock_writes: {
        findUnique: jest
          .fn()
          .mockResolvedValue(prior ? { stock: prior.stock } : null),
        create: jest.fn(),
      },
      $transaction: async (fn: any) => fn(prisma),
    };
    const commerce: any = {
      ownSupplier: jest.fn().mockResolvedValue({ id: 's' }),
    };
    return { svc: new CatalogueService(prisma, commerce), prisma };
  }

  it('replays a stock write and does not update again', async () => {
    const { svc: service, prisma } = svc({ stock: 9 });
    const out = await service.setStock('u', 'v', {
      idempotencyKey: 'same-key-1',
      stock: 1,
    });
    expect(out.replayed).toBe(true);
    expect(prisma.product_variants.update).not.toHaveBeenCalled();
  });

  it('refuses stock below reserved units', async () => {
    const { svc: service } = svc(null);
    await expect(
      service.setStock('u', 'v', { idempotencyKey: 'key-12345', stock: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
