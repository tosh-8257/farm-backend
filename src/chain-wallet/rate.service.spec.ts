import { RateService } from './rate.service';

const env = {
  USDC_KES_RATE_URL: 'https://api.coingecko.com/api/v3/simple/price',
  USDC_KES_RATE_JSON_PATH: 'usd-coin.kes',
  USDC_KES_RATE_MIN: '50',
  USDC_KES_RATE_MAX: '500',
  USDC_KES_RATE_MAX_AGE_SECONDS: '0',
  KES_RATE_STALE_SECONDS: '86400',
};

describe('USDC rate when CoinGecko returns 429', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('keeps crediting from the last good rate and backs off', async () => {
    let calls = 0;
    global.fetch = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ 'usd-coin': { kes: 130 } }),
        } as Response;
      }
      return { ok: false, status: 429, json: async () => ({}) } as Response;
    }) as typeof fetch;
    const rates = new RateService();
    const first = await rates.usdcKes(env);
    expect(first?.rate).toBe(130);
    expect(first?.source).toBe('api.coingecko.com');
    const second = await rates.usdcKes(env);
    expect(second?.rate).toBe(130);
    expect(second?.source).toBe('cache:api.coingecko.com');
    const third = await rates.usdcKes(env);
    expect(third?.rate).toBe(130);
    expect(calls).toBe(2);
  });

  it('does not invent a rate when nothing has succeeded', async () => {
    global.fetch = jest.fn(async () => {
      return { ok: false, status: 429, json: async () => ({}) } as Response;
    }) as typeof fetch;
    expect(await new RateService().usdcKes(env)).toBeNull();
  });
});
