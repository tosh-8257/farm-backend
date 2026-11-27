import { PrismaClient } from '@prisma/client';
import { CommerceService } from './commerce.service';
import { EscrowPayService } from './escrow-pay.service';
import { CargoService } from '../cargo/cargo.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { PayoutService } from '../payouts/payout.service';

const url = process.env.COMMERCE_FLOW_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('order to payout against postgres', () => {
  const prisma = new PrismaClient({ datasourceUrl: url });
  const audit = { log: async () => undefined };
  const auth = { verifyPin: async () => undefined };
  const security = { verifyDevice: async () => ({ trusted: true }) };
  let otp = '';
  const notes = {
    createInApp: async (_user: string, dto: { body: string }) => {
      const match = dto.body.match(/\d{6}/);
      if (match) otp = match[0];
      return { id: 'n' };
    },
  };
  const ids: string[] = [];

  const envSnapshot = {
    COMMERCE_PAYOUTS_ENABLED: process.env.COMMERCE_PAYOUTS_ENABLED,
    DROPSHIP_COMMISSION_BPS: process.env.DROPSHIP_COMMISSION_BPS,
    COMMERCE_ESCROW_WALLET_ID: process.env.COMMERCE_ESCROW_WALLET_ID,
  };

  beforeAll(async () => {
    process.env.COMMERCE_PAYOUTS_ENABLED = 'true';
    process.env.DROPSHIP_COMMISSION_BPS = '1000';
    await prisma.$connect();
  });

  afterAll(async () => {
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await prisma.$disconnect();
  });

  it('pays once, pays out once, and rejects a second charge and a short balance', async () => {
    const stamp = Date.now().toString().slice(-8);
    const seller = await prisma.users.create({
      data: {
        first_name: 'Sel',
        last_name: 'Ler',
        username: `sel${stamp}`,
        phone: `+2547${stamp}1`,
        password_hash: 'x',
      },
    });
    const supplierUser = await prisma.users.create({
      data: {
        first_name: 'Sup',
        last_name: 'Plier',
        username: `sup${stamp}`,
        phone: `+2547${stamp}2`,
        password_hash: 'x',
      },
    });
    const partnerUser = await prisma.users.create({
      data: {
        first_name: 'Par',
        last_name: 'Tner',
        username: `par${stamp}`,
        phone: `+2547${stamp}3`,
        password_hash: 'x',
      },
    });
    ids.push(seller.id, supplierUser.id, partnerUser.id);
    const sellerWallet = await prisma.wallets.create({
      data: {
        user_id: seller.id,
        wallet_address: `seller-${stamp}`,
        wallet_type: 'user',
        balance: 500,
        currency: 'FARM',
      },
    });
    const supplierWallet = await prisma.wallets.create({
      data: {
        user_id: supplierUser.id,
        wallet_address: `supplier-${stamp}`,
        wallet_type: 'user',
        balance: 0,
        currency: 'FARM',
      },
    });
    await prisma.wallets.create({
      data: {
        user_id: partnerUser.id,
        wallet_address: `partner-${stamp}`,
        wallet_type: 'user',
        balance: 0,
        currency: 'FARM',
      },
    });
    const treasurer = await prisma.users.create({
      data: {
        first_name: 'Tre',
        last_name: 'Asury',
        username: `tre${stamp}`,
        phone: `+2547${stamp}9`,
        password_hash: 'x',
        role: 'super_admin',
      },
    });
    ids.push(treasurer.id);
    const escrow = await prisma.wallets.create({
      data: {
        user_id: treasurer.id,
        wallet_address: `escrow-${stamp}`,
        wallet_type: 'platform',
        balance: 0,
        currency: 'FARM',
      },
    });
    process.env.COMMERCE_ESCROW_WALLET_ID = escrow.id;
    const merchant = await prisma.merchants.create({
      data: { user_id: seller.id, business_name: 'Shop', status: 'approved' },
    });
    const supplier = await prisma.supplier_profiles.create({
      data: {
        user_id: supplierUser.id,
        kind: 'individual',
        legal_name: 'Supply Co',
        status: 'approved',
        regions: 'nairobi',
      },
    });
    const product = await prisma.supplier_products.create({
      data: {
        supplier_id: supplier.id,
        name: 'Maize',
        status: 'active',
      },
    });
    const variant = await prisma.product_variants.create({
      data: {
        product_id: product.id,
        sku: `MZ-${stamp}`,
        wholesale_price: 100,
        stock: 5,
        reserved: 0,
      },
    });
    await prisma.cargo_rates.create({
      data: {
        from_zone: 'nairobi',
        to_zone: 'mombasa',
        min_kg: 0,
        max_kg: 0,
        price_farm: 20,
        base_fee_farm: 20,
        per_kg_farm: 0,
        active: true,
      },
    });
    const partner = await prisma.delivery_partner_profiles.create({
      data: {
        user_id: partnerUser.id,
        kind: 'individual_vehicle',
        legal_name: 'Rider',
        status: 'approved',
        online: true,
      },
    });

    await prisma.payout_releases.updateMany({
      where: { status: 'scheduled' },
      data: { status: 'failed', last_error: 'isolated from this flow' },
    });

    const commerce = new CommerceService(prisma, audit as any);
    const pay = new EscrowPayService(prisma, auth as any, security as any);
    const cargo = new CargoService(prisma);
    const dispatch = new DispatchService(prisma, undefined, undefined, notes as any);
    const payouts = new PayoutService(prisma, audit as any);

    const placed = await commerce.placeOrder(seller.id, {
      idempotencyKey: `order-${stamp}`,
      lines: [{ variantId: variant.id, qty: 1, retail: 150 }],
    });
    const orderId = placed.order.id;
    const raced = await Promise.all([
      pay.charge(seller.id, {
        amount: 150,
        idempotencyKey: `order-${orderId}`,
        description: 'Dropshipping order',
        pin: '1234',
      }),
      pay.charge(seller.id, {
        amount: 150,
        idempotencyKey: `order-${orderId}`,
        description: 'Dropshipping order',
        pin: '1234',
      }),
    ]);
    const first = raced.find((row) => !row.replayed) ?? raced[0];
    expect(raced.filter((row) => row.transactionId === first.transactionId)).toHaveLength(2);
    const second = await pay.charge(seller.id, {
      amount: 150,
      idempotencyKey: `order-${orderId}`,
      description: 'Dropshipping order',
      pin: '1234',
    });
    expect(second.replayed).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
    const sellerAfterPay = await prisma.wallets.findUnique({
      where: { id: sellerWallet.id },
    });
    expect(Number(sellerAfterPay?.balance)).toBe(350);
    await commerce.bindEscrowPayment(seller.id, orderId, first.transactionId);
    await expect(
      commerce.bindEscrowPayment(seller.id, orderId, first.transactionId),
    ).resolves.toMatchObject({ replayed: true });

    await commerce.forward(seller.id, orderId);
    const fulfilment = await prisma.supplier_fulfilments.findFirst({
      where: { order_id: orderId },
    });
    await commerce.supplierDecision(supplierUser.id, fulfilment!.id, 'accepted');

    const cargoCharge = await pay.charge(seller.id, {
      amount: 20,
      idempotencyKey: `cargo-ship-${stamp}`,
      description: 'Cargo booking',
      pin: '1234',
    });
    const booked = await cargo.book(seller.id, {
      idempotencyKey: `ship-${stamp}`,
      fromZone: 'nairobi',
      toZone: 'mombasa',
      weightKg: 1,
      transactionId: cargoCharge.transactionId,
      orderId,
    });
    const shipmentId = booked.shipment.id;
    const job = await prisma.delivery_jobs.create({
      data: { shipment_id: shipmentId, status: 'open' },
    });
    await prisma.delivery_assignments.create({
      data: { job_id: job.id, partner_id: partner.id },
    });
    await prisma.delivery_jobs.update({
      where: { id: job.id },
      data: { status: 'assigned' },
    });
    await dispatch.recordProof(partnerUser.id, job.id, { method: 'otp' });
    expect(otp).toMatch(/^\d{6}$/);
    await dispatch.verifyProof(seller.id, job.id, otp);
    await prisma.proof_of_delivery.update({
      where: { job_id: job.id },
      data: { verified_at: new Date('2026-01-01') },
    });
    await payouts.confirmJob(partnerUser.id, job.id);
    await payouts.confirmFulfilment(supplierUser.id, fulfilment!.id);
    await Promise.all([
      payouts.releaseDue(new Date('2026-01-03')),
      payouts.releaseDue(new Date('2026-01-03')),
    ]);
    await payouts.releaseDue(new Date('2026-01-03'));
    const supplierAfter = await prisma.wallets.findUnique({
      where: { id: supplierWallet.id },
    });
    expect(Number(supplierAfter?.balance)).toBe(100);
    const escrowAfter = await prisma.wallets.findUnique({ where: { id: escrow.id } });
    const paidOut = await prisma.payout_releases.count({
      where: { status: 'paid', subject_id: { in: [orderId, shipmentId] } },
    });
    expect(paidOut).toBeGreaterThan(0);
    expect(Number(escrowAfter?.balance)).toBeLessThan(170);

    const poor = await prisma.users.create({
      data: {
        first_name: 'Po',
        last_name: 'Or',
        username: `poor${stamp}`,
        phone: `+2547${stamp}4`,
        password_hash: 'x',
      },
    });
    ids.push(poor.id);
    await prisma.wallets.create({
      data: {
        user_id: poor.id,
        wallet_address: `poor-${stamp}`,
        wallet_type: 'user',
        balance: 1,
        currency: 'FARM',
      },
    });
    await expect(
      pay.charge(poor.id, {
        amount: 50,
        idempotencyKey: `poor-${stamp}`,
        description: 'Too much',
        pin: '1234',
      }),
    ).rejects.toThrow(/Insufficient balance/);
    void merchant;
  }, 60000);
});
