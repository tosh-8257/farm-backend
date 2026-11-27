import { ConflictException } from '@nestjs/common';
import { CargoAdminService } from './cargo-admin.service';

describe('cargo admin rates', () => {
  it('refuses an overlapping active band', async () => {
    const prisma: any = {
      cargo_rates: {
        findMany: jest.fn().mockResolvedValue([
          { min_kg: 0, max_kg: 5 },
        ]),
        create: jest.fn(),
      },
    };
    const svc = new CargoAdminService(prisma, { log: jest.fn() } as any);
    await expect(
      svc.create('admin', {
        fromZone: 'Nairobi',
        toZone: 'Mombasa',
        minKg: 4,
        maxKg: 8,
        priceFarm: 100,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.cargo_rates.create).not.toHaveBeenCalled();
  });

  it('lists distinct active zone names', async () => {
    const prisma: any = {
      cargo_rates: {
        findMany: jest.fn().mockResolvedValue([
          { from_zone: 'nairobi', to_zone: 'mombasa' },
          { from_zone: 'mombasa', to_zone: 'kisumu' },
        ]),
      },
    };
    const out = await new CargoAdminService(prisma, { log: jest.fn() } as any).zones();
    expect(out.data).toEqual(['kisumu', 'mombasa', 'nairobi']);
  });
});
