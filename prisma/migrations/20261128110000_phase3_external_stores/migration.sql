-- Phase 3 store connections. No credentials are stored.

CREATE TABLE IF NOT EXISTS "external_store_connections" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "business_id" UUID NOT NULL,
  "platform" VARCHAR(20) NOT NULL,
  "shop_domain" VARCHAR(255) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'unverified',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("business_id", "platform", "shop_domain")
);

CREATE TABLE IF NOT EXISTS "external_store_sync_jobs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL REFERENCES "external_store_connections"("id") ON DELETE CASCADE,
  "status" VARCHAR(20) NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "external_store_sync_jobs_connection" ON "external_store_sync_jobs"("connection_id");
