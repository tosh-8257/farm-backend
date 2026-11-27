import { Injectable, Logger } from '@nestjs/common';

export interface KesRate {
  rate: number;
  mid?: number;
  spread_bps?: number;
  source: string;
  at: Date;
}

/**
 * USDC/ALGO -> KSh. Tries the configured source, then USDC_KES_RATE_FALLBACK_URL
 * (and the ALGO equivalent). A 429 or outage uses the last good quote for up to
 * KES_RATE_STALE_SECONDS (default 24h) and backs off so the source is not hammered.
 * No rate is invented when nothing has ever succeeded.
 */
type FetchOutcome =
  | { kind: 'rate'; mid: number }
  | { kind: 'limited' }
  | { kind: 'fail' };

@Injectable()
export class RateService {
  private readonly log = new Logger(RateService.name);
  private cache = new Map<string, KesRate>();
  private nextTryAt = new Map<string, number>();
  private failures = new Map<string, number>();

  /**
   * Primary source, then optional fallback. The configured spread (basis
   * points, USDC_KES_SPREAD_BPS, shared by all assets) is subtracted so
   * FARM credited = amount x rate x (1 - spread).
   */
  usdcKes(env = process.env): Promise<KesRate | null> {
    return this.kes('USDC', env, 50, 500);
  }

  /** ALGO -> KSh, same rules as USDC (ALGO_KES_RATE_* variables). */
  algoKes(env = process.env): Promise<KesRate | null> {
    return this.kes('ALGO', env, 1, 500);
  }

  private async kes(
    asset: 'USDC' | 'ALGO',
    env: Record<string, string | undefined>,
    defMin: number,
    defMax: number,
  ): Promise<KesRate | null> {
    const p = `${asset}_KES_RATE`;
    const maxAge = Number(env[`${p}_MAX_AGE_SECONDS`] ?? 300) * 1000;
    const staleFor = Number(env.KES_RATE_STALE_SECONDS ?? 86_400) * 1000;
    const cached = this.cache.get(asset);
    const age = cached ? Date.now() - cached.at.getTime() : Infinity;
    if (cached && age < maxAge) return cached;
    if (Date.now() < (this.nextTryAt.get(asset) ?? 0))
      return this.stale(asset, cached, staleFor);
    const sources = [
      {
        url: env[`${p}_URL`],
        path: env[`${p}_JSON_PATH`],
        hdr: env[`${p}_HEADER`],
        key: env[`${p}_API_KEY`],
      },
      { url: env[`${p}_FALLBACK_URL`], path: env[`${p}_FALLBACK_JSON_PATH`] },
    ];
    const spreadBps = Math.min(
      Math.max(Number(env.USDC_KES_SPREAD_BPS ?? 0) || 0, 0),
      1000,
    );
    const bounds = {
      min: Number(env[`${p}_MIN`] ?? defMin),
      max: Number(env[`${p}_MAX`] ?? defMax),
    };
    let limited = false;
    for (const s of sources) {
      const got = await this.fetchOne(s, bounds);
      if (got.kind === 'limited') {
        limited = true;
        continue;
      }
      if (got.kind !== 'rate') continue;
      const rate = Math.floor(got.mid * (1 - spreadBps / 10_000) * 1e6) / 1e6;
      const r: KesRate = {
        rate,
        mid: got.mid,
        spread_bps: spreadBps,
        source: new URL(s.url!).host,
        at: new Date(),
      };
      this.cache.set(asset, r);
      this.failures.set(asset, 0);
      this.nextTryAt.delete(asset);
      return r;
    }
    if (limited) {
      const n = (this.failures.get(asset) ?? 0) + 1;
      this.failures.set(asset, n);
      const wait = Math.min(30_000 * 2 ** (n - 1), 15 * 60_000);
      this.nextTryAt.set(asset, Date.now() + wait);
      this.log.warn(
        `${asset} rate source rate-limited; backing off ${Math.round(wait / 1000)}s`,
      );
    }
    return this.stale(asset, this.cache.get(asset), staleFor);
  }

  /** Last good quote. Used when the live source is rate-limited or down. */
  private stale(asset: string, cached: KesRate | undefined, staleFor: number) {
    if (!cached || Date.now() - cached.at.getTime() > staleFor) return null;
    this.log.warn(`Using last good ${asset} rate from ${cached.source}`);
    return { ...cached, source: `cache:${cached.source}` };
  }

  private async fetchOne(
    s: { url?: string; path?: string; hdr?: string; key?: string },
    bounds: { min: number; max: number },
  ): Promise<FetchOutcome> {
    if (!s.url || !s.path || !s.url.startsWith('https://'))
      return { kind: 'fail' };
    try {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (s.hdr && s.key) headers[s.hdr] = s.key; // API key sent as header, never logged
      const res = await fetch(s.url, {
        headers,
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 429) return { kind: 'limited' };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: unknown = await res.json();
      const v = s.path
        .split('.')
        .reduce<any>((o, k) => (o == null ? o : o[k]), body);
      const rate = Number(v);
      if (!Number.isFinite(rate) || rate < bounds.min || rate > bounds.max)
        throw new Error('rate outside sanity bounds');
      return { kind: 'rate', mid: rate };
    } catch (e: any) {
      this.log.warn(
        `Rate source ${new URL(s.url).host} unavailable: ${e?.message ?? e}`,
      );
      return { kind: 'fail' };
    }
  }
}
