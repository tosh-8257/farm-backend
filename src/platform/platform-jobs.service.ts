import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type JobHandler = (payload: unknown) => Promise<void>;

/**
 * Durable job queue. Enqueue is idempotent on kind + key. processDue runs
 * due rows inside this process. A Redis worker is optional and not required
 * for correctness.
 */
@Injectable()
export class PlatformJobsService {
  private readonly log = new Logger(PlatformJobsService.name);
  private readonly handlers = new Map<string, JobHandler>();

  constructor(private readonly prisma: PrismaService) {}

  register(kind: string, handler: JobHandler) {
    this.handlers.set(kind, handler);
  }

  async enqueue(kind: string, idempotencyKey: string, payload: unknown) {
    try {
      const row = await this.prisma.platform_jobs.create({
        data: {
          kind,
          idempotency_key: idempotencyKey,
          payload: payload as object,
          status: 'queued',
        },
      });
      return { created: true, id: row.id, status: row.status };
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        const row = await this.prisma.platform_jobs.findUnique({
          where: {
            kind_idempotency_key: { kind, idempotency_key: idempotencyKey },
          },
        });
        return { created: false, id: row?.id, status: row?.status };
      }
      throw e;
    }
  }

  async processDue(now = new Date(), limit = 20) {
    const due = await this.prisma.platform_jobs.findMany({
      where: { status: { in: ['queued', 'failed'] }, run_after: { lte: now } },
      orderBy: { run_after: 'asc' },
      take: limit,
    });
    let ran = 0;
    for (const job of due) {
      const claim = await this.prisma.platform_jobs.updateMany({
        where: { id: job.id, status: job.status },
        data: { status: 'running', attempts: { increment: 1 } },
      });
      if (!claim.count) continue;
      const handler = this.handlers.get(job.kind);
      if (!handler) {
        await this.prisma.platform_jobs.update({
          where: { id: job.id },
          data: { status: 'failed', last_error: 'No handler registered' },
        });
        continue;
      }
      try {
        await handler(job.payload);
        await this.prisma.platform_jobs.update({
          where: { id: job.id },
          data: { status: 'succeeded', last_error: null },
        });
        ran++;
      } catch (err) {
        const attempts = job.attempts + 1;
        const dead = attempts >= job.max_attempts;
        await this.prisma.platform_jobs.update({
          where: { id: job.id },
          data: {
            status: dead ? 'dead' : 'failed',
            last_error: String((err as Error)?.message ?? err).slice(0, 300),
            run_after: new Date(Date.now() + attempts * 30_000),
          },
        });
      }
    }
    return { ran, seen: due.length };
  }

  @Interval('platform-jobs', 30_000)
  async tick() {
    try {
      await this.processDue();
    } catch (e) {
      this.log.warn(`platform job tick failed: ${(e as Error)?.message ?? e}`);
    }
  }
}
