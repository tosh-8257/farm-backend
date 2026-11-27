import { BadRequestException } from '@nestjs/common';
import { CargoService, cargoTransition } from './cargo.service';

describe('cargo', () => {
  it('allows only the defined shipment steps', () => {
    expect(cargoTransition('quoted', 'booked')).toBe(true);
    expect(cargoTransition('quoted', 'delivered')).toBe(false);
  });

  it('refuses a route that has no configured rate and does not invent an ETA', async () => {
    const prisma: any = {
      cargo_rates: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new CargoService(prisma);
    await expect(svc.quote('nairobi', 'mombasa', 2)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('prices from a stored band', async () => {
    const prisma: any = {
      cargo_rates: {
        findMany: jest.fn().mockResolvedValue([
          {
            from_zone: 'nairobi',
            to_zone: 'mombasa',
            min_kg: 0,
            max_kg: 5,
            price_farm: 250,
          },
        ]),
      },
    };
    const quote = await new CargoService(prisma).quote('Nairobi', 'Mombasa', 2);
    expect(quote).toMatchObject({
      price_farm: 250,
      eta: null,
      maps_verified: false,
      farm_share_bps: 2000,
      partner_share_bps: 8000,
    });
  });

  it('prices a zone as base fee plus weight times the per-kg rate', async () => {
    const prisma: any = {
      cargo_rates: {
        findMany: jest.fn().mockResolvedValue([
          {
            from_zone: 'nairobi',
            to_zone: 'mombasa',
            base_fee_farm: 100,
            per_kg_farm: 20,
          },
        ]),
      },
      cargo_revenue_settings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ farm_share_bps: 2000, partner_share_bps: 8000 }),
      },
    };
    const quote = await new CargoService(prisma).quote('nairobi', 'mombasa', 3);
    expect(quote).toMatchObject({
      price_farm: 160,
      pricing: 'base_plus_kg',
      eta: null,
      maps_verified: false,
    });
  });

  it('will not book against a pending payment', async () => {
    const prisma: any = {
      cargo_shipments: { findUnique: jest.fn().mockResolvedValue(null) },
      cargo_rates: {
        findMany: jest.fn().mockResolvedValue([
          {
            from_zone: 'a',
            to_zone: 'b',
            min_kg: 0,
            max_kg: 10,
            price_farm: 100,
          },
        ]),
      },
      transactions: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 't', status: 'pending', amount: 100 }),
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

  it('returns a timeline without an ETA and only the caller shipments', async () => {
    const prisma: any = {
      cargo_shipments: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 's',
            from_zone: 'a',
            to_zone: 'b',
            weight_kg: 1,
            price_farm: 10,
            status: 'booked',
            payment_transaction_id: 't',
            pickup_address: '1 Market',
            delivery_address: '2 Port',
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: 's',
          from_zone: 'a',
          to_zone: 'b',
          weight_kg: 1,
          price_farm: 10,
          status: 'booked',
          payment_transaction_id: 't',
          pickup_address: '1 Market',
          delivery_address: '2 Port',
          events: [
            {
              status: 'booked',
              note: null,
              created_at: new Date('2026-01-01'),
            },
          ],
        }),
      },
    };
    const svc = new CargoService(prisma);
    const list = await svc.listMine('user-1');
    expect(list.data[0]).toMatchObject({ eta: null, maps_verified: false });
    expect(prisma.cargo_shipments.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'user-1' } }),
    );
    const detail = await svc.getMine('user-1', 's');
    expect(detail.data.timeline).toHaveLength(1);
    expect(detail.data.eta).toBeNull();
    const receipt = await svc.receipt('user-1', 's');
    expect(receipt.data.eta).toBeNull();
    expect(receipt.data.maps_verified).toBe(false);
  });
});
