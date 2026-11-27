DROP TABLE IF EXISTS "delivery_job_events";
DROP TABLE IF EXISTS "proof_of_delivery";
DROP TABLE IF EXISTS "partner_drivers";
DROP TABLE IF EXISTS "partner_vehicles";
ALTER TABLE "delivery_partner_profiles" DROP COLUMN IF EXISTS "company_registration";
ALTER TABLE "delivery_partner_profiles" DROP COLUMN IF EXISTS "service_area";
ALTER TABLE "delivery_partner_profiles" DROP COLUMN IF EXISTS "phone";
