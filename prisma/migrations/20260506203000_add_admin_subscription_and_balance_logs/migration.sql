-- CreateEnum
CREATE TYPE "SubscriptionSource" AS ENUM ('PAYMENT', 'ADMIN_GRANT');

-- CreateEnum
CREATE TYPE "BalanceAdminAdjustmentType" AS ENUM ('CREDIT', 'DEBIT');

-- AlterTable
ALTER TABLE "Subscription"
  ADD COLUMN "source" "SubscriptionSource" NOT NULL DEFAULT 'PAYMENT',
  ADD COLUMN "admin_comment" TEXT,
  ADD COLUMN "granted_by_admin_id" TEXT;

-- Backfill ends_at from renewalAt for old subscriptions
UPDATE "Subscription"
SET "ends_at" = COALESCE("ends_at", "renewalAt");

-- CreateTable
CREATE TABLE "subscription_admin_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "old_plan" "SubscriptionPlan",
  "new_plan" "SubscriptionPlan",
  "old_status" "SubscriptionStatus",
  "new_status" "SubscriptionStatus",
  "old_ends_at" TIMESTAMP(3),
  "new_ends_at" TIMESTAMP(3),
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_admin_logs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "admin_id" TEXT NOT NULL,
  "type" "BalanceAdminAdjustmentType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "old_balance" DECIMAL(12,2) NOT NULL,
  "new_balance" DECIMAL(12,2) NOT NULL,
  "comment" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "balance_admin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_admin_logs_user_id_created_at_idx" ON "subscription_admin_logs"("user_id", "created_at");
CREATE INDEX "subscription_admin_logs_admin_id_created_at_idx" ON "subscription_admin_logs"("admin_id", "created_at");
CREATE INDEX "balance_admin_logs_user_id_created_at_idx" ON "balance_admin_logs"("user_id", "created_at");
CREATE INDEX "balance_admin_logs_admin_id_created_at_idx" ON "balance_admin_logs"("admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "Subscription"
  ADD CONSTRAINT "Subscription_granted_by_admin_id_fkey"
  FOREIGN KEY ("granted_by_admin_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "subscription_admin_logs"
  ADD CONSTRAINT "subscription_admin_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "subscription_admin_logs_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "balance_admin_logs"
  ADD CONSTRAINT "balance_admin_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "balance_admin_logs_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
