import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { CommerceService } from './commerce.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { resolveEscrowWalletId } from './escrow-pay.service';

describe('escrow wallet', () => {
  it('uses only the configured escrow wallet', async () => {
    process.env.COMMERCE_ESCROW_WALLET_ID = 'escrow-1';
    const prisma: any = {
      wallets: {
        findUnique: jest.fn().mockResolvedValue({ id: 'escrow-1' }),
        findFirst: jest.fn(),
      },
    };
    expect(await resolveEscrowWalletId(prisma)).toBe('escrow-1');
    prisma.wallets.findUnique.mockResolvedValue(null);
    await expect(resolveEscrowWalletId(prisma)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('pasted payment ids', () => {
  it('cannot mark an order paid from a client transaction id', () => {
    const svc = new CommerceService({} as any, { log: jest.fn() } as any);
    expect(() => svc.markPaid('order', 'tx')).toThrow(/pasted transaction id/);
  });
});

describe('delivery proof', () => {
  it('sends the code to the recipient and not the partner response', async () => {
    const notifications = { createInApp: jest.fn() };
    const prisma: any = {
      delivery_jobs: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'job',
          shipment_id: 'ship',
          assignment: { partner_id: 'p' },
          proof: null,
        }),
      },
      delivery_partner_profiles: {
        findUnique: jest.fn().mockResolvedValue({ id: 'p', user_id: 'partner' }),
      },
      proof_of_delivery: { create: jest.fn() },
      cargo_shipments: {
        findUnique: jest.fn().mockResolvedValue({ id: 'ship', user_id: 'buyer' }),
      },
    };
    const svc = new DispatchService(prisma, undefined, undefined, notifications as any);
    const out = await svc.recordProof('partner', 'job', { method: 'otp' });
    expect(out.data).not.toHaveProperty('otp');
    expect(notifications.createInApp).toHaveBeenCalledWith(
      'buyer',
      expect.objectContaining({ title: 'Delivery code' }),
    );
  });

  it('rejects a partner verifying the code and locks after five misses', async () => {
    const prisma: any = {
      delivery_jobs: {
        findUnique: jest.fn().mockResolvedValue({ id: 'job', shipment_id: 'ship' }),
      },
      cargo_shipments: {
        findUnique: jest.fn().mockResolvedValue({ user_id: 'buyer' }),
      },
      proof_of_delivery: {
        findUnique: jest.fn().mockResolvedValue({
          method: 'otp',
          code_hash: createHash('sha256').update('123456').digest('hex'),
          verified_at: null,
          failed_attempts: 5,
        }),
        update: jest.fn(),
      },
    };
    const svc = new DispatchService(prisma);
    await expect(svc.verifyProof('partner', 'job', '123456')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(svc.verifyProof('buyer', 'job', '000000')).rejects.toThrow(
      'Too many attempts',
    );
    expect(prisma.proof_of_delivery.update).not.toHaveBeenCalled();
  });
});
