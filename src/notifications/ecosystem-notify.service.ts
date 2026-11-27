import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * In-app notices for commerce events. The body does not include amounts,
 * addresses, or another person's name. The same event key is sent once.
 */
@Injectable()
export class EcosystemNotifyService {
  private readonly log = new Logger(EcosystemNotifyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async once(userId: string | null | undefined, eventKey: string, title: string, body: string) {
    if (!userId) return { sent: false };
    try {
      await this.prisma.event_notices.create({
        data: { event_key: eventKey, user_id: userId },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      )
        return { sent: false, replayed: true };
      throw err;
    }
    try {
      await this.notifications.createInApp(userId, {
        type: 'system',
        title,
        body,
        entityId: eventKey,
      });
      return { sent: true };
    } catch (err) {
      await this.prisma.event_notices.deleteMany({ where: { event_key: eventKey } });
      this.log.warn(
        `Notice ${eventKey} was not stored: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { sent: false };
    }
  }
}
