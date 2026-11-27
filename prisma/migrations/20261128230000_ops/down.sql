DROP TABLE IF EXISTS "commerce_settings";
DROP TABLE IF EXISTS "partner_locations";
DROP TABLE IF EXISTS "partner_documents";
ALTER TABLE "supplier_fulfilments" DROP COLUMN IF EXISTS "tracking";
ALTER TABLE "delivery_partner_profiles" DROP COLUMN IF EXISTS "online";
