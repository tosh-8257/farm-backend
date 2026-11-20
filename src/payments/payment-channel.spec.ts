import { channelFromMetadata, presentChannel } from './payment-channel';

describe('payment channel', () => {
  it('trusts an explicit channel and proven metadata only', () => {
    expect(channelFromMetadata({ business_document: 'invoice' })).toBe('invoice');
    expect(channelFromMetadata({ business_document: 'payment_link' })).toBe(
      'payment_link',
    );
    expect(channelFromMetadata({ isQrSale: true })).toBe('qr');
    expect(channelFromMetadata({ type: 'merchant_payment' })).toBeNull();
  });

  it('does not let a QR flag override an invoice document', () => {
    expect(
      channelFromMetadata({
        isQrSale: true,
        business_document: 'invoice',
        channel: 'invoice',
      }),
    ).toBe('invoice');
  });

  it('prefers the stored column over metadata', () => {
    expect(
      presentChannel({
        payment_channel: 'payment_link',
        metadata: { isQrSale: true },
      }),
    ).toBe('payment_link');
  });
});
