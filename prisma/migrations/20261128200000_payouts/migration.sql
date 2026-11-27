-- Supplier and partner payouts. Wallet movement happens only after the hold.

CREATE TABLE IF NOT EXISTS "payout_releases" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "idempotency_key" VARCHAR(160) NOT NULL UNIQUE,
  "kind" VARCHAR(30) NOT NULL,
  "subject_type" VARCHAR(20) NOT NULL,
  "subject_id" UUID NOT NULL,
  "payee_user_id" UUID,
  "source_wallet_id" UUID,
  "amount" DECIMAL(30,8) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  "hold_until" TIMESTAMPTZ(6) NOT NULL,
  "paid_transaction_id" UUID,
  "reversal_transaction_id" UUID,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("kind", "subject_id")
);
CREATE INDEX IF NOT EXISTS "payout_releases_due" ON "payout_releases"("status", "hold_until");

CREATE TABLE IF NOT EXISTS "shipment_disputes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "shipment_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "shipment_disputes_shipment" ON "shipment_disputes"("shipment_id");
