import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { EcosystemNotifyService } from '../notifications/ecosystem-notify.service';
import {
  commissionBps,
  commissionFarm,
  margin,
  money,
  orderTransition,
  supplierAdminTransition,
} from './order-rules';

@Injectable()
export class CommerceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    @Optional() private readonly notify?: EcosystemNotifyService,
  ) {}

  async applySupplier(
    userId: string,
    input: {
      kind: 'individual' | 'business';
      legalName: string;
      region?: string;
    },
  ) {
    if (!input.legalName?.trim())
      throw new BadRequestException('Legal name is required');
    if (input.kind !== 'individual' && input.kind !== 'business')
      throw new BadRequestException(
        'Supplier kind must be individual or business',
      );
    const existing = await this.prisma.supplier_profiles.findUnique({
      where: { user_id: userId },
    });
    if (
      existing &&
      !['draft', 'rejected', 'more_information_required'].includes(
        existing.status,
      )
    ) {
      throw new ConflictException(
        'This supplier application cannot be resubmitted',
      );
    }
    return this.prisma.supplier_profiles.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        kind: input.kind,
        legal_name: input.legalName.trim(),
        region: input.region ?? null,
        status: 'submitted',
      },
      update: {
        kind: input.kind,
        legal_name: input.legalName.trim(),
        region: input.region ?? null,
        status: 'submitted',
      },
    });
  }

  async approvedMerchant(userId: string) {
    const merchant = await this.prisma.merchants.findFirst({
      where: { user_id: userId, status: 'approved' },
    });
    if (!merchant)
      throw new ForbiddenException('An approved merchant account is required');
    return merchant;
  }

  async ownSupplier(userId: string) {
    const row = await this.prisma.supplier_profiles.findUnique({
      where: { user_id: userId },
    });
    if (!row) throw new NotFoundException('Supplier profile not found');
    return row;
  }

  quote(retail: number, wholesale: number) {
    const bps = commissionBps();
    return {
      ...margin(retail, wholesale, commissionFarm(wholesale, bps)),
      commission_bps: bps,
    };
  }

  async importListing(userId: string, variantId: string, retailPrice: number) {
    const merchant = await this.approvedMerchant(userId);
    if (!(retailPrice > 0))
      throw new BadRequestException('Retail price must be positive');
    const variant = await this.prisma.product_variants.findUnique({
      where: { id: variantId },
      include: { product: { include: { supplier: true } } },
    });
    if (!variant || variant.product.status !== 'active')
      throw new NotFoundException('Product is not available');
    if (variant.product.supplier.status !== 'approved')
      throw new ForbiddenException('Supplier is not approved');
    const listing = await this.prisma.store_listings.upsert({
      where: {
        merchant_id_variant_id: {
          merchant_id: merchant.id,
          variant_id: variantId,
        },
      },
      create: {
        merchant_id: merchant.id,
        variant_id: variantId,
        retail_price: retailPrice,
        status: 'active',
      },
      update: { retail_price: retailPrice, status: 'active' },
    });
    return {
      listing,
      quote: this.quote(retailPrice, Number(variant.wholesale_price)),
    };
  }

  /**
   * Creates an unpaid order and reserves stock. Client payment flags are ignored.
   * The same merchant idempotency key returns the existing order.
   */
  async placeOrder(
    merchantUserId: string,
    input: {
      idempotencyKey: string;
      buyerUserId?: string;
      lines: { variantId: string; qty: number; retail: number }[];
    },
  ) {
    const merchant = await this.approvedMerchant(merchantUserId);
    const existing = await this.prisma.sales_orders.findUnique({
      where: {
        merchant_id_idempotency_key: {
          merchant_id: merchant.id,
          idempotency_key: input.idempotencyKey,
        },
      },
      include: { items: true },
    });
    if (existing) return { replayed: true, order: existing };
    if (!input.lines.length)
      throw new BadRequestException('An order needs a line');
    return this.prisma.$transaction(async (tx) => {
      let retail = 0;
      let wholesale = 0;
      const items: Prisma.sales_order_itemsCreateManyInput[] = [];
      const order = await tx.sales_orders.create({
        data: {
          merchant_id: merchant.id,
          buyer_user_id: input.buyerUserId ?? null,
          idempotency_key: input.idempotencyKey,
          status: 'placed',
          commission_bps: commissionBps(),
        },
      });
      for (const line of input.lines) {
        if (!Number.isInteger(line.qty) || line.qty < 1)
          throw new BadRequestException('Quantity must be a positive integer');
        const variant = await tx.product_variants.findUnique({
          where: { id: line.variantId },
          include: { product: { include: { supplier: true } } },
        });
        if (!variant || variant.product.supplier.status !== 'approved')
          throw new BadRequestException(
            'A line is not from an approved supplier',
          );
        const available = variant.stock - variant.reserved;
        if (available < line.qty)
          throw new ConflictException('Not enough stock');
        const claimed = await tx.product_variants.updateMany({
          where: {
            id: variant.id,
            stock: variant.stock,
            reserved: variant.reserved,
          },
          data: { reserved: { increment: line.qty } },
        });
        if (!claimed.count)
          throw new ConflictException('Stock changed; retry the order');
        const lineWholesale = money(Number(variant.wholesale_price) * line.qty);
        const lineRetail = money(line.retail * line.qty);
        retail += lineRetail;
        wholesale += lineWholesale;
        items.push({
          order_id: order.id,
          variant_id: variant.id,
          qty: line.qty,
          wholesale: lineWholesale,
          retail: lineRetail,
        });
      }
      await tx.sales_order_items.createMany({ data: items });
      const fee = commissionFarm(wholesale, commissionBps());
      const saved = await tx.sales_orders.update({
        where: { id: order.id },
        data: {
          retail_total: money(retail),
          supplier_total: money(wholesale),
          commission_farm: fee,
        },
        include: { items: true },
      });
      return { replayed: false, order: saved };
    });
  }

  async payableOrder(userId: string, orderId: string) {
    const merchant = await this.approvedMerchant(userId);
    return this.requireOrder(orderId, merchant.id);
  }

  /** A pasted transaction id is not a payment. */
  markPaid(_orderId: string, _transactionId: string): never {
    throw new BadRequestException(
      'A pasted transaction id is not accepted. Pay from your wallet with your PIN or biometrics.',
    );
  }

  /** Binds a server-created escrow charge to this merchant's order. */
  async bindEscrowPayment(merchantUserId: string, orderId: string, transactionId: string) {
    const merchant = await this.approvedMerchant(merchantUserId);
    const order = await this.requireOrder(orderId, merchant.id);
    const tx = await this.prisma.transactions.findUnique({
      where: { id: transactionId },
    });
    if (!tx || tx.status !== 'completed' || !tx.transaction_reference.startsWith('escrow-'))
      throw new BadRequestException('Payment was not charged into escrow');
    if (
      order.status === 'paid' &&
      order.payment_transaction_id === transactionId
    )
      return { replayed: true, order };
    if (!orderTransition(order.status, 'paid'))
      throw new BadRequestException(`Cannot mark ${order.status} as paid`);
    if (Math.abs(Number(tx.amount) - Number(order.retail_total)) > 0.01)
      throw new BadRequestException('Payment amount does not match the order');
    const paid = await this.prisma.sales_orders.update({
      where: { id: orderId },
      data: { status: 'paid', payment_transaction_id: transactionId },
    });
    await this.notify?.once(
      merchantUserId,
      `order:${orderId}:paid`,
      'Order update',
      'An order was paid.',
    );
    return { replayed: false, order: paid };
  }

  async forward(merchantUserId: string, orderId: string) {
    const merchant = await this.approvedMerchant(merchantUserId);
    const order = await this.requireOrder(orderId, merchant.id);
    if (!orderTransition(order.status, 'forwarded'))
      throw new BadRequestException('Only a paid order can be forwarded');
    const supplierIds = [
      ...new Set(order.items.map((item) => item.variant_id)),
    ];
    const variants = await this.prisma.product_variants.findMany({
      where: { id: { in: supplierIds } },
      include: { product: true },
    });
    const suppliers = [...new Set(variants.map((v) => v.product.supplier_id))];
    await this.prisma.$transaction(async (tx) => {
      await tx.sales_orders.update({
        where: { id: orderId },
        data: { status: 'forwarded' },
      });
      for (const supplierId of suppliers) {
        await tx.supplier_fulfilments.create({
          data: {
            order_id: orderId,
            supplier_id: supplierId,
            status: 'pending',
          },
        });
      }
    });
    return { id: orderId, status: 'forwarded', suppliers };
  }

  async supplierDecision(
    userId: string,
    fulfilmentId: string,
    decision: 'accepted' | 'rejected',
  ) {
    const supplier = await this.ownSupplier(userId);
    if (supplier.status !== 'approved')
      throw new ForbiddenException('Supplier is not approved');
    const row = await this.prisma.supplier_fulfilments.findFirst({
      where: { id: fulfilmentId, supplier_id: supplier.id },
    });
    if (!row) throw new NotFoundException('Fulfilment not found');
    if (row.status !== 'pending')
      throw new BadRequestException('This fulfilment was already decided');
    const updated = await this.prisma.supplier_fulfilments.update({
      where: { id: row.id },
      data: { status: decision },
    });
    if (decision === 'rejected') await this.releaseOrderStock(row.order_id);
    const order = await this.prisma.sales_orders.findUnique({
      where: { id: row.order_id },
    });
    const merchant = order
      ? await this.prisma.merchants.findUnique({ where: { id: order.merchant_id } })
      : null;
    await this.notify?.once(
      merchant?.user_id,
      `fulfilment:${fulfilmentId}:${decision}`,
      'Order update',
      decision === 'accepted'
        ? 'A supplier accepted an order.'
        : 'A supplier rejected an order.',
    );
    return updated;
  }

  async adminSupplierDecision(
    adminId: string,
    supplierId: string,
    to: string,
    notes?: string,
  ) {
    const row = await this.prisma.supplier_profiles.findUnique({
      where: { id: supplierId },
    });
    if (!row) throw new NotFoundException('Supplier not found');
    if (!supplierAdminTransition(row.status, to))
      throw new BadRequestException(`Cannot move ${row.status} to ${to}`);
    const updated = await this.prisma.supplier_profiles.update({
      where: { id: supplierId },
      data: { status: to, review_notes: notes ?? null },
    });
    await this.audit.log({
      userId: adminId,
      action: 'supplier_decision',
      resource: 'supplier_profiles',
      resourceId: supplierId,
      oldValues: { status: row.status },
      newValues: { status: to },
      status: 'success',
    });
    return updated;
  }

  private async requireOrder(id: string, merchantId: string) {
    const order = await this.prisma.sales_orders.findFirst({
      where: { id, merchant_id: merchantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private async releaseOrderStock(orderId: string) {
    const items = await this.prisma.sales_order_items.findMany({
      where: { order_id: orderId },
    });
    for (const item of items) {
      await this.prisma.product_variants.update({
        where: { id: item.variant_id },
        data: { reserved: { decrement: item.qty } },
      });
    }
    await this.prisma.sales_orders.update({
      where: { id: orderId },
      data: { status: 'rejected' },
    });
  }
}
