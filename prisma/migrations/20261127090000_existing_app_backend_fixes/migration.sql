-- Additive, reversible. See down.sql. Does not credit deposits.

ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "payment_channel" VARCHAR(32);
CREATE INDEX IF NOT EXISTS "idx_transactions_payment_channel" ON "transactions"("payment_channel");

-- Backfill only when metadata already proves the channel. Leave the rest null.
UPDATE "transactions"
SET "payment_channel" = 'invoice'
WHERE "payment_channel" IS NULL
  AND metadata->>'business_document' = 'invoice';

UPDATE "transactions"
SET "payment_channel" = 'payment_link'
WHERE "payment_channel" IS NULL
  AND metadata->>'business_document' = 'payment_link';

UPDATE "transactions"
SET "payment_channel" = 'qr'
WHERE "payment_channel" IS NULL
  AND (
    metadata->>'channel' = 'qr'
    OR metadata->>'isQrSale' = 'true'
    OR metadata->>'type' = 'qr_sale'
    OR lower(coalesce(metadata->>'source', '')) IN ('qr', 'merchant_qr')
  )
  AND coalesce(metadata->>'business_document', '') NOT IN ('invoice', 'payment_link');

ALTER TABLE "businesses" ADD COLUMN IF NOT EXISTS "public_code" VARCHAR(16);
CREATE UNIQUE INDEX IF NOT EXISTS "businesses_public_code_key" ON "businesses"("public_code");

ALTER TABLE "investment_projects" ADD COLUMN IF NOT EXISTS "discarded_at" TIMESTAMPTZ(6);

ALTER TABLE "chain_deposits" ADD COLUMN IF NOT EXISTS "resolution_note" TEXT;
ALTER TABLE "chain_deposits" ADD COLUMN IF NOT EXISTS "alerted_at" TIMESTAMPTZ(6);
