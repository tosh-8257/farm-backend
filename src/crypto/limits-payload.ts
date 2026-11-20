/**
 * One limits shape for NOWPayments coins and on-chain ALGO / USDC / FARM.
 * Null means "not published". Never use 0 as a stand-in for an unknown limit.
 * The deposit screen reads `minimumUsd` / `min_usd`.
 */
export interface LimitsPayload {
  currency: string;
  network: string | null;
  min_amount: number | null;
  max_amount: number | null;
  min_usd: number | null;
  max_usd: number | null;
  minimumAmount: number | null;
  maximumAmount: number | null;
  minimumUsd: number | null;
  maximumUsd: number | null;
  fee_estimate: number | null;
  source: string | null;
  fetched_at: string;
  available: boolean;
  message?: string;
}

export function limitsPayload(input: {
  currency: string;
  network?: string | null;
  min_amount?: number | null;
  max_amount?: number | null;
  min_usd?: number | null;
  max_usd?: number | null;
  fee_estimate?: number | null;
  source?: string | null;
  available?: boolean;
  message?: string;
  fetched_at?: string;
}): LimitsPayload {
  const minAmount = finiteOrNull(input.min_amount);
  const maxAmount = finiteOrNull(input.max_amount);
  const minUsd = finiteOrNull(input.min_usd);
  const maxUsd = finiteOrNull(input.max_usd);
  const row: LimitsPayload = {
    currency: input.currency.trim().toLowerCase(),
    network: input.network ?? null,
    min_amount: minAmount,
    max_amount: maxAmount,
    min_usd: minUsd,
    max_usd: maxUsd,
    minimumAmount: minAmount,
    maximumAmount: maxAmount,
    minimumUsd: minUsd,
    maximumUsd: maxUsd,
    fee_estimate: finiteOrNull(input.fee_estimate),
    source: input.source ?? null,
    fetched_at: input.fetched_at ?? new Date().toISOString(),
    available: input.available !== false,
  };
  if (input.message) row.message = input.message;
  return row;
}

function finiteOrNull(value: number | null | undefined) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
