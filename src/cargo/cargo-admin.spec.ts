import { ConflictException } from '@nestjs/common';
import { CargoAdminService } from './cargo-admin.service';

describe('cargo admin rates', () => {
  it('refuses a second active rate for the same zones', async () => {
    const prisma: any = {
      cargo_rates: {
        findFirst: jest.fn().mockResolvedValue({ id: 'old' }),
        create: jest.fn(),
      },
    };
    const svc = new CargoAdminService(prisma, { log: jest.fn() } as any);
    await expect(
      svc.create('admin', {
        fromZone: 'Nairobi',
        toZone: 'Mombasa',
        baseFeeFarm: 50,
        perKgFarm: 10,
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
