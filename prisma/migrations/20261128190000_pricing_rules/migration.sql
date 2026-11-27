-- Base fee plus per-kg cargo price, and the 20/80 delivery split.

ALTER TABLE "cargo_rates" ADD COLUMN IF NOT EXISTS "base_fee_farm" DECIMAL(30,8);
ALTER TABLE "cargo_rates" ADD COLUMN IF NOT EXISTS "per_kg_farm" DECIMAL(30,8);
ALTER TABLE "cargo_shipments" ADD COLUMN IF NOT EXISTS "farm_share_bps" INTEGER;
ALTER TABLE "cargo_shipments" ADD COLUMN IF NOT EXISTS "partner_share_bps" INTEGER;

CREATE TABLE IF NOT EXISTS "cargo_revenue_settings" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "farm_share_bps" INTEGER NOT NULL DEFAULT 2000,
  "partner_share_bps" INTEGER NOT NULL DEFAULT 8000,
  CONSTRAINT "cargo_revenue_settings_sum" CHECK ("farm_share_bps" + "partner_share_bps" = 10000),
  CONSTRAINT "cargo_revenue_settings_one" CHECK ("id" = 1)
);
INSERT INTO "cargo_revenue_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
