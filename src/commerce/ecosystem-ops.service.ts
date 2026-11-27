import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { cargoTransition } from '../cargo/cargo.service';
import { resolveEscrowWalletId } from './escrow-pay.service';
import { commissionBps } from './order-rules';

const PAGE = 20;

@Injectable()
export class EcosystemOpsService {
  constructor(private readonly prisma: PrismaService) {}

  async shipmentEvent(userId: string, shipmentId: string, status: string) {
    if (!['picked_up', 'in_transit', 'cancelled'].includes(status))
      throw new BadRequestException('Status is not available on this route');
    const shipment = await this.prisma.cargo_shipments.findFirst({
      where: { id: shipmentId, user_id: userId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (!cargoTransition(shipment.status, status))
      throw new BadRequestException(`Cannot move ${shipment.status} to ${status}`);
    if (status === 'cancelled') return this.refundShipment(shipment);
    const updated = await this.prisma.cargo_shipments.update({
      where: { id: shipment.id },
      data: {
        status,
        events: { create: { status, note: 'Updated by the customer' } },
      },
    });
    return { data: updated };
  }

  async partnerJobs(userId: string, page = 1) {
    const partner = await this.own(userId);
    const rows = await this.prisma.delivery_assignments.findMany({
      where: { partner_id: partner.id },
      orderBy: { created_at: 'desc' },
      skip: (Math.max(page, 1) - 1) * PAGE,
      take: PAGE,
    });
    return { data: rows, meta: { page, limit: PAGE } };
  }

  async decideOffer(userId: string, jobId: string, decision: 'accepted' | 'rejected') {
    const partner = await this.own(userId);
    const job = await this.prisma.delivery_jobs.findUnique({
      where: { id: jobId },
      include: { assignment: true },
    });
    if (!job?.assignment || job.assignment.partner_id !== partner.id)
      throw new NotFoundException('Job not found');
    if (job.status !== 'assigned')
      throw new BadRequestException('This offer is no longer open');
    if (decision === 'rejected') {
      await this.prisma.delivery_jobs.update({
        where: { id: jobId },
        data: { status: 'open' },
      });
      await this.prisma.delivery_assignments.delete({ where: { job_id: jobId } });
      return { data: { status: 'rejected' } };
    }
    return { data: { status: 'accepted' } };
  }

  async availability(userId: string, online: boolean) {
    const partner = await this.own(userId);
    const row = await this.prisma.delivery_partner_profiles.update({
      where: { id: partner.id },
      data: { online },
    });
    return { data: { online: row.online } };
  }

  async earnings(userId: string) {
    const rows = await this.prisma.payout_releases.findMany({
      where: { payee_user_id: userId, kind: 'partner' },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return { data: rows };
  }

  async addDocument(userId: string, kind: string, expiresAt?: string) {
    const partner = await this.own(userId);
    const row = await this.prisma.partner_documents.create({
      data: {
        partner_id: partner.id,
        kind,
        expires_at: expiresAt ? new Date(expiresAt) : null,
      },
    });
    return { data: row };
  }

  async expiringDocuments(withinDays = 30) {
    const until = new Date(Date.now() + withinDays * 86400_000);
    const rows = await this.prisma.partner_documents.findMany({
      where: { expires_at: { lte: until } },
      include: { partner: { select: { user_id: true, legal_name: true } } },
      take: 100,
    });
    return { data: rows };
  }

  async locate(userId: string, lat: number, lng: number) {
    const partner = await this.own(userId);
    if (!partner.online)
      throw new ForbiddenException('Location is recorded only while you are available');
    const job = await this.prisma.delivery_jobs.findFirst({
      where: { status: 'assigned', assignment: { partner_id: partner.id } },
    });
    if (!job)
      throw new ForbiddenException('Location is recorded only on an active job');
    const row = await this.prisma.partner_locations.create({
      data: { partner_id: partner.id, job_id: job.id, lat, lng },
    });
    return { data: { id: row.id, job_id: job.id } };
  }

  async autoDispatch(shipmentId: string) {
    const shipment = await this.prisma.cargo_shipments.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    const job = await this.prisma.delivery_jobs.findUnique({
      where: { shipment_id: shipmentId },
    });
    if (!job || job.status !== 'open')
      throw new BadRequestException('Job is not open');
    const partners = await this.prisma.delivery_partner_profiles.findMany({
      where: { status: 'approved', online: true },
      include: { vehicles: true },
    });
    const weight = Number(shipment.weight_kg);
    const fit = partners.find(
      (p) =>
        (!p.document_expires_at || p.document_expires_at > new Date()) &&
        p.vehicles.some((v) => Number(v.capacity_kg) >= weight),
    );
    if (!fit) throw new NotFoundException('No partner matches capacity');
    const claim = await this.prisma.delivery_jobs.updateMany({
      where: { id: job.id, status: 'open' },
      data: { status: 'assigned' },
    });
    if (!claim.count) throw new BadRequestException('Job is no longer open');
    const assignment = await this.prisma.delivery_assignments.create({
      data: { job_id: job.id, partner_id: fit.id },
    });
    return { data: { assignment_id: assignment.id, partner_id: fit.id, maps: false } };
  }

  async setCommission(bps: number) {
    if (!Number.isInteger(bps) || bps < 0 || bps > 10_000)
      throw new BadRequestException('Commission must be 0 to 10000 basis points');
    const row = await this.prisma.commerce_settings.upsert({
      where: { id: 1 },
      create: { id: 1, commission_bps: bps },
      update: { commission_bps: bps },
    });
    return {
      data: {
        commission_bps: commissionBps() ?? row.commission_bps,
        env_overrides: commissionBps() != null,
        base: 'supplier_item_price',
      },
    };
  }

  async sellerEarnings(userId: string) {
    const merchant = await this.prisma.merchants.findFirst({
      where: { user_id: userId, status: 'approved' },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const orders = await this.prisma.sales_orders.findMany({
      where: { merchant_id: merchant.id, status: { in: ['paid', 'fulfilled', 'forwarded', 'accepted'] } },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    const data = orders.map((o) => ({
      order_id: o.id,
      retail: Number(o.retail_total),
      supplier: Number(o.supplier_total),
      commission: o.commission_farm == null ? null : Number(o.commission_farm),
      net:
        Number(o.retail_total) -
        Number(o.supplier_total) -
        Number(o.commission_farm ?? 0),
    }));
    return { data };
  }

  async setTracking(userId: string, fulfilmentId: string, tracking: string) {
    const supplier = await this.prisma.supplier_profiles.findUnique({
      where: { user_id: userId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const row = await this.prisma.supplier_fulfilments.findFirst({
      where: { id: fulfilmentId, supplier_id: supplier.id },
    });
    if (!row) throw new NotFoundException('Fulfilment not found');
    const updated = await this.prisma.supplier_fulfilments.update({
      where: { id: row.id },
      data: { tracking: tracking.trim() },
    });
    return { data: updated };
  }

  private async own(userId: string) {
    const row = await this.prisma.delivery_partner_profiles.findUnique({
      where: { user_id: userId },
    });
    if (!row) throw new NotFoundException('Partner profile not found');
    return row;
  }

  private async refundShipment(shipment: {
    id: string;
    status: string;
    payment_transaction_id: string | null;
  }) {
    if (shipment.status !== 'booked')
      throw new BadRequestException('Only a booked shipment can be cancelled');
    await this.prisma.cargo_shipments.update({
      where: { id: shipment.id },
      data: {
        status: 'cancelled',
        events: { create: { status: 'cancelled', note: 'Cancelled by the customer' } },
      },
    });
    if (!shipment.payment_transaction_id)
      return { data: { status: 'cancelled', refunded: false } };
    const payment = await this.prisma.transactions.findUnique({
      where: { id: shipment.payment_transaction_id },
    });
    const escrow = await resolveEscrowWalletId(this.prisma);
    if (!payment?.sender_wallet_id || payment.receiver_wallet_id !== escrow)
      return { data: { status: 'cancelled', refunded: false } };
    const reference = `refund-${shipment.id}`;
    const existing = await this.prisma.transactions.findUnique({
      where: { transaction_reference: reference },
    });
    if (existing) return { data: { status: 'cancelled', refunded: true, replayed: true } };
    const amount = Number(payment.amount);
    await this.prisma.$transaction(async (tx) => {
      const debited = await tx.$executeRaw`
        UPDATE wallets
           SET balance = COALESCE(balance, 0) - ${amount}::numeric
         WHERE id = ${escrow}::uuid
           AND COALESCE(balance, 0) >= ${amount}::numeric`;
      if (Number(debited) !== 1)
        throw new BadRequestException('Escrow could not refund this shipment');
      await tx.wallets.update({
        where: { id: payment.sender_wallet_id! },
        data: { balance: { increment: amount } },
      });
      await tx.transactions.create({
        data: {
          transaction_reference: reference,
          sender_wallet_id: escrow,
          receiver_wallet_id: payment.sender_wallet_id,
          transaction_type: 'transfer',
          status: 'completed',
          amount,
          currency: 'FARM',
          description: 'Cargo cancellation refund',
          processed_at: new Date(),
        },
      });
    });
    return { data: { status: 'cancelled', refunded: true } };
  }
}
