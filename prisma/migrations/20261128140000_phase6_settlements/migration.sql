CREATE TABLE IF NOT EXISTS "commerce_settlements" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL UNIQUE,
  "retail" DECIMAL(30,8) NOT NULL,
  "supplier_payable" DECIMAL(30,8) NOT NULL,
  "commission_farm" DECIMAL(30,8) NOT NULL,
  "seller_net" DECIMAL(30,8) NOT NULL,
  "lines" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'recorded',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
