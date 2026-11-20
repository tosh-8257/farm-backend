import { aiPlatformCeiling, exceedsAvailableBalance } from './ai-limits';

describe('Mkulima platform ceiling', () => {
  it('is unlimited when the env vars are unset', () => {
    expect(aiPlatformCeiling({})).toEqual({ per_tx: null, daily: null });
  });

  it('ignores blank or non-positive values', () => {
    expect(
      aiPlatformCeiling({
        AI_MAX_DAILY_FARM: '  ',
        AI_MAX_PER_TX_FARM: '0',
      }),
    ).toEqual({ per_tx: null, daily: null });
  });

  it('applies only the ceilings that are set', () => {
    expect(aiPlatformCeiling({ AI_MAX_DAILY_FARM: '250000' })).toEqual({
      per_tx: null,
      daily: 250_000,
    });
    expect(
      aiPlatformCeiling({
        AI_MAX_DAILY_FARM: '250000',
        AI_MAX_PER_TX_FARM: '900000',
      }),
    ).toEqual({ daily: 250_000, per_tx: 250_000 });
  });

  it('treats a payment above the available balance as not spendable', () => {
    expect(exceedsAvailableBalance(50, 50)).toBe(false);
    expect(exceedsAvailableBalance(50.01, 50)).toBe(true);
    expect(exceedsAvailableBalance(10, Number.NaN)).toBe(true);
  });
});
