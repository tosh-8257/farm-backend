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

export function stuckDepositMinutes(
  env: Record<string, string | undefined> = process.env,
) {
  const n = Number(env.CHAIN_DEPOSIT_STUCK_MINUTES ?? 15);
  if (!Number.isFinite(n) || n < 1) return 15;
  return Math.min(Math.floor(n), 24 * 60);
}
