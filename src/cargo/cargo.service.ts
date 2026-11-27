import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const NEXT: Record<string, string[]> = {
  quoted: ['booked', 'cancelled'],
  booked: ['picked_up', 'cancelled', 'failed'],
  picked_up: ['in_transit', 'failed'],
  in_transit: ['delivered', 'failed'],
  delivered: [],
  failed: [],
  cancelled: [],
};

export function cargoTransition(from: string, to: string) {
  return (NEXT[from] ?? []).includes(to);
}

/**
 * Quotes come only from cargo_rates rows. There is no maps call and no
 * invented ETA. A route with no active band is unsupported.
 */
@Injectable()
export class CargoService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(fromZone: string, toZone: string, weightKg: number) {
    if (!(weightKg > 0)) throw new BadRequestException('Weight must be positive');
    const rates = await this.prisma.cargo_rates.findMany({
      where: {
        from_zone: fromZone.trim().toLowerCase(),
        to_zone: toZone.trim().toLowerCase(),
        active: true,
      },
    });
    const rate = rates.find(
      (row) => weightKg >= Number(row.min_kg) && weightKg <= Number(row.max_kg),
    );
    if (!rate)
      throw new BadRequestException(
        'This route is not offered. No live courier or map quote was requested.',
      );
    return {
      from_zone: rate.from_zone,
      to_zone: rate.to_zone,
      weight_kg: weightKg,
      price_farm: Number(rate.price_farm),
      eta: null,
      maps_verified: false as const,
    };
  }

  async book(
    userId: string,
    input: {
      idempotencyKey: string;
      fromZone: string;
      toZone: string;
      weightKg: number;
      transactionId: string;
      pickupAddress?: string;
      deliveryAddress?: string;
    },
  ) {
    const existing = await this.prisma.cargo_shipments.findUnique({
      where: {
        user_id_idempotency_key: {
          user_id: userId,
          idempotency_key: input.idempotencyKey,
        },
      },
    });
    if (existing) return { replayed: true, shipment: existing };
    const quote = await this.quote(input.fromZone, input.toZone, input.weightKg);
    const payment = await this.prisma.transactions.findUnique({
      where: { id: input.transactionId },
    });
    if (!payment || payment.status !== 'completed')
      throw new BadRequestException('Cargo payment is not completed on the server');
    if (Math.abs(Number(payment.amount) - quote.price_farm) > 0.01)
      throw new BadRequestException('Payment amount does not match the quote');
    const shipment = await this.prisma.cargo_shipments.create({
      data: {
        user_id: userId,
        idempotency_key: input.idempotencyKey,
        from_zone: quote.from_zone,
        to_zone: quote.to_zone,
        weight_kg: input.weightKg,
        price_farm: quote.price_farm,
        status: 'booked',
        payment_transaction_id: input.transactionId,
        pickup_address: this.address(input.pickupAddress),
        delivery_address: this.address(input.deliveryAddress),
        events: {
          create: [{ status: 'quoted', note: 'Quote accepted' }, { status: 'booked' }],
        },
      },
    });
    return { replayed: false, shipment };
  }

  /**
   * Any signed-in personal, merchant, or business user lists only their own
   * shipments. There is no merchant-only gate on quote or book.
   */
  async listMine(userId: string) {
    const rows = await this.prisma.cargo_shipments.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return { data: rows.map((row) => this.publicShipment(row)) };
  }

  async getMine(userId: string, id: string) {
    const row = await this.prisma.cargo_shipments.findFirst({
      where: { id, user_id: userId },
      include: { events: { orderBy: { created_at: 'asc' } } },
    });
    if (!row) throw new NotFoundException('Shipment not found');
    return { data: this.publicShipment(row) };
  }

  async receipt(userId: string, id: string) {
    const body = await this.getMine(userId, id);
    return {
      data: {
        shipment_id: body.data.id,
        price_farm: body.data.price_farm,
        from_zone: body.data.from_zone,
        to_zone: body.data.to_zone,
        weight_kg: body.data.weight_kg,
        pickup_address: body.data.pickup_address,
        delivery_address: body.data.delivery_address,
        payment_transaction_id: body.data.payment_transaction_id,
        status: body.data.status,
        eta: null,
        maps_verified: false as const,
      },
    };
  }

  private address(raw?: string) {
    if (raw == null || raw.trim() === '') return null;
    const value = raw.trim();
    if (value.length < 3 || value.length > 300)
      throw new BadRequestException('Address must be between 3 and 300 characters');
    return value;
  }

  private publicShipment(row: {
    id: string;
    from_zone: string;
    to_zone: string;
    weight_kg: unknown;
    price_farm: unknown;
    status: string;
    payment_transaction_id: string | null;
    pickup_address?: string | null;
    delivery_address?: string | null;
    events?: { status: string; note: string | null; created_at: Date }[];
  }) {
    return {
      id: row.id,
      from_zone: row.from_zone,
      to_zone: row.to_zone,
      weight_kg: Number(row.weight_kg),
      price_farm: Number(row.price_farm),
      status: row.status,
      payment_transaction_id: row.payment_transaction_id,
      pickup_address: row.pickup_address ?? null,
      delivery_address: row.delivery_address ?? null,
      eta: null,
      maps_verified: false as const,
      timeline: (row.events ?? []).map((event) => ({
        status: event.status,
        note: event.note,
        created_at: event.created_at,
      })),
    };
  }
}
