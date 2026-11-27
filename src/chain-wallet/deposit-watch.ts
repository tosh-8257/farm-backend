/** Hard cap so a bad env value cannot scan the whole chain. Default is 0 (no backfill). */
export const MAX_DEPOSIT_LOOKBACK_ROUNDS = 10_000n;

export function depositLookbackRounds(
  env: Record<string, string | undefined> = process.env,
): bigint {
  const n = Number(env.CHAIN_DEPOSIT_LOOKBACK_ROUNDS ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  const rounds = BigInt(Math.floor(n));
  return rounds > MAX_DEPOSIT_LOOKBACK_ROUNDS
    ? MAX_DEPOSIT_LOOKBACK_ROUNDS
    : rounds;
}

/** First cursor round. Lookback 0 keeps the historical "start at head" behaviour. */
export function cursorStartRound(head: bigint, lookback: bigint) {
  if (lookback <= 0n) return head;
  return head > lookback ? head - lookback : 0n;
}

/** Re-read this many rounds behind the saved cursor so a restart cannot skip one. */
export const DEFAULT_CURSOR_OVERLAP_ROUNDS = 200n;

export function cursorOverlapRounds(
  env: Record<string, string | undefined> = process.env,
): bigint {
  const n = Number(env.CHAIN_DEPOSIT_CURSOR_OVERLAP_ROUNDS ?? 200);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CURSOR_OVERLAP_ROUNDS;
  const rounds = BigInt(Math.floor(n));
  return rounds > MAX_DEPOSIT_LOOKBACK_ROUNDS
    ? MAX_DEPOSIT_LOOKBACK_ROUNDS
    : rounds;
}

/** Inclusive indexer min-round. Overlap makes the next poll repeat recent rounds. */
export function cursorQueryFrom(lastRound: bigint, overlap: bigint) {
  if (overlap <= 0n || lastRound <= overlap) return 0n;
  return lastRound - overlap;
}

/**
 * A full indexer page must not move the cursor to the newest round.
 * The next poll repeats the window. A short page may advance to the newest
 * round actually returned.
 */
export function nextCursorRound(input: {
  previous: bigint;
  newest: bigint;
  truncated: boolean;
}) {
  if (input.truncated) return input.previous;
  return input.newest > input.previous ? input.newest : input.previous;
}

/** How far the address sweep looks behind the chain head. Default is about 30 days. */
export function reconcileLookbackRounds(
  env: Record<string, string | undefined> = process.env,
): bigint {
  const n = Number(env.CHAIN_DEPOSIT_RECONCILE_ROUNDS ?? 1_000_000);
  if (!Number.isFinite(n) || n <= 0) return 1_000_000n;
  const rounds = BigInt(Math.floor(n));
  const cap = 2_000_000n;
  return rounds > cap ? cap : rounds;
}

/**
 * Optional per-coin floor in human units, CHAIN_DEPOSIT_MIN_USDC and the same
 * for ALGO and FARM. Unset means there is no floor. There is no hardcoded
 * 5 USDC minimum.
 */
export function chainDepositMinimum(
  symbol: string,
  env: Record<string, string | undefined> = process.env,
): number | null {
  const raw = env[`CHAIN_DEPOSIT_MIN_${symbol.toUpperCase()}`];
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isBelowChainMinimum(
  symbol: string,
  humanAmount: number,
  env: Record<string, string | undefined> = process.env,
) {
  const min = chainDepositMinimum(symbol, env);
  if (min == null) return false;
  return !(humanAmount >= min);
}

export function stuckDepositMinutes(
  env: Record<string, string | undefined> = process.env,
) {
  const n = Number(env.CHAIN_DEPOSIT_STUCK_MINUTES ?? 15);
  if (!Number.isFinite(n) || n < 1) return 15;
  return Math.min(Math.floor(n), 24 * 60);
}
