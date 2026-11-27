-- Optional street addresses on a shipment. Quotes still use zones only.

ALTER TABLE "cargo_shipments" ADD COLUMN IF NOT EXISTS "pickup_address" TEXT;
ALTER TABLE "cargo_shipments" ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;
