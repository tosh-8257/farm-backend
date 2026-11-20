import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const NEXT: Record<string, string[]> = {
  quoted: ['booked', 'cancelled'],
  booked: ['picked_up', 'cancelled'],
  picked_up: ['in_transit'],
  in_transit: ['delivered'],
  delivered: [],
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
        events: {
          create: [{ status: 'quoted', note: 'Quote accepted' }, { status: 'booked' }],
        },
      },
    });
    return { replayed: false, shipment };
  }
}
