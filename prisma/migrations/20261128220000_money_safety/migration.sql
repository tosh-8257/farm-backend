-- One completed payment can settle only one order and one shipment.
-- Payout attempts are counted. Proof guesses are counted.

CREATE UNIQUE INDEX IF NOT EXISTS "sales_orders_payment_tx"
  ON "sales_orders" ("payment_transaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "cargo_shipments_payment_tx"
  ON "cargo_shipments" ("payment_transaction_id");

ALTER TABLE "cargo_shipments" ADD COLUMN IF NOT EXISTS "order_id" UUID;
ALTER TABLE "proof_of_delivery" ADD COLUMN IF NOT EXISTS "failed_attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payout_releases" ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0;
