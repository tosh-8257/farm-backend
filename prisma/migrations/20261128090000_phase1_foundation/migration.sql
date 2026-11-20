-- Phase 1 foundation. Additive and reversible (see down.sql).

CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "scope" VARCHAR(80) NOT NULL,
  "idempotency_key" VARCHAR(120) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'started',
  "response" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "completed_at" TIMESTAMPTZ(6),
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_scope_key" ON "idempotency_records"("scope", "idempotency_key");
CREATE INDEX IF NOT EXISTS "idempotency_records_status_created" ON "idempotency_records"("status", "created_at");

CREATE TABLE IF NOT EXISTS "platform_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" VARCHAR(80) NOT NULL,
  "idempotency_key" VARCHAR(120) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "last_error" TEXT,
  "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "platform_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_jobs_kind_key" ON "platform_jobs"("kind", "idempotency_key");
CREATE INDEX IF NOT EXISTS "platform_jobs_status_run_after" ON "platform_jobs"("status", "run_after");

CREATE TABLE IF NOT EXISTS "operational_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "permission" VARCHAR(80) NOT NULL,
  "resource_type" VARCHAR(40) NOT NULL DEFAULT '',
  "resource_id" VARCHAR(64) NOT NULL DEFAULT '',
  "granted_by" UUID,
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT "operational_grants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "operational_grants_unique" ON "operational_grants"("user_id", "permission", "resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "operational_grants_user" ON "operational_grants"("user_id", "revoked_at");
