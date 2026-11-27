import { ForbiddenException } from '@nestjs/common';
import { PartnerService } from './partner.service';

describe('partner applications', () => {
  it('lets a company add a driver and refuses an individual rider', async () => {
    const prisma: any = {
      delivery_partner_profiles: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ id: 'p', kind: 'individual_rider', status: 'submitted' })
          .mockResolvedValueOnce({
            id: 'p',
            kind: 'logistics_company',
            status: 'submitted',
          }),
      },
      partner_drivers: { create: jest.fn().mockResolvedValue({ id: 'd' }) },
    };
    const svc = new PartnerService(prisma, { log: jest.fn() } as any);
    await expect(
      svc.addDriver('u', { legalName: 'Amina', licenceRef: 'DL1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const row = await svc.addDriver('u', { legalName: 'Amina', licenceRef: 'DL1' });
    expect(row.data.id).toBe('d');
  });
});
