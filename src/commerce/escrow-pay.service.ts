import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SecurityService } from '../security/security.service';
import { authorizeSpend, SpendAuth } from '../security/authorize-spend';

/** Designated commerce escrow. COMMERCE_ESCROW_WALLET_ID wins, else the platform wallet. */
export async function resolveEscrowWalletId(prisma: {
  wallets: {
    findUnique: (q: any) => Promise<{ id: string } | null>;
    findFirst: (q: any) => Promise<{ id: string } | null>;
  };
}) {
  const configured = process.env.COMMERCE_ESCROW_WALLET_ID?.trim();
  if (configured) {
    const row = await prisma.wallets.findUnique({ where: { id: configured } });
    if (!row) throw new BadRequestException('Escrow wallet is not configured');
    return row.id;
  }
  const platform = await prisma.wallets.findFirst({
    where: { wallet_type: 'platform', is_active: true },
  });
  if (!platform)
    throw new BadRequestException('Escrow wallet is not configured');
  return platform.id;
}

/**
 * Moves FARM from the caller's wallet into escrow after PIN or biometric
 * confirmation. Callers must not supply a transaction id.
 */
@Injectable()
export class EscrowPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly security: SecurityService,
  ) {}

  async charge(
    userId: string,
    input: SpendAuth & { amount: number; description: string; idempotencyKey: string },
  ) {
    if (!(input.amount > 0))
      throw new BadRequestException('Amount must be greater than zero');
    await authorizeSpend(this.auth, this.security, userId, input);
    const reference = `escrow-${input.idempotencyKey}`;
    const existing = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
    });
    if (existing?.status === 'completed')
      return { replayed: true, transactionId: existing.id };
    const escrowId = await resolveEscrowWalletId(this.prisma);
    const payer = await this.prisma.wallets.findFirst({
      where: { user_id: userId, is_active: true, wallet_type: 'user' },
    });
    if (!payer) throw new BadRequestException('Payer wallet not found');
    if (payer.id === escrowId)
      throw new BadRequestException('Payer wallet cannot be the escrow wallet');
    try {
      const txn = await this.prisma.$transaction(async (tx) => {
        const debited = await tx.$executeRaw`
          UPDATE wallets
             SET balance = COALESCE(balance, 0) - ${input.amount}::numeric
           WHERE id = ${payer.id}::uuid
             AND COALESCE(balance, 0) - COALESCE(locked_balance, 0) >= ${input.amount}::numeric
             AND COALESCE(is_frozen, false) = false`;
        if (Number(debited) !== 1)
          throw new BadRequestException('Insufficient balance. The payment was not sent.');
        const before = Number(payer.balance ?? 0);
        await tx.wallets.update({
          where: { id: escrowId },
          data: { balance: { increment: input.amount } },
        });
        const created = await tx.transactions.create({
          data: {
            transaction_reference: reference,
            sender_wallet_id: payer.id,
            receiver_wallet_id: escrowId,
            transaction_type: 'transfer',
            status: 'completed',
            amount: input.amount,
            fee: 0,
            net_amount: input.amount,
            currency: 'FARM',
            description: input.description,
            processed_at: new Date(),
          },
        });
        await tx.ledger_entries.createMany({
          data: [
            {
              transaction_id: created.id,
              wallet_id: payer.id,
              entry_type: 'debit',
              amount: input.amount,
              balance_before: before,
              balance_after: before - input.amount,
              description: input.description,
              category: 'commerce_escrow',
            },
            {
              transaction_id: created.id,
              wallet_id: escrowId,
              entry_type: 'credit',
              amount: input.amount,
              description: input.description,
              category: 'commerce_escrow',
            },
          ],
        });
        return created;
      });
      return { replayed: false, transactionId: txn.id };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const again = await this.prisma.transactions.findUnique({
          where: { transaction_reference: reference },
        });
        if (again) return { replayed: true, transactionId: again.id };
      }
      throw err;
    }
  }
}
