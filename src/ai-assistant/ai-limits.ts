/** A positive finite number, or null when the env var is unset or not usable. */
function optionalPositive(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Optional platform ceiling for Mkulima spend permissions.
 * `AI_MAX_DAILY_FARM` and `AI_MAX_PER_TX_FARM` apply only when set to a
 * positive number. When unset, that side is unlimited (`null`).
 * Per-user caps on `ai_spend_permissions` still apply, and a payment cannot
 * exceed the wallet's available balance.
 */
export function aiPlatformCeiling(
  env: Record<string, string | undefined> = process.env,
): { per_tx: number | null; daily: number | null } {
  const daily = optionalPositive(env.AI_MAX_DAILY_FARM);
  const perTxRaw = optionalPositive(env.AI_MAX_PER_TX_FARM);
  const perTx =
    perTxRaw != null && daily != null ? Math.min(perTxRaw, daily) : perTxRaw;
  return { per_tx: perTx, daily };
}

/** True when the payment amount is above the spendable wallet balance. */
export function exceedsAvailableBalance(amount: number, available: number) {
  return !(
    Number.isFinite(amount) &&
    amount > 0 &&
    Number.isFinite(available) &&
    available >= amount
  );
}
