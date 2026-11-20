import { limitsPayload } from './limits-payload';

describe('limits payload', () => {
  it('exposes the USD minimum under every name the deposit screen reads', () => {
    const row = limitsPayload({
      currency: 'usdttrc20',
      network: 'usdttrc20',
      min_amount: 2,
      min_usd: 2,
      source: 'farm_floor',
    });
    expect(row.minimumUsd).toBe(2);
    expect(row.min_usd).toBe(2);
    expect(row.minimumAmount).toBe(2);
    expect(row.max_usd).toBeNull();
  });

  it('does not turn a missing on-chain maximum into zero', () => {
    const row = limitsPayload({
      currency: 'usdc',
      network: 'algorand',
      source: 'farm_chain',
      message: 'No minimum or maximum is published',
    });
    expect(row.min_amount).toBeNull();
    expect(row.max_amount).toBeNull();
    expect(row.minimumUsd).toBeNull();
    expect(row.available).toBe(true);
  });
});
