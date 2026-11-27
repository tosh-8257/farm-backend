-- One in-app notice per event key.

CREATE TABLE IF NOT EXISTS "event_notices" (
  "event_key" VARCHAR(160) PRIMARY KEY,
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);
