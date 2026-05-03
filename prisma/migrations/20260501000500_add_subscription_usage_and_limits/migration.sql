DO $$ BEGIN
  ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'STANDARD';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Release"
  ADD COLUMN IF NOT EXISTS "priority" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Subscription"
  ADD COLUMN IF NOT EXISTS "ends_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "subscription_usage" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "releases_used" INTEGER NOT NULL DEFAULT 0,
  "ai_requests_used_day" INTEGER NOT NULL DEFAULT 0,
  "ai_requests_used_month" INTEGER NOT NULL DEFAULT 0,
  "last_ai_reset_day" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "subscription_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_usage_user_id_key"
ON "subscription_usage"("user_id");

CREATE INDEX IF NOT EXISTS "subscription_usage_period_start_period_end_idx"
ON "subscription_usage"("period_start", "period_end");
