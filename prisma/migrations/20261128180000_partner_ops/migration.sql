-- Partner applications, fleet, proof of delivery, and job events.

ALTER TABLE "delivery_partner_profiles" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(30);
ALTER TABLE "delivery_partner_profiles" ADD COLUMN IF NOT EXISTS "service_area" VARCHAR(120);
ALTER TABLE "delivery_partner_profiles" ADD COLUMN IF NOT EXISTS "company_registration" VARCHAR(80);

CREATE TABLE IF NOT EXISTS "partner_vehicles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id" UUID NOT NULL REFERENCES "delivery_partner_profiles"("id") ON DELETE CASCADE,
  "category" VARCHAR(40) NOT NULL,
  "make_model" VARCHAR(120) NOT NULL,
  "registration" VARCHAR(40) NOT NULL,
  "capacity_kg" DECIMAL(10,3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "partner_vehicles_partner" ON "partner_vehicles"("partner_id");

CREATE TABLE IF NOT EXISTS "partner_drivers" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id" UUID NOT NULL REFERENCES "delivery_partner_profiles"("id") ON DELETE CASCADE,
  "legal_name" VARCHAR(255) NOT NULL,
  "licence_ref" VARCHAR(80) NOT NULL
);
CREATE INDEX IF NOT EXISTS "partner_drivers_partner" ON "partner_drivers"("partner_id");

CREATE TABLE IF NOT EXISTS "proof_of_delivery" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" UUID NOT NULL UNIQUE REFERENCES "delivery_jobs"("id") ON DELETE CASCADE,
  "method" VARCHAR(20) NOT NULL,
  "code_hash" VARCHAR(64),
  "reference" VARCHAR(500),
  "verified_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "delivery_job_events" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" UUID NOT NULL REFERENCES "delivery_jobs"("id") ON DELETE CASCADE,
  "status" VARCHAR(40) NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "delivery_job_events_job" ON "delivery_job_events"("job_id", "created_at");
