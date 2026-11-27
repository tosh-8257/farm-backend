import { BadRequestException, ConflictException } from '@nestjs/common';
import { DispatchService } from './dispatch.service';

describe('dispatch assignment', () => {
  const approved = {
    id: 'p',
    status: 'approved',
    document_expires_at: new Date('2099-01-01'),
  };

  it('refuses a partner who is not approved or whose documents expired', async () => {
    const prisma: any = {
      delivery_partner_profiles: {
        findUnique: jest.fn().mockResolvedValue({ ...approved, status: 'submitted' }),
      },
      delivery_jobs: { updateMany: jest.fn() },
    };
    const svc = new DispatchService(prisma);
    await expect(svc.assign('j', 'p')).rejects.toBeInstanceOf(BadRequestException);
    prisma.delivery_partner_profiles.findUnique.mockResolvedValue({
      ...approved,
      document_expires_at: new Date('2000-01-01'),
    });
    await expect(svc.assign('j', 'p')).rejects.toThrow('expired');
    expect(prisma.delivery_jobs.updateMany).not.toHaveBeenCalled();
  });

  it('assigns an open job once', async () => {
    const prisma: any = {
      delivery_partner_profiles: { findUnique: jest.fn().mockResolvedValue(approved) },
      delivery_jobs: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      delivery_assignments: { create: jest.fn().mockResolvedValue({ id: 'a' }) },
    };
    const row = await new DispatchService(prisma).assign('j', 'p');
    expect(row.id).toBe('a');
  });

  it('reassigns once and refuses a second move to the same partner', async () => {
    const prisma: any = {
      delivery_partner_profiles: { findUnique: jest.fn().mockResolvedValue(approved) },
      delivery_jobs: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'j',
          status: 'assigned',
          assignment: { partner_id: 'old' },
        }),
      },
      delivery_assignments: {
        update: jest.fn().mockResolvedValue({ job_id: 'j', partner_id: 'p' }),
      },
      delivery_job_events: { create: jest.fn() },
    };
    const svc = new DispatchService(prisma);
    const moved = await svc.reassign('j', 'p', 'admin');
    expect(moved.replayed).toBe(false);
    prisma.delivery_jobs.findUnique.mockResolvedValue({
      id: 'j',
      status: 'assigned',
      assignment: { partner_id: 'p' },
    });
    const again = await svc.reassign('j', 'p', 'admin');
    expect(again.replayed).toBe(true);
  });

  it('marks a failed delivery without inventing a second failure', async () => {
    const prisma: any = {
      delivery_jobs: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'j', status: 'assigned', shipment_id: 's' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      cargo_shipments: {
        findUnique: jest.fn().mockResolvedValue({ id: 's', status: 'booked' }),
        update: jest.fn(),
      },
      delivery_job_events: { create: jest.fn() },
    };
    const svc = new DispatchService(prisma);
    const out = await svc.fail('j', 'Recipient unavailable', 'admin');
    expect(out.replayed).toBe(false);
    expect(prisma.cargo_shipments.update).toHaveBeenCalled();
    prisma.delivery_jobs.findUnique.mockResolvedValue({
      id: 'j',
      status: 'failed',
      shipment_id: 's',
    });
    const again = await svc.fail('j', 'Recipient unavailable', 'admin');
    expect(again.replayed).toBe(true);
  });

  it('loses the race when the job was already claimed', async () => {
    const prisma: any = {
      delivery_partner_profiles: { findUnique: jest.fn().mockResolvedValue(approved) },
      delivery_jobs: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      delivery_assignments: { create: jest.fn() },
    };
    await expect(new DispatchService(prisma).assign('j', 'p')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.delivery_assignments.create).not.toHaveBeenCalled();
  });
});
