import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { money } from '../commerce/order-rules';
import { cargoTransition } from '../cargo/cargo.service';
import { creditPlatformInTx } from '../fees/fee-defaults';

export const PAYOUT_HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Moves FARM wallet balances after delivery and a 24 hour dispute hold.
 * Does not send an on-chain transaction. External withdrawals stay on their
 * existing PIN and biometric path.
 */
@Injectable()
export class PayoutService {
  private readonly log = new Logger(PayoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  @Interval(30_000)
  async tick() {
    try {
      await this.releaseDue(new Date());
    } catch (err) {
      this.log.warn(
        `Payout release failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async confirmFulfilment(userId: string, fulfilmentId: string, now = new Date()) {
    const supplier = await this.prisma.supplier_profiles.findUnique({
      where: { user_id: userId },
    });
    if (!supplier || supplier.status !== 'approved')
      throw new NotFoundException('Approved supplier profile not found');
    const row = await this.prisma.supplier_fulfilments.findFirst({
      where: { id: fulfilmentId, supplier_id: supplier.id },
    });
    if (!row) throw new NotFoundException('Fulfilment not found');
    if (row.status === 'fulfilled') {
      await this.scheduleOrder(row.order_id, now);
      return { replayed: true, order_id: row.order_id };
    }
    if (row.status !== 'accepted')
      throw new BadRequestException('Accept the fulfilment before confirming delivery');
    await this.prisma.supplier_fulfilments.update({
      where: { id: row.id },
      data: { status: 'fulfilled' },
    });
    const open = await this.prisma.supplier_fulfilments.count({
      where: {
        order_id: row.order_id,
        status: { notIn: ['fulfilled', 'rejected'] },
      },
    });
    if (open === 0) {
      const order = await this.prisma.sales_orders.findUnique({
        where: { id: row.order_id },
      });
      if (order && ['forwarded', 'accepted', 'paid'].includes(order.status)) {
        await this.prisma.sales_orders.update({
          where: { id: order.id },
          data: { status: 'fulfilled' },
        });
      }
      await this.scheduleOrder(row.order_id, now);
    }
    return { replayed: false, order_id: row.order_id };
  }

  async confirmJob(userId: string, jobId: string, now = new Date()) {
    const job = await this.prisma.delivery_jobs.findUnique({
      where: { id: jobId },
      include: { assignment: true },
    });
    if (!job?.assignment) throw new NotFoundException('Job is not assigned');
    const partner = await this.prisma.delivery_partner_profiles.findUnique({
      where: { id: job.assignment.partner_id },
    });
    if (!partner || partner.user_id !== userId)
      throw new NotFoundException('Assigned partner not found');
    const shipment = await this.prisma.cargo_shipments.findUnique({
      where: { id: job.shipment_id },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (shipment.status !== 'delivered') {
      if (!cargoTransition(shipment.status, 'delivered'))
        throw new BadRequestException('This shipment cannot be confirmed delivered');
      await this.prisma.cargo_shipments.update({
        where: { id: shipment.id },
        data: {
          status: 'delivered',
          events: { create: { status: 'delivered', note: 'Delivery confirmed' } },
        },
      });
    }
    await this.scheduleShipment(shipment.id, partner.user_id, now);
    return { replayed: shipment.status === 'delivered', shipment_id: shipment.id };
  }

  async freezeOrder(orderId: string) {
    await this.prisma.payout_releases.updateMany({
      where: { subject_type: 'order', subject_id: orderId, status: 'scheduled' },
      data: { status: 'frozen', last_error: 'Dispute opened during the hold' },
    });
  }

  async freezeShipment(shipmentId: string) {
    await this.prisma.payout_releases.updateMany({
      where: {
        subject_type: 'shipment',
        subject_id: shipmentId,
        status: 'scheduled',
      },
      data: { status: 'frozen', last_error: 'Dispute opened during the hold' },
    });
  }

  async list() {
    const rows = await this.prisma.payout_releases.findMany({
      orderBy: { created_at: 'desc' },
      take: 100,
    });
    return { data: rows };
  }

  async unfreeze(adminId: string, id: string) {
    const row = await this.must(id);
    if (row.status !== 'frozen')
      throw new BadRequestException('Only a frozen payout can be released');
    const updated = await this.prisma.payout_releases.update({
      where: { id },
      data: { status: 'scheduled', last_error: null },
    });
    await this.audit.log({
      userId: adminId,
      action: 'payout_unfreeze',
      resource: 'payout_releases',
      resourceId: id,
      status: 'success',
    });
    return { data: updated };
  }

  async reverse(adminId: string, id: string) {
    const row = await this.must(id);
    if (row.status === 'reversed') return { replayed: true, data: row };
    if (row.status !== 'paid' || !row.paid_transaction_id)
      throw new BadRequestException('Only a paid payout can be reversed');
    const reversalId = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.payout_releases.updateMany({
        where: { id, status: 'paid' },
        data: { status: 'reversing' },
      });
      if (!claim.count) throw new ConflictException('Reversal already started');
      const reference = `payout-reverse-${row.id}`;
      const txn = await tx.transactions.create({
        data: {
          transaction_reference: reference,
          transaction_type: 'transfer',
          status: 'completed',
          amount: row.amount,
          currency: 'FARM',
          description: 'Payout reversal',
          processed_at: new Date(),
        },
      });
      if (row.kind === 'commission' || row.kind === 'farm_cargo') {
        await this.debitPlatform(tx, Number(row.amount), txn.id, 'payout_reversal');
      } else if (row.payee_user_id) {
        const payee = await this.userWallet(tx, row.payee_user_id);
        await this.debit(tx, payee, Number(row.amount), txn.id, 'payout_reversal');
      }
      if (row.source_wallet_id) {
        await this.credit(tx, row.source_wallet_id, Number(row.amount), txn.id, 'payout_reversal');
      }
      await tx.payout_releases.update({
        where: { id },
        data: { status: 'reversed', reversal_transaction_id: txn.id },
      });
      return txn.id;
    });
    await this.audit.log({
      userId: adminId,
      action: 'payout_reverse',
      resource: 'payout_releases',
      resourceId: id,
      newValues: { reversal_transaction_id: reversalId },
      status: 'success',
    });
    return { replayed: false, data: { id, status: 'reversed' } };
  }

  async releaseDue(now = new Date()) {
    const due = await this.prisma.payout_releases.findMany({
      where: { status: 'scheduled', hold_until: { lte: now } },
      take: 20,
    });
    let paid = 0;
    for (const row of due) {
      try {
        const did = await this.payOne(row.id, now);
        if (did) paid += 1;
      } catch (err) {
        await this.prisma.payout_releases.updateMany({
          where: { id: row.id, status: 'scheduled' },
          data: {
            last_error: err instanceof Error ? err.message : String(err),
          },
        });
      }
    }
    return { paid, seen: due.length };
  }

  async scheduleOrder(orderId: string, now = new Date()) {
    const order = await this.prisma.sales_orders.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order?.payment_transaction_id) return;
    const disputes = await this.prisma.commerce_cases.count({
      where: { order_id: orderId, kind: 'dispute', status: 'open' },
    });
    const payment = await this.prisma.transactions.findUnique({
      where: { id: order.payment_transaction_id },
    });
    const source = payment?.receiver_wallet_id ?? null;
    const merchant = await this.prisma.merchants.findUnique({
      where: { id: order.merchant_id },
    });
    const variants = await this.prisma.product_variants.findMany({
      where: { id: { in: order.items.map((item) => item.variant_id) } },
      include: { product: true },
    });
    const bySupplier = new Map<string, number>();
    for (const item of order.items) {
      const variant = variants.find((row) => row.id === item.variant_id);
      if (!variant) continue;
      const current = bySupplier.get(variant.product.supplier_id) ?? 0;
      bySupplier.set(
        variant.product.supplier_id,
        money(current + Number(item.wholesale)),
      );
    }
    for (const [supplierId, amount] of bySupplier) {
      const supplier = await this.prisma.supplier_profiles.findUnique({
        where: { id: supplierId },
      });
      await this.insertRow({
        kind: `supplier:${supplierId}`,
        subjectType: 'order',
        subjectId: orderId,
        payeeUserId: supplier?.user_id ?? merchant?.user_id ?? null,
        sourceWalletId: source,
        amount,
        now,
        blocked: !source || !supplier?.user_id,
        frozen: disputes > 0,
      });
    }
    if (order.commission_farm != null && Number(order.commission_farm) > 0) {
      await this.insertRow({
        kind: 'commission',
        subjectType: 'order',
        subjectId: orderId,
        payeeUserId: null,
        sourceWalletId: source,
        amount: Number(order.commission_farm),
        now,
        blocked: !source,
        frozen: disputes > 0,
      });
    }
  }

  async scheduleShipment(shipmentId: string, partnerUserId: string, now = new Date()) {
    const shipment = await this.prisma.cargo_shipments.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment?.payment_transaction_id) return;
    const payment = await this.prisma.transactions.findUnique({
      where: { id: shipment.payment_transaction_id },
    });
    const source = payment?.receiver_wallet_id ?? null;
    const price = Number(shipment.price_farm);
    const disputed = await this.prisma.shipment_disputes.count({
      where: { shipment_id: shipmentId },
    });
    const farmBps = shipment.farm_share_bps ?? 2000;
    const farm = money((price * farmBps) / 10_000);
    const partner = money(price - farm);
    await this.insertRow({
      kind: 'partner',
      subjectType: 'shipment',
      subjectId: shipmentId,
      payeeUserId: partnerUserId,
      sourceWalletId: source,
      amount: partner,
      now,
      blocked: !source,
      frozen: disputed > 0,
    });
    await this.insertRow({
      kind: 'farm_cargo',
      subjectType: 'shipment',
      subjectId: shipmentId,
      payeeUserId: null,
      sourceWalletId: source,
      amount: farm,
      now,
      blocked: !source || farm <= 0,
      frozen: disputed > 0,
    });
  }

  async openShipmentDispute(userId: string, shipmentId: string, reason: string) {
    const note = reason?.trim();
    if (!note) throw new BadRequestException('A reason is required');
    const shipment = await this.prisma.cargo_shipments.findFirst({
      where: { id: shipmentId, user_id: userId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    await this.prisma.shipment_disputes.create({
      data: { shipment_id: shipmentId, user_id: userId, reason: note },
    });
    await this.freezeShipment(shipmentId);
    return { data: { shipment_id: shipmentId, payout: 'frozen' } };
  }

  private async insertRow(input: {
    kind: string;
    subjectType: string;
    subjectId: string;
    payeeUserId: string | null;
    sourceWalletId: string | null;
    amount: number;
    now: Date;
    blocked: boolean;
    frozen?: boolean;
  }) {
    if (!(input.amount > 0)) return;
    const key = createHash('sha256')
      .update(`${input.kind}:${input.subjectId}`)
      .digest('hex');
    try {
      await this.prisma.payout_releases.create({
        data: {
          idempotency_key: key,
          kind: input.kind,
          subject_type: input.subjectType,
          subject_id: input.subjectId,
          payee_user_id: input.payeeUserId,
          source_wallet_id: input.sourceWalletId,
          amount: input.amount,
          status: input.blocked ? 'blocked' : input.frozen ? 'frozen' : 'scheduled',
          hold_until: new Date(input.now.getTime() + PAYOUT_HOLD_MS),
          last_error: input.blocked
            ? 'Collection wallet or payee is missing, so nothing was credited'
            : null,
        },
      });
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== 'P2002'
      )
        throw err;
    }
  }

  private async payOne(id: string, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.payout_releases.updateMany({
        where: { id, status: 'scheduled', hold_until: { lte: now } },
        data: { status: 'paying' },
      });
      if (!claim.count) return false;
      const row = await tx.payout_releases.findUnique({ where: { id } });
      if (!row?.source_wallet_id) throw new Error('No source wallet');
      const txn = await tx.transactions.create({
        data: {
          transaction_reference: `payout-${row.id}`,
          transaction_type: 'transfer',
          status: 'completed',
          amount: row.amount,
          currency: 'FARM',
          description: `Payout ${row.kind}`,
          sender_wallet_id: row.source_wallet_id,
          processed_at: now,
        },
      });
      await this.debit(
        tx,
        row.source_wallet_id,
        Number(row.amount),
        txn.id,
        row.kind,
      );
      if (row.kind === 'commission' || row.kind === 'farm_cargo') {
        await creditPlatformInTx(
          tx,
          Number(row.amount),
          `FARM share ${row.kind}`,
          txn.id,
          row.kind,
        );
      } else if (row.payee_user_id) {
        const walletId = await this.userWallet(tx, row.payee_user_id);
        await this.credit(tx, walletId, Number(row.amount), txn.id, row.kind);
        await tx.transactions.update({
          where: { id: txn.id },
          data: { receiver_wallet_id: walletId },
        });
      }
      await tx.payout_releases.update({
        where: { id },
        data: { status: 'paid', paid_transaction_id: txn.id, last_error: null },
      });
      return true;
    });
  }

  private async userWallet(tx: Prisma.TransactionClient | any, userId: string) {
    const wallet = await tx.wallets.findFirst({
      where: { user_id: userId, wallet_type: 'user', is_active: true },
    });
    if (!wallet) throw new Error('Payee wallet not found');
    return wallet.id as string;
  }

  private async debit(
    tx: any,
    walletId: string,
    amount: number,
    transactionId: string,
    category: string,
  ) {
    const before = await tx.wallets.findUnique({ where: { id: walletId } });
    if (!before) throw new Error('Source wallet not found');
    const updated = await tx.$executeRaw`
      UPDATE wallets
         SET balance = COALESCE(balance, 0) - ${amount}::numeric
       WHERE id = ${walletId}::uuid
         AND COALESCE(balance, 0) - COALESCE(locked_balance, 0) >= ${amount}::numeric
         AND COALESCE(is_frozen, false) = false`;
    if (Number(updated) !== 1) throw new Error('Insufficient balance for payout');
    await tx.ledger_entries.create({
      data: {
        transaction_id: transactionId,
        wallet_id: walletId,
        entry_type: 'debit',
        amount,
        balance_before: Number(before.balance ?? 0),
        balance_after: Number(before.balance ?? 0) - amount,
        description: 'Payout debit. No on-chain send.',
        category,
      },
    });
  }

  private async credit(
    tx: any,
    walletId: string,
    amount: number,
    transactionId: string,
    category: string,
  ) {
    const before = await tx.wallets.findUnique({ where: { id: walletId } });
    if (!before) throw new Error('Destination wallet not found');
    await tx.wallets.update({
      where: { id: walletId },
      data: { balance: { increment: amount } },
    });
    await tx.ledger_entries.create({
      data: {
        transaction_id: transactionId,
        wallet_id: walletId,
        entry_type: 'credit',
        amount,
        balance_before: Number(before.balance ?? 0),
        balance_after: Number(before.balance ?? 0) + amount,
        description: 'Payout credit. No on-chain send.',
        category,
      },
    });
  }

  private async debitPlatform(tx: any, amount: number, transactionId: string, category: string) {
    const admin = await tx.users.findFirst({
      where: { role: 'super_admin', is_deleted: false },
      include: { wallets: { where: { is_active: true }, take: 1 } },
    });
    const walletId = admin?.wallets?.[0]?.id as string | undefined;
    if (!walletId) throw new Error('Platform wallet not found');
    await this.debit(tx, walletId, amount, transactionId, category);
  }

  private async must(id: string) {
    const row = await this.prisma.payout_releases.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Payout not found');
    return row;
  }
}
