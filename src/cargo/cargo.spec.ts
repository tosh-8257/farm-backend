import { BadRequestException } from '@nestjs/common';
import { CargoService, cargoTransition } from './cargo.service';

describe('cargo', () => {
  it('allows only the defined shipment steps', () => {
    expect(cargoTransition('quoted', 'booked')).toBe(true);
    expect(cargoTransition('quoted', 'delivered')).toBe(false);
  });

  it('refuses a route that has no configured rate and does not invent an ETA', async () => {
    const prisma: any = { cargo_rates: { findMany: jest.fn().mockResolvedValue([]) } };
    const svc = new CargoService(prisma);
    await expect(svc.quote('nairobi', 'mombasa', 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('prices from a stored band', async () => {
    const prisma: any = {
      cargo_rates: {
        findMany: jest.fn().mockResolvedValue([
          { from_zone: 'nairobi', to_zone: 'mombasa', min_kg: 0, max_kg: 5, price_farm: 250 },
        ]),
      },
    };
    const quote = await new CargoService(prisma).quote('Nairobi', 'Mombasa', 2);
    expect(quote).toMatchObject({ price_farm: 250, eta: null, maps_verified: false });
  });

  it('will not book against a pending payment', async () => {
    const prisma: any = {
      cargo_shipments: { findUnique: jest.fn().mockResolvedValue(null) },
      cargo_rates: {
        findMany: jest.fn().mockResolvedValue([
          { from_zone: 'a', to_zone: 'b', min_kg: 0, max_kg: 10, price_farm: 100 },
        ]),
      },
      transactions: {
        findUnique: jest.fn().mockResolvedValue({ id: 't', status: 'pending', amount: 100 }),
      },
    };
    await expect(
      new CargoService(prisma).book('u', {
        idempotencyKey: 'key-123456',
        fromZone: 'a',
        toZone: 'b',
        weightKg: 1,
        transactionId: 't',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
