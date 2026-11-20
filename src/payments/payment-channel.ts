/** Stable channel stored on `transactions.payment_channel` and returned as `channel`. */
export const PAYMENT_CHANNELS = [
  'qr',
  'payment_link',
  'invoice',
  'nfc',
  'p2p',
  'chain_deposit',
  'nowpayments',
  'paystack',
] as const;

export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export function isPaymentChannel(value: unknown): value is PaymentChannel {
  return (
    typeof value === 'string' &&
    (PAYMENT_CHANNELS as readonly string[]).includes(value)
  );
}

/**
 * Channel proven by metadata written at initiation. Ambiguous rows stay null
 * so a historical backfill does not guess.
 */
export function channelFromMetadata(meta: unknown): PaymentChannel | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  if (isPaymentChannel(m.channel)) return m.channel;
  if (m.business_document === 'invoice') return 'invoice';
  if (m.business_document === 'payment_link') return 'payment_link';
  const source = typeof m.source === 'string' ? m.source.toLowerCase() : '';
  if (
    m.isQrSale === true ||
    m.type === 'qr_sale' ||
    source === 'qr' ||
    source === 'merchant_qr'
  )
    return 'qr';
  return null;
}

export function presentChannel(row: {
  payment_channel?: string | null;
  metadata?: unknown;
}): PaymentChannel | null {
  if (isPaymentChannel(row.payment_channel)) return row.payment_channel;
  return channelFromMetadata(row.metadata);
}
