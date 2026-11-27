-- Catalogue images and idempotent stock writes. Additive.

ALTER TABLE "product_variants" ADD COLUMN IF NOT EXISTS "image_url" TEXT;

CREATE TABLE IF NOT EXISTS "variant_stock_writes" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "variant_id" UUID NOT NULL REFERENCES "product_variants"("id") ON DELETE CASCADE,
  "idempotency_key" VARCHAR(120) NOT NULL,
  "stock" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("variant_id", "idempotency_key")
);
