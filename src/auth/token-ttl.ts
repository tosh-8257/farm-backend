import { DEFAULT_REFRESH_TTL_MS } from './session-policy';

const UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/** `15m` / `1h` / `7d` / `30s`, or a positive integer number of seconds (`3600`). */
export function durationMs(raw: string | undefined | null): number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  if (/^\d{1,10}$/.test(t)) {
    const seconds = Number(t);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return seconds * 1_000;
  }
  const match = /^(\d{1,6})([smhd])$/.exec(t);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n * UNIT_MS[match[2]];
}

function clamp(ms: number, min: number, max: number) {
  return Math.min(max, Math.max(min, ms));
}

export interface AccessTtl {
  ms: number;
  seconds: number;
  /** jsonwebtoken `expiresIn` string. */
  spec: string;
  source: 'JWT_ACCESS_EXPIRES' | 'JWT_EXPIRATION' | 'default';
}

const ACCESS_MIN = 60_000;
const ACCESS_MAX = 24 * 3_600_000;
const ACCESS_DEFAULT = 15 * 60_000;

/**
 * Access-token lifetime. `JWT_ACCESS_EXPIRES` wins. `JWT_EXPIRATION` (Render
 * blueprint, seconds) is the alias. Unset or unreadable values use 15 minutes.
 * Values outside 1 minute..24 hours are clamped.
 */
export function resolveAccessTtl(
  env: Record<string, string | undefined> = process.env,
): AccessTtl {
  const named = durationMs(env.JWT_ACCESS_EXPIRES);
  const alias = durationMs(env.JWT_EXPIRATION);
  const source: AccessTtl['source'] =
    named != null
      ? 'JWT_ACCESS_EXPIRES'
      : alias != null
        ? 'JWT_EXPIRATION'
        : 'default';
  const raw = named != null ? env.JWT_ACCESS_EXPIRES : env.JWT_EXPIRATION;
  const unclamped = named ?? alias ?? ACCESS_DEFAULT;
  const ms = clamp(unclamped, ACCESS_MIN, ACCESS_MAX);
  const seconds = Math.floor(ms / 1000);
  const spec =
    source === 'default'
      ? '15m'
      : ms === unclamped && raw && /^\d{1,6}[smhd]$/.test(raw.trim())
        ? raw.trim()
        : `${seconds}s`;
  return { ms, seconds, spec, source };
}

export interface RefreshTtl {
  /** Null means the historical persistent refresh token (no exp claim). */
  ms: number | null;
  seconds: number | null;
  spec: string | null;
  source:
    | 'JWT_REFRESH_EXPIRES'
    | 'JWT_REFRESH_EXPIRATION'
    | 'default'
    | 'persistent';
}

const REFRESH_MIN = 3_600_000;
const REFRESH_MAX = 400 * 86_400_000;

/** Legacy Render blueprint: 7 days. It re-expired every rotated session. */
const LEGACY_REFRESH_SECONDS = 604800;

/**
 * Refresh lifetime. A configured duration is honoured, except the legacy
 * 7-day blueprint value, which is treated as no expiry. Biometric installs
 * stay signed in until logout, an explicit revoke, or account deletion.
 * With neither name set: 90 days when long-lived mode is on, otherwise no
 * expiry.
 */
export function resolveRefreshTtl(
  env: Record<string, string | undefined> = process.env,
  longLived = false,
): RefreshTtl {
  const named = durationMs(env.JWT_REFRESH_EXPIRES);
  const alias = durationMs(env.JWT_REFRESH_EXPIRATION);
  if (named != null || alias != null) {
    const raw =
      named != null ? env.JWT_REFRESH_EXPIRES : env.JWT_REFRESH_EXPIRATION;
    const unclamped = named ?? alias ?? 0;
    if (Math.floor(unclamped / 1000) === LEGACY_REFRESH_SECONDS) {
      return { ms: null, seconds: null, spec: null, source: 'persistent' };
    }
    const ms = clamp(unclamped, REFRESH_MIN, REFRESH_MAX);
    const seconds = Math.floor(ms / 1000);
    return {
      ms,
      seconds,
      spec:
        ms === unclamped && raw && /^\d{1,6}[smhd]$/.test(raw.trim())
          ? raw.trim()
          : `${seconds}s`,
      source: named != null ? 'JWT_REFRESH_EXPIRES' : 'JWT_REFRESH_EXPIRATION',
    };
  }
  if (longLived) {
    const seconds = Math.floor(DEFAULT_REFRESH_TTL_MS / 1000);
    return {
      ms: DEFAULT_REFRESH_TTL_MS,
      seconds,
      spec: `${seconds}s`,
      source: 'default',
    };
  }
  return { ms: null, seconds: null, spec: null, source: 'persistent' };
}
