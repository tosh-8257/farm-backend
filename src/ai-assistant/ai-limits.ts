function positive(raw: string | undefined, fallback: number) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Platform ceiling for Mkulima spend permissions. Per-user caps are still
 * stored on `ai_spend_permissions`. This replaces the old hardcoded 100,000.
 * Names only here; set the values in the environment.
 *
 * `AI_MAX_DAILY_FARM` default 1,000,000.
 * `AI_MAX_PER_TX_FARM` default equals the daily ceiling.
 */
export function aiPlatformCeiling(
  env: Record<string, string | undefined> = process.env,
) {
  const daily = positive(env.AI_MAX_DAILY_FARM, 1_000_000);
  const perTx = Math.min(positive(env.AI_MAX_PER_TX_FARM, daily), daily);
  return { per_tx: perTx, daily };
}
