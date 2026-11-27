ALTER TABLE "payout_releases" DROP COLUMN IF EXISTS "attempts";
ALTER TABLE "proof_of_delivery" DROP COLUMN IF EXISTS "failed_attempts";
ALTER TABLE "cargo_shipments" DROP COLUMN IF EXISTS "order_id";
DROP INDEX IF EXISTS "cargo_shipments_payment_tx";
DROP INDEX IF EXISTS "sales_orders_payment_tx";
