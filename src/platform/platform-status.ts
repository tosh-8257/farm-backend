import { commissionBps } from '../commerce/order-rules';
import { integrationConfig } from './integration-config';
import { farmRuntime } from './runtime';

export interface ModuleStatus {
  id: string;
  enabled: boolean;
  /** Env name that turns this module on. Null means this build always exposes it. */
  gated_by: string | null;
}

/**
 * Modules compiled into this build. They are not switched by FARM_RUNTIME.
 * The app shows their tiles when this route answers and the phase routes exist.
 */
const SHIPPED_MODULES = [
  'dropshipping_lite',
  'supplier_portal',
  'cargo_quotes',
  'cargo_bookings',
  'partner_assignment',
  'settlement_records',
  'escrow_payments',
  'payouts',
  'partner_applications',
] as const;

const INTEGRATION_FLAGS: Record<string, string> = {
  shopify: 'SHOPIFY_ENABLED',
  woocommerce: 'WOOCOMMERCE_ENABLED',
  maps: 'MAPS_ENABLED',
  x402: 'X402_ENABLED',
};

/**
 * Public GET /api/v1/platform/status body.
 * `data.integrations` is the list farm1 reads (`provider`, `enabled`, `verified`).
 * `verified` stays false until a live provider check exists.
 */
export function platformStatus(
  env: Record<string, string | undefined> = process.env,
) {
  const integrations = integrationConfig(env);
  const bps = commissionBps(env);
  const modules: ModuleStatus[] = [
    ...SHIPPED_MODULES.map((id) => ({
      id,
      enabled: true,
      gated_by: null,
    })),
    ...integrations.map((row) => ({
      id: row.provider,
      enabled: row.enabled,
      gated_by: INTEGRATION_FLAGS[row.provider] ?? null,
    })),
    {
      id: 'commission',
      enabled: bps != null,
      gated_by: 'DROPSHIP_COMMISSION_BPS',
    },
  ];
  return {
    data: {
      runtime: farmRuntime(env),
      modules,
      integrations,
      commission: {
        enabled: bps != null,
        bps,
      },
    },
  };
}
