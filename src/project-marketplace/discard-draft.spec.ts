import { BadRequestException } from '@nestjs/common';
import { BusinessProjectsService } from './business-projects.service';

const PID = '11111111-1111-4111-8111-111111111111';

function svc(project: any, extra: any = {}) {
  const prisma: any = {
    investment_projects: {
      findFirst: jest.fn().mockResolvedValue(project),
      updateMany: jest.fn().mockResolvedValue({ count: extra.claim ?? 1 }),
    },
    user_investments: {
      count: jest.fn().mockResolvedValue(extra.investments ?? 0),
    },
    project_tokens: {
      findUnique: jest.fn().mockResolvedValue(extra.token ?? null),
    },
    project_reviews: { create: jest.fn() },
  };
  const access: any = {
    resolve: jest.fn().mockResolvedValue({ business: { id: 'b1' } }),
  };
  return { svc: new BusinessProjectsService(prisma, access), prisma };
}

const draft = {
  id: PID,
  status: 'draft',
  business_id: 'b1',
  discarded_at: null,
  raised_amount: 0,
  documents: [],
  updates: [],
  milestones: [],
  reviews: [],
};

describe('discard own draft', () => {
  it('discards a draft and writes an audit row', async () => {
    const { svc: service, prisma } = svc(draft);
    const res = await service.discard('owner', PID);
    expect(res.data.status).toBe('discarded');
    expect(prisma.investment_projects.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PID, status: 'draft', discarded_at: null },
      }),
    );
    expect(prisma.project_reviews.create).toHaveBeenCalled();
  });

  it('refuses a submitted project and another status', async () => {
    await expect(
      svc({ ...draft, status: 'submitted' }).svc.discard('owner', PID),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc({ ...draft, status: 'funded' }).svc.discard('owner', PID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a draft that already has a token or an investment', async () => {
    await expect(
      svc(draft, { token: { id: 't' } }).svc.discard('owner', PID),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc(draft, { investments: 1 }).svc.discard('owner', PID),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
