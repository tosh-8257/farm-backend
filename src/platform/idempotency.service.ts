import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export function requestHash(body: unknown) {
  return createHash('sha256').update(stableJson(body)).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
    .join(',')}}`;
}

/**
 * Durable exactly-once helper. A completed key with the same hash returns the
 * stored response. A different body on the same key is a conflict.
 */
@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    scope: string,
    key: string,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<{ replayed: boolean; result: T }> {
    const hash = requestHash(body);
    const existing = await this.prisma.idempotency_records.findUnique({
      where: { scope_idempotency_key: { scope, idempotency_key: key } },
    });
    if (existing) {
      if (existing.request_hash !== hash)
        throw new ConflictException(
          'Idempotency-Key was reused with a different request',
        );
      if (existing.status === 'completed')
        return { replayed: true, result: existing.response as T };
      if (existing.status === 'started')
        throw new ConflictException('A request with this key is still running');
    }
    if (!existing) {
      try {
        await this.prisma.idempotency_records.create({
          data: {
            scope,
            idempotency_key: key,
            request_hash: hash,
            status: 'started',
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          return this.run(scope, key, body, fn);
        }
        throw e;
      }
    }
    try {
      const result = await fn();
      await this.prisma.idempotency_records.update({
        where: { scope_idempotency_key: { scope, idempotency_key: key } },
        data: {
          status: 'completed',
          response: result as object,
          completed_at: new Date(),
        },
      });
      return { replayed: false, result };
    } catch (err) {
      await this.prisma.idempotency_records.update({
        where: { scope_idempotency_key: { scope, idempotency_key: key } },
        data: { status: 'failed' },
      });
      throw err;
    }
  }
}
