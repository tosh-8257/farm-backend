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
