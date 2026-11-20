-- Reverse of migration.sql. Not applied by `prisma migrate deploy`.
DROP INDEX IF EXISTS "idx_transactions_payment_channel";
ALTER TABLE "transactions" DROP COLUMN IF EXISTS "payment_channel";

DROP INDEX IF EXISTS "businesses_public_code_key";
ALTER TABLE "businesses" DROP COLUMN IF EXISTS "public_code";

ALTER TABLE "investment_projects" DROP COLUMN IF EXISTS "discarded_at";

ALTER TABLE "chain_deposits" DROP COLUMN IF EXISTS "resolution_note";
ALTER TABLE "chain_deposits" DROP COLUMN IF EXISTS "alerted_at";
