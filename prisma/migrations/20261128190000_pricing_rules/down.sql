DROP TABLE IF EXISTS "cargo_revenue_settings";
ALTER TABLE "cargo_shipments" DROP COLUMN IF EXISTS "partner_share_bps";
ALTER TABLE "cargo_shipments" DROP COLUMN IF EXISTS "farm_share_bps";
ALTER TABLE "cargo_rates" DROP COLUMN IF EXISTS "per_kg_farm";
ALTER TABLE "cargo_rates" DROP COLUMN IF EXISTS "base_fee_farm";
