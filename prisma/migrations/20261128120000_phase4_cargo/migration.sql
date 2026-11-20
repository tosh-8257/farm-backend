CREATE TABLE IF NOT EXISTS "cargo_rates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "from_zone" VARCHAR(40) NOT NULL,
  "to_zone" VARCHAR(40) NOT NULL,
  "min_kg" DECIMAL(10,3) NOT NULL,
  "max_kg" DECIMAL(10,3) NOT NULL,
  "price_farm" DECIMAL(30,8) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS "cargo_rates_zones" ON "cargo_rates"("from_zone", "to_zone", "active");

CREATE TABLE IF NOT EXISTS "cargo_shipments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(120) NOT NULL,
  "from_zone" VARCHAR(40) NOT NULL,
  "to_zone" VARCHAR(40) NOT NULL,
  "weight_kg" DECIMAL(10,3) NOT NULL,
  "price_farm" DECIMAL(30,8) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'quoted',
  "payment_transaction_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("user_id", "idempotency_key")
);

CREATE TABLE IF NOT EXISTS "cargo_shipment_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shipment_id" UUID NOT NULL REFERENCES "cargo_shipments"("id") ON DELETE CASCADE,
  "status" VARCHAR(20) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
