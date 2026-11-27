import { ForbiddenException } from '@nestjs/common';
import { EcosystemOpsService } from './ecosystem-ops.service';

describe('partner location privacy', () => {
  it('refuses a location when the partner is not on an active job', async () => {
    const prisma: any = {
      delivery_partner_profiles: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p', online: true }),
      },
      delivery_jobs: { findFirst: jest.fn().mockResolvedValue(null) },
      partner_locations: { create: jest.fn() },
    };
    const svc = new EcosystemOpsService(prisma);
    await expect(svc.locate('u', 1, 2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.partner_locations.create).not.toHaveBeenCalled();
  });
});

describe('auto dispatch', () => {
  it('assigns an online partner whose vehicle can carry the weight', async () => {
    const prisma: any = {
      cargo_shipments: {
        findUnique: jest.fn().mockResolvedValue({ id: 's', weight_kg: 10 }),
      },
      delivery_jobs: {
        findUnique: jest.fn().mockResolvedValue({ id: 'j', status: 'open' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      delivery_partner_profiles: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'small',
            document_expires_at: null,
            vehicles: [{ capacity_kg: 2 }],
          },
          {
            id: 'fit',
            document_expires_at: null,
            vehicles: [{ capacity_kg: 20 }],
          },
        ]),
      },
      delivery_assignments: {
        create: jest.fn().mockResolvedValue({ id: 'a' }),
      },
    };
    const out = await new EcosystemOpsService(prisma).autoDispatch('s');
    expect(out.data.partner_id).toBe('fit');
    expect(out.data.maps).toBe(false);
  });
});
