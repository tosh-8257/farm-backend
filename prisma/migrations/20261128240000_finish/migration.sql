ALTER TABLE "supplier_profiles" ADD COLUMN IF NOT EXISTS "regions" TEXT;

CREATE TABLE IF NOT EXISTS "supplier_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" UUID NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "expires_at" TIMESTAMPTZ(6)
);
CREATE INDEX IF NOT EXISTS "supplier_documents_supplier" ON "supplier_documents"("supplier_id");

CREATE TABLE IF NOT EXISTS "supplier_ratings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "score" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("supplier_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "partner_ratings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "partner_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "score" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("partner_id", "user_id")
);
