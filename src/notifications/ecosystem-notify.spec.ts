import { Prisma } from '@prisma/client';
import { EcosystemNotifyService } from './ecosystem-notify.service';

describe('ecosystem notices', () => {
  it('sends once and keeps amounts out of the body', async () => {
    const prisma: any = {
      event_notices: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ event_key: 'order:1:paid' })
          .mockRejectedValueOnce(
            new Prisma.PrismaClientKnownRequestError('dup', {
              code: 'P2002',
              clientVersion: 'test',
            }),
          ),
        deleteMany: jest.fn(),
      },
    };
    const notifications: any = { createInApp: jest.fn() };
    const svc = new EcosystemNotifyService(prisma, notifications);
    const body = 'An order on your account was updated.';
    const first = await svc.once('user', 'order:1:paid', 'Order update', body);
    const second = await svc.once('user', 'order:1:paid', 'Order update', body);
    expect(first).toEqual({ sent: true });
    expect(second).toEqual({ sent: false, replayed: true });
    expect(notifications.createInApp).toHaveBeenCalledTimes(1);
    expect(body).not.toMatch(/\d/);
  });
});
