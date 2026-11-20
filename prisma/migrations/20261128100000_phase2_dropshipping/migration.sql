-- Phase 2 dropshipping tables. Additive. See down.sql.

CREATE TABLE IF NOT EXISTS "supplier_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL UNIQUE,
  "business_id" UUID,
  "kind" VARCHAR(20) NOT NULL,
  "legal_name" VARCHAR(255) NOT NULL,
  "region" VARCHAR(120),
  "terms" TEXT,
  "status" VARCHAR(40) NOT NULL DEFAULT 'draft',
  "review_notes" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "supplier_profiles_status" ON "supplier_profiles"("status");

CREATE TABLE IF NOT EXISTS "supplier_products" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "supplier_id" UUID NOT NULL REFERENCES "supplier_profiles"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "category" VARCHAR(80),
  "description" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "supplier_products_supplier" ON "supplier_products"("supplier_id", "status");

CREATE TABLE IF NOT EXISTS "product_variants" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "product_id" UUID NOT NULL REFERENCES "supplier_products"("id") ON DELETE CASCADE,
  "sku" VARCHAR(64) NOT NULL,
  "wholesale_price" DECIMAL(30,8) NOT NULL,
  "stock" INTEGER NOT NULL DEFAULT 0,
  "reserved" INTEGER NOT NULL DEFAULT 0,
  UNIQUE ("product_id", "sku")
);

CREATE TABLE IF NOT EXISTS "store_listings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "merchant_id" UUID NOT NULL,
  "variant_id" UUID NOT NULL REFERENCES "product_variants"("id"),
  "retail_price" DECIMAL(30,8) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("merchant_id", "variant_id")
);

CREATE TABLE IF NOT EXISTS "sales_orders" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "merchant_id" UUID NOT NULL,
  "buyer_user_id" UUID,
  "idempotency_key" VARCHAR(120) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'placed',
  "payment_transaction_id" UUID,
  "retail_total" DECIMAL(30,8) NOT NULL DEFAULT 0,
  "supplier_total" DECIMAL(30,8) NOT NULL DEFAULT 0,
  "commission_bps" INTEGER,
  "commission_farm" DECIMAL(30,8),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("merchant_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "sales_orders_status" ON "sales_orders"("status");

CREATE TABLE IF NOT EXISTS "sales_order_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL REFERENCES "sales_orders"("id") ON DELETE CASCADE,
  "variant_id" UUID NOT NULL,
  "qty" INTEGER NOT NULL,
  "wholesale" DECIMAL(30,8) NOT NULL,
  "retail" DECIMAL(30,8) NOT NULL
);

CREATE TABLE IF NOT EXISTS "supplier_fulfilments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL REFERENCES "sales_orders"("id") ON DELETE CASCADE,
  "supplier_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  UNIQUE ("order_id", "supplier_id")
);
