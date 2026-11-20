CREATE TABLE IF NOT EXISTS "delivery_partner_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "kind" VARCHAR(40) NOT NULL,
  "legal_name" VARCHAR(255) NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'submitted',
  "document_expires_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "delivery_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shipment_id" UUID NOT NULL UNIQUE,
  "status" VARCHAR(20) NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "delivery_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "job_id" UUID NOT NULL UNIQUE REFERENCES "delivery_jobs"("id") ON DELETE CASCADE,
  "partner_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
