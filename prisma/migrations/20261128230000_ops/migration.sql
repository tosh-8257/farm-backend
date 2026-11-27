ALTER TABLE "delivery_partner_profiles" ADD COLUMN IF NOT EXISTS "online" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "supplier_fulfilments" ADD COLUMN IF NOT EXISTS "tracking" TEXT;

CREATE TABLE IF NOT EXISTS "partner_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id" UUID NOT NULL REFERENCES "delivery_partner_profiles"("id") ON DELETE CASCADE,
  "kind" VARCHAR(40) NOT NULL,
  "expires_at" TIMESTAMPTZ(6)
);
CREATE INDEX IF NOT EXISTS "partner_documents_expires" ON "partner_documents"("expires_at");

CREATE TABLE IF NOT EXISTS "partner_locations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id" UUID NOT NULL REFERENCES "delivery_partner_profiles"("id") ON DELETE CASCADE,
  "job_id" UUID NOT NULL,
  "lat" DECIMAL(9,6) NOT NULL,
  "lng" DECIMAL(9,6) NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "partner_locations_job" ON "partner_locations"("job_id", "recorded_at");

CREATE TABLE IF NOT EXISTS "commerce_settings" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "commission_bps" INTEGER NOT NULL DEFAULT 1000,
  CONSTRAINT "commerce_settings_one" CHECK ("id" = 1),
  CONSTRAINT "commerce_settings_bps" CHECK ("commission_bps" >= 0 AND "commission_bps" <= 10000)
);
INSERT INTO "commerce_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
