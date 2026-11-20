import { aiPlatformCeiling } from './ai-limits';

describe('Mkulima platform ceiling', () => {
  it('is not the old hardcoded 100,000', () => {
    expect(aiPlatformCeiling({}).daily).toBe(1_000_000);
    expect(aiPlatformCeiling({}).daily).not.toBe(100_000);
  });

  it('reads env ceilings and keeps per-payment within the daily ceiling', () => {
    expect(
      aiPlatformCeiling({
        AI_MAX_DAILY_FARM: '250000',
        AI_MAX_PER_TX_FARM: '900000',
      }),
    ).toEqual({ daily: 250_000, per_tx: 250_000 });
  });
});
