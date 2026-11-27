-- Order cancellations, returns, and disputes. Does not alter wallets.

CREATE TABLE IF NOT EXISTS "commerce_cases" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "kind" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'open',
  "reason" TEXT NOT NULL,
  "idempotency_key" VARCHAR(120) NOT NULL,
  "opened_by" UUID NOT NULL,
  "ledger" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("order_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "commerce_cases_order" ON "commerce_cases"("order_id", "kind");
