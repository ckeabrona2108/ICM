-- Canonical bridge from the legacy migration state immediately before this migration
-- to the current Prisma `icecream` schema.
-- Generated from an owned disposable database after applying all earlier migrations.
-- Never generated from or applied to a shared database during development.
-- CreateEnum
CREATE TYPE "icecream"."order_type" AS ENUM ('subscription', 'release');

-- CreateEnum
CREATE TYPE "icecream"."release_status" AS ENUM ('moderating', 'approved', 'rejected', 'not_paid');

-- CreateEnum
CREATE TYPE "icecream"."release_type" AS ENUM ('single', 'album', 'ep');

-- CreateEnum
CREATE TYPE "icecream"."subscribe_level" AS ENUM ('standard', 'professional', 'premium', 'enterprise');

-- CreateEnum
CREATE TYPE "icecream"."token_types" AS ENUM ('confirm', 'recover');

-- CreateEnum
CREATE TYPE "icecream"."verification_status" AS ENUM ('moderating', 'approved', 'rejected');

-- DropForeignKey
ALTER TABLE "icecream"."Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."AdminLog" DROP CONSTRAINT "AdminLog_adminId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."AiGeneration" DROP CONSTRAINT "AiGeneration_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ArtistProfile" DROP CONSTRAINT "ArtistProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."CoverImage" DROP CONSTRAINT "CoverImage_releaseId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."DistributionStatus" DROP CONSTRAINT "DistributionStatus_platformId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."DistributionStatus" DROP CONSTRAINT "DistributionStatus_releaseId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."FinanceReport" DROP CONSTRAINT "FinanceReport_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."MarketingCampaign" DROP CONSTRAINT "MarketingCampaign_releaseId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."MarketingCampaign" DROP CONSTRAINT "MarketingCampaign_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Message" DROP CONSTRAINT "Message_ticketId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Message" DROP CONSTRAINT "Message_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."PayoutRequest" DROP CONSTRAINT "PayoutRequest_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Release" DROP CONSTRAINT "Release_artistProfileId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Release" DROP CONSTRAINT "Release_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ReleaseFile" DROP CONSTRAINT "ReleaseFile_releaseId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Royalty" DROP CONSTRAINT "Royalty_releaseId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Royalty" DROP CONSTRAINT "Royalty_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Subscription" DROP CONSTRAINT "Subscription_granted_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."SubscriptionPayment" DROP CONSTRAINT "SubscriptionPayment_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."SubscriptionPayment" DROP CONSTRAINT "SubscriptionPayment_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."SupportTicket" DROP CONSTRAINT "SupportTicket_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Track" DROP CONSTRAINT "Track_releaseId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."Transaction" DROP CONSTRAINT "Transaction_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ai_chat_messages" DROP CONSTRAINT "ai_chat_messages_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ai_chat_threads" DROP CONSTRAINT "ai_chat_threads_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ai_generations" DROP CONSTRAINT "ai_generations_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ai_token_transactions" DROP CONSTRAINT "ai_token_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ai_uploads" DROP CONSTRAINT "ai_uploads_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ai_user_notifications" DROP CONSTRAINT "ai_user_notifications_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_ai_insights" DROP CONSTRAINT "analytics_ai_insights_artist_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_ai_insights" DROP CONSTRAINT "analytics_ai_insights_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_ai_insights" DROP CONSTRAINT "analytics_ai_insights_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_daily_summaries" DROP CONSTRAINT "analytics_daily_summaries_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_daily_summaries" DROP CONSTRAINT "analytics_daily_summaries_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_import_jobs" DROP CONSTRAINT "analytics_import_jobs_created_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_platform_summaries" DROP CONSTRAINT "analytics_platform_summaries_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_platform_summaries" DROP CONSTRAINT "analytics_platform_summaries_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_report_snapshots" DROP CONSTRAINT "analytics_report_snapshots_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."analytics_report_snapshots" DROP CONSTRAINT "analytics_report_snapshots_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."balance_admin_logs" DROP CONSTRAINT "balance_admin_logs_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."balance_admin_logs" DROP CONSTRAINT "balance_admin_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."balance_transactions" DROP CONSTRAINT "balance_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."catalog_conflicts" DROP CONSTRAINT "catalog_conflicts_matched_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."catalog_conflicts" DROP CONSTRAINT "catalog_conflicts_matched_track_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."catalog_import_rows" DROP CONSTRAINT "catalog_import_rows_created_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."catalog_import_rows" DROP CONSTRAINT "catalog_import_rows_created_track_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."catalog_import_rows" DROP CONSTRAINT "catalog_import_rows_matched_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."catalog_import_rows" DROP CONSTRAINT "catalog_import_rows_matched_track_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."catalog_imports" DROP CONSTRAINT "catalog_imports_created_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."commission_calculations" DROP CONSTRAINT "commission_calculations_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."contract_commission_rates" DROP CONSTRAINT "contract_commission_rates_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."event_artists" DROP CONSTRAINT "event_artists_artist_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."event_financial_transactions" DROP CONSTRAINT "event_financial_transactions_organizer_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."event_payouts" DROP CONSTRAINT "event_payouts_organizer_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."event_tickets" DROP CONSTRAINT "event_tickets_buyer_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."events" DROP CONSTRAINT "events_organizer_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."financeReport" DROP CONSTRAINT "financeReport_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."financial_import_rows" DROP CONSTRAINT "financial_import_rows_matched_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."financial_import_rows" DROP CONSTRAINT "financial_import_rows_matched_track_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."financial_import_rows" DROP CONSTRAINT "financial_import_rows_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."financial_imports" DROP CONSTRAINT "financial_imports_created_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."news_posts" DROP CONSTRAINT "news_posts_created_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."partner_code_usages" DROP CONSTRAINT "partner_code_usages_releaseId_release_id_fk";

-- DropForeignKey
ALTER TABLE "icecream"."partner_code_usages" DROP CONSTRAINT "partner_code_usages_userId_user_id_fk";

-- DropForeignKey
ALTER TABLE "icecream"."partner_codes" DROP CONSTRAINT "partner_codes_allowedUserId_user_id_fk";

-- DropForeignKey
ALTER TABLE "icecream"."partner_codes" DROP CONSTRAINT "partner_codes_createdByAdminId_user_id_fk";

-- DropForeignKey
ALTER TABLE "icecream"."promo_links" DROP CONSTRAINT "promo_links_releaseId_release_id_fk";

-- DropForeignKey
ALTER TABLE "icecream"."promo_submissions" DROP CONSTRAINT "promo_submissions_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."promo_submissions" DROP CONSTRAINT "promo_submissions_reviewed_by_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."promo_submissions" DROP CONSTRAINT "promo_submissions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."promo_urls" DROP CONSTRAINT "promo_urls_promoLinkId_promo_links_id_fk";

-- DropForeignKey
ALTER TABLE "icecream"."push_subscriptions" DROP CONSTRAINT "push_subscriptions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."royalty_transactions" DROP CONSTRAINT "royalty_transactions_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."royalty_transactions" DROP CONSTRAINT "royalty_transactions_track_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."royalty_transactions" DROP CONSTRAINT "royalty_transactions_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."staff_access_tokens" DROP CONSTRAINT "staff_access_tokens_created_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."subscription_admin_logs" DROP CONSTRAINT "subscription_admin_logs_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."subscription_admin_logs" DROP CONSTRAINT "subscription_admin_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."subscription_usage" DROP CONSTRAINT "subscription_usage_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ticket_checkins" DROP CONSTRAINT "ticket_checkins_checked_in_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."ticket_orders" DROP CONSTRAINT "ticket_orders_buyer_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."transaction" DROP CONSTRAINT "transaction_userId_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."unmatched_analytics_imports" DROP CONSTRAINT "unmatched_analytics_imports_resolved_by_admin_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."unmatched_analytics_imports" DROP CONSTRAINT "unmatched_analytics_imports_resolved_release_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."user_commission_rates" DROP CONSTRAINT "user_commission_rates_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."user_contract_signatures" DROP CONSTRAINT "user_contract_signatures_user_id_fkey";

-- DropForeignKey
ALTER TABLE "icecream"."venues" DROP CONSTRAINT "venues_owner_user_id_fkey";

-- DropIndex
DROP INDEX "icecream"."Message_ticketId_createdAt_idx";

-- DropIndex
DROP INDEX "icecream"."SupportTicket_userId_updatedAt_idx";

-- DropIndex
DROP INDEX "icecream"."promo_submissions_status_created_at_idx";

-- DropIndex
DROP INDEX "icecream"."promo_submissions_user_id_created_at_idx";

-- AlterTable
ALTER TABLE "icecream"."Message" DROP CONSTRAINT "Message_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
DROP COLUMN "ticketId",
ADD COLUMN     "ticketId" UUID,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(6),
ADD CONSTRAINT "Message_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "icecream"."SupportTicket" DROP CONSTRAINT "SupportTicket_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(6),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(6),
ALTER COLUMN "closedAt" SET DATA TYPE TIMESTAMP(6),
ADD CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "icecream"."ai_chat_messages" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."ai_chat_threads" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."ai_generations" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."ai_models" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."ai_token_packages" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."ai_token_transactions" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."ai_uploads" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."ai_user_notifications" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."analytics_daily_summaries" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
DROP COLUMN "release_id",
ADD COLUMN     "release_id" UUID;

-- AlterTable
ALTER TABLE "icecream"."analytics_import_jobs" DROP COLUMN "created_by_admin_id",
ADD COLUMN     "created_by_admin_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."analytics_platform_summaries" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
DROP COLUMN "release_id",
ADD COLUMN     "release_id" UUID;

-- AlterTable
ALTER TABLE "icecream"."analytics_report_snapshots" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
DROP COLUMN "release_id",
ADD COLUMN     "release_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."balance_transactions" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."catalog_conflicts" DROP COLUMN "matched_release_id",
ADD COLUMN     "matched_release_id" UUID,
DROP COLUMN "matched_track_id",
ADD COLUMN     "matched_track_id" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."catalog_import_rows" DROP COLUMN "matched_release_id",
ADD COLUMN     "matched_release_id" UUID,
DROP COLUMN "matched_track_id",
ADD COLUMN     "matched_track_id" UUID,
DROP COLUMN "created_release_id",
ADD COLUMN     "created_release_id" UUID,
DROP COLUMN "created_track_id",
ADD COLUMN     "created_track_id" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."catalog_imports" DROP COLUMN "created_by_admin_id",
ADD COLUMN     "created_by_admin_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."commission_calculations" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "icecream"."contract_commission_rates" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."event_artists" DROP COLUMN "artist_user_id",
ADD COLUMN     "artist_user_id" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."event_financial_transactions" DROP COLUMN "organizer_user_id",
ADD COLUMN     "organizer_user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."event_images" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."event_payouts" DROP COLUMN "organizer_user_id",
ADD COLUMN     "organizer_user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."event_ticket_types" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."event_tickets" DROP COLUMN "buyer_user_id",
ADD COLUMN     "buyer_user_id" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."events" DROP COLUMN "organizer_user_id",
ADD COLUMN     "organizer_user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."financeReport" DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."financial_import_rows" DROP COLUMN "matched_release_id",
ADD COLUMN     "matched_release_id" UUID,
DROP COLUMN "matched_track_id",
ADD COLUMN     "matched_track_id" UUID,
DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."financial_imports" DROP COLUMN "created_by_admin_id",
ADD COLUMN     "created_by_admin_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."label_commission_rates" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."partner_code_usages" DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
DROP COLUMN "releaseId",
ADD COLUMN     "releaseId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."partner_codes" DROP COLUMN "allowedUserId",
ADD COLUMN     "allowedUserId" UUID,
ALTER COLUMN "updatedAt" DROP DEFAULT,
DROP COLUMN "createdByAdminId",
ADD COLUMN     "createdByAdminId" UUID;

-- AlterTable
ALTER TABLE "icecream"."platform_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."promo_links" DROP CONSTRAINT "promo_links_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "releaseId",
ADD COLUMN     "releaseId" UUID NOT NULL,
ADD CONSTRAINT "promo_links_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "icecream"."promo_submissions" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
DROP COLUMN "release_id",
ADD COLUMN     "release_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT,
DROP COLUMN "reviewed_by",
ADD COLUMN     "reviewed_by" UUID;

-- AlterTable
ALTER TABLE "icecream"."promo_urls" DROP CONSTRAINT "promo_urls_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT gen_random_uuid(),
DROP COLUMN "promoLinkId",
ADD COLUMN     "promoLinkId" UUID,
ADD CONSTRAINT "promo_urls_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "icecream"."push_subscriptions" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."royalty_transactions" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
DROP COLUMN "release_id",
ADD COLUMN     "release_id" UUID,
DROP COLUMN "track_id",
ADD COLUMN     "track_id" UUID;

-- AlterTable
ALTER TABLE "icecream"."staff_access_tokens" DROP COLUMN "created_by_user_id",
ADD COLUMN     "created_by_user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."ticket_checkins" DROP COLUMN "checked_in_by_user_id",
ADD COLUMN     "checked_in_by_user_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."ticket_orders" DROP COLUMN "buyer_user_id",
ADD COLUMN     "buyer_user_id" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."ticket_payments" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."transaction" DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "icecream"."unmatched_analytics_imports" DROP COLUMN "resolved_by_admin_id",
ADD COLUMN     "resolved_by_admin_id" UUID,
DROP COLUMN "resolved_release_id",
ADD COLUMN     "resolved_release_id" UUID;

-- AlterTable
ALTER TABLE "icecream"."user_commission_rates" DROP COLUMN "user_id",
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "icecream"."venues" DROP COLUMN "owner_user_id",
ADD COLUMN     "owner_user_id" UUID,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "icecream"."Account";

-- DropTable
DROP TABLE "icecream"."AdminLog";

-- DropTable
DROP TABLE "icecream"."AiGeneration";

-- DropTable
DROP TABLE "icecream"."ArtistProfile";

-- DropTable
DROP TABLE "icecream"."CoverImage";

-- DropTable
DROP TABLE "icecream"."DistributionStatus";

-- DropTable
DROP TABLE "icecream"."FinanceReport";

-- DropTable
DROP TABLE "icecream"."MarketingCampaign";

-- DropTable
DROP TABLE "icecream"."PayoutRequest";

-- DropTable
DROP TABLE "icecream"."Platform";

-- DropTable
DROP TABLE "icecream"."Release";

-- DropTable
DROP TABLE "icecream"."ReleaseFile";

-- DropTable
DROP TABLE "icecream"."Royalty";

-- DropTable
DROP TABLE "icecream"."Session";

-- DropTable
DROP TABLE "icecream"."Subscription";

-- DropTable
DROP TABLE "icecream"."SubscriptionPayment";

-- DropTable
DROP TABLE "icecream"."Track";

-- DropTable
DROP TABLE "icecream"."Transaction";

-- DropTable
DROP TABLE "icecream"."User";

-- DropTable
DROP TABLE "icecream"."VerificationToken";

-- DropTable
DROP TABLE "icecream"."analytics_ai_insights";

-- DropTable
DROP TABLE "icecream"."balance_admin_logs";

-- DropTable
DROP TABLE "icecream"."news_posts";

-- DropTable
DROP TABLE "icecream"."subscription_admin_logs";

-- DropTable
DROP TABLE "icecream"."subscription_usage";

-- DropTable
DROP TABLE "icecream"."user_contract_signatures";

-- DropEnum
DROP TYPE "icecream"."AiToolType";

-- DropEnum
DROP TYPE "icecream"."AnalyticsAiInsightStatus";

-- DropEnum
DROP TYPE "icecream"."BalanceAdminAdjustmentType";

-- DropEnum
DROP TYPE "icecream"."CampaignStatus";

-- DropEnum
DROP TYPE "icecream"."ContractSignatureStatus";

-- DropEnum
DROP TYPE "icecream"."NewsPostStatus";

-- DropEnum
DROP TYPE "icecream"."PaymentProvider";

-- DropEnum
DROP TYPE "icecream"."PaymentStatus";

-- DropEnum
DROP TYPE "icecream"."PlatformDeliveryStatus";

-- DropEnum
DROP TYPE "icecream"."PlatformMode";

-- DropEnum
DROP TYPE "icecream"."ReleaseKind";

-- DropEnum
DROP TYPE "icecream"."ReleaseStatus";

-- DropEnum
DROP TYPE "icecream"."ReleaseType";

-- DropEnum
DROP TYPE "icecream"."Role";

-- DropEnum
DROP TYPE "icecream"."SubscriptionPlan";

-- DropEnum
DROP TYPE "icecream"."SubscriptionSource";

-- DropEnum
DROP TYPE "icecream"."SubscriptionStatus";

-- CreateTable
CREATE TABLE "icecream"."accounts" (
    "user_id" UUID NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "provider" VARCHAR(256) NOT NULL,
    "provider_ccount_id" VARCHAR(256) NOT NULL,
    "refresh_token" VARCHAR(1024),
    "access_token" VARCHAR(1024),
    "expires_at" TIMESTAMP(6),
    "token_type" VARCHAR(256),
    "scope" VARCHAR(256),
    "id_token" VARCHAR(256),
    "session_state" VARCHAR(256)
);

-- CreateTable
CREATE TABLE "icecream"."analytics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "periodStart" TIMESTAMP(6) NOT NULL,
    "periodFinish" TIMESTAMP(6) NOT NULL,
    "reportFileUrl" TEXT,
    "flourishReportMarkup" TEXT NOT NULL,

    CONSTRAINT "analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."faq" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,

    CONSTRAINT "faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."news" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "preview" TEXT NOT NULL,

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."orders" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID NOT NULL,
    "type" "icecream"."order_type" NOT NULL,
    "metadata" JSONB NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "payment_status" TEXT NOT NULL DEFAULT 'pending_payment',
    "completed_at" TIMESTAMP(6),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."payment_methods" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "metadata" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "confirmed" BOOLEAN DEFAULT false,
    "recieverName" TEXT,
    "amount" DOUBLE PRECISION,
    "accountNumber" TEXT,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."release" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "preview" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(6) NOT NULL,
    "upc" TEXT,
    "userId" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "subtitle" TEXT,
    "performer" TEXT,
    "feat" TEXT,
    "remixer" TEXT,
    "genre" TEXT NOT NULL,
    "labelName" TEXT,
    "startDate" TIMESTAMP(6) NOT NULL,
    "preorderDate" TIMESTAMP(6) NOT NULL,
    "platforms" JSONB,
    "area" JSONB,
    "type" "icecream"."release_type" NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "rejectReason" TEXT,
    "status" "icecream"."verification_status" NOT NULL DEFAULT 'moderating',
    "roles" JSONB,
    "moderatorComment" TEXT,
    "earlyStartInRussia" BOOLEAN,
    "realTimeDelivery" BOOLEAN,
    "yandexSoonNewRelease" TIMESTAMP(6),

    CONSTRAINT "release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."scene_release_reactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "reaction" VARCHAR(24) NOT NULL,
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_release_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."scene_release_plays" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_release_plays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."artist_profile_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "profile_key" VARCHAR(160) NOT NULL,
    "release_id" UUID,
    "content" TEXT NOT NULL,
    "media_type" VARCHAR(16),
    "media_key" VARCHAR(500),
    "media_name" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "artist_profile_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."artist_profile_post_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "content" VARCHAR(800) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "edited_at" TIMESTAMP(6),
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "artist_profile_post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."artist_profile_post_likes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "reaction" VARCHAR(24) NOT NULL DEFAULT 'heart',
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_profile_post_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."scene_release_likes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "reaction" VARCHAR(24) NOT NULL DEFAULT 'heart',
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scene_release_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."scene_release_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "release_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "content" VARCHAR(800) NOT NULL,
    "media_key" VARCHAR(500),
    "media_name" VARCHAR(255),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,
    "edited_at" TIMESTAMP(6),
    "deleted_at" TIMESTAMP(6),

    CONSTRAINT "scene_release_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."artist_profile_followers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "profile_user_id" UUID NOT NULL,
    "profile_key" VARCHAR(160) NOT NULL,
    "follower_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_profile_followers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."social_user_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "blocker_user_id" UUID NOT NULL,
    "blocked_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_user_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."social_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reporter_user_id" UUID NOT NULL,
    "reported_user_id" UUID NOT NULL,
    "target_type" VARCHAR(32) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "details" VARCHAR(1000),
    "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "social_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."sessions" (
    "session_token" VARCHAR(128) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_token")
);

-- CreateTable
CREATE TABLE "icecream"."studio_photos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "studioId" UUID NOT NULL,

    CONSTRAINT "studio_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."studio_stats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studioId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "studio_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."studio_team" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "studioId" UUID NOT NULL,
    "photo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "place" TEXT NOT NULL,

    CONSTRAINT "studio_team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."studios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "logo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rating" REAL NOT NULL DEFAULT 0,
    "address" TEXT NOT NULL,
    "description" TEXT,
    "background" TEXT,
    "annotation" TEXT,
    "lattitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "contact_url" TEXT,

    CONSTRAINT "studios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."track" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "releaseId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "isrc" TEXT,
    "partner_code" TEXT,
    "roles" JSONB,
    "preview_start" TEXT NOT NULL,
    "instant_gratification_date" TIMESTAMP(6),
    "focus" BOOLEAN NOT NULL DEFAULT false,
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "live" BOOLEAN NOT NULL DEFAULT false,
    "cover" BOOLEAN NOT NULL DEFAULT false,
    "remix" BOOLEAN NOT NULL DEFAULT false,
    "instrumental" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL,
    "text" TEXT,
    "track" TEXT NOT NULL,
    "text_sync" TEXT,
    "ringtone" TEXT,
    "video" TEXT,
    "author_rights" TEXT NOT NULL,
    "video_shot" TEXT,
    "index" SMALLINT NOT NULL,

    CONSTRAINT "track_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(6),
    "avatar" TEXT,
    "artistProfileType" TEXT NOT NULL DEFAULT 'artist',
    "password" TEXT,
    "verificationToken" TEXT,
    "resetPasswordToken" TEXT,
    "isVerifiedAuthor" BOOLEAN NOT NULL DEFAULT false,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "subscribeLevel" "icecream"."subscribe_level",
    "expiresAt" TIMESTAMP(6),
    "freeReleases" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiTokenBalance" INTEGER NOT NULL DEFAULT 0,
    "aiPendingTokenBalance" INTEGER NOT NULL DEFAULT 0,
    "aiMonthlyBonusLastGrantedAt" TIMESTAMP(6),
    "birthDate" TIMESTAMP(6),
    "country" TEXT,
    "label" TEXT,
    "personalSiteUrl" TEXT,
    "telegram" TEXT,
    "vk" TEXT,
    "whatsup" TEXT,
    "viber" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."direct_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "participant_a_id" UUID NOT NULL,
    "participant_b_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden_for_participant_a_at" TIMESTAMP(6),
    "hidden_for_participant_b_at" TIMESTAMP(6),

    CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."direct_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_for_everyone_at" TIMESTAMP(6),
    "deleted_for_sender_at" TIMESTAMP(6),

    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."payoutRequest" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "icecream"."PayoutMethod" NOT NULL,
    "status" "icecream"."PayoutRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "requisites" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "processedAt" TIMESTAMP(6),
    "paidAt" TIMESTAMP(6),
    "rejectedAt" TIMESTAMP(6),

    CONSTRAINT "payoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."playlist_placements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "releaseId" UUID,
    "platform" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "artistName" TEXT,
    "trackTitle" TEXT,
    "position" TEXT,
    "playlistName" TEXT NOT NULL,
    "playlistUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "playlist_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."royalty" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "releaseId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "statementDate" TIMESTAMP(6) NOT NULL,
    "streams" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "royalty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(6) NOT NULL,
    "birthPlace" TEXT NOT NULL,
    "tel" TEXT NOT NULL,
    "passSeries" TEXT NOT NULL,
    "passNum" TEXT NOT NULL,
    "getDate" TIMESTAMP(6) NOT NULL,
    "givenBy" TEXT NOT NULL,
    "subunitCode" TEXT NOT NULL,
    "registrationAddress" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "status" "icecream"."verification_status" NOT NULL DEFAULT 'moderating',
    "rejectReason" TEXT,
    "contract" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icecream"."verification_tokens" (
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(6) NOT NULL,
    "type" "icecream"."token_types" NOT NULL,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE INDEX "scene_release_reactions_release_id_created_at_idx" ON "icecream"."scene_release_reactions"("release_id", "created_at");

-- CreateIndex
CREATE INDEX "scene_release_reactions_visitor_id_created_at_idx" ON "icecream"."scene_release_reactions"("visitor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scene_release_reactions_release_id_visitor_id_reaction_key" ON "icecream"."scene_release_reactions"("release_id", "visitor_id", "reaction");

-- CreateIndex
CREATE INDEX "scene_release_plays_release_id_created_at_idx" ON "icecream"."scene_release_plays"("release_id", "created_at");

-- CreateIndex
CREATE INDEX "scene_release_plays_visitor_id_created_at_idx" ON "icecream"."scene_release_plays"("visitor_id", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_posts_user_id_profile_key_created_at_idx" ON "icecream"."artist_profile_posts"("user_id", "profile_key", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_posts_release_id_idx" ON "icecream"."artist_profile_posts"("release_id");

-- CreateIndex
CREATE INDEX "artist_profile_post_comments_post_id_created_at_idx" ON "icecream"."artist_profile_post_comments"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_post_comments_post_id_parent_id_created_at_idx" ON "icecream"."artist_profile_post_comments"("post_id", "parent_id", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_post_comments_user_id_created_at_idx" ON "icecream"."artist_profile_post_comments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_post_comments_parent_id_created_at_idx" ON "icecream"."artist_profile_post_comments"("parent_id", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_post_likes_post_id_reaction_created_at_idx" ON "icecream"."artist_profile_post_likes"("post_id", "reaction", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_post_likes_post_id_created_at_idx" ON "icecream"."artist_profile_post_likes"("post_id", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_post_likes_visitor_id_created_at_idx" ON "icecream"."artist_profile_post_likes"("visitor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "artist_profile_post_likes_post_id_visitor_id_key" ON "icecream"."artist_profile_post_likes"("post_id", "visitor_id");

-- CreateIndex
CREATE INDEX "scene_release_likes_release_id_reaction_created_at_idx" ON "icecream"."scene_release_likes"("release_id", "reaction", "created_at");

-- CreateIndex
CREATE INDEX "scene_release_likes_release_id_created_at_idx" ON "icecream"."scene_release_likes"("release_id", "created_at");

-- CreateIndex
CREATE INDEX "scene_release_likes_visitor_id_created_at_idx" ON "icecream"."scene_release_likes"("visitor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "scene_release_likes_release_id_visitor_id_key" ON "icecream"."scene_release_likes"("release_id", "visitor_id");

-- CreateIndex
CREATE INDEX "scene_release_comments_release_id_created_at_idx" ON "icecream"."scene_release_comments"("release_id", "created_at");

-- CreateIndex
CREATE INDEX "scene_release_comments_release_id_parent_id_created_at_idx" ON "icecream"."scene_release_comments"("release_id", "parent_id", "created_at");

-- CreateIndex
CREATE INDEX "scene_release_comments_user_id_created_at_idx" ON "icecream"."scene_release_comments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "scene_release_comments_parent_id_created_at_idx" ON "icecream"."scene_release_comments"("parent_id", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_followers_profile_user_id_profile_key_create_idx" ON "icecream"."artist_profile_followers"("profile_user_id", "profile_key", "created_at");

-- CreateIndex
CREATE INDEX "artist_profile_followers_follower_user_id_created_at_idx" ON "icecream"."artist_profile_followers"("follower_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "artist_profile_followers_profile_user_id_profile_key_follow_key" ON "icecream"."artist_profile_followers"("profile_user_id", "profile_key", "follower_user_id");

-- CreateIndex
CREATE INDEX "social_user_blocks_blocker_user_id_created_at_idx" ON "icecream"."social_user_blocks"("blocker_user_id", "created_at");

-- CreateIndex
CREATE INDEX "social_user_blocks_blocked_user_id_created_at_idx" ON "icecream"."social_user_blocks"("blocked_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_user_blocks_blocker_user_id_blocked_user_id_key" ON "icecream"."social_user_blocks"("blocker_user_id", "blocked_user_id");

-- CreateIndex
CREATE INDEX "social_reports_reported_user_id_status_created_at_idx" ON "icecream"."social_reports"("reported_user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "social_reports_status_created_at_idx" ON "icecream"."social_reports"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_reports_reporter_user_id_target_type_target_id_key" ON "icecream"."social_reports"("reporter_user_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_unique" ON "icecream"."user"("email");

-- CreateIndex
CREATE INDEX "direct_conversations_participant_a_idx" ON "icecream"."direct_conversations"("participant_a_id", "updated_at");

-- CreateIndex
CREATE INDEX "direct_conversations_participant_b_idx" ON "icecream"."direct_conversations"("participant_b_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "direct_conversations_unique_pair" ON "icecream"."direct_conversations"("participant_a_id", "participant_b_id");

-- CreateIndex
CREATE INDEX "direct_messages_conversation_created_idx" ON "icecream"."direct_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "payoutRequest_userId_createdAt_idx" ON "icecream"."payoutRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "payoutRequest_status_createdAt_idx" ON "icecream"."payoutRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "playlist_placements_userId_createdAt_idx" ON "icecream"."playlist_placements"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "playlist_placements_releaseId_createdAt_idx" ON "icecream"."playlist_placements"("releaseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_placements_platform_upc_playlistUrl_key" ON "icecream"."playlist_placements"("platform", "upc", "playlistUrl");

-- CreateIndex
CREATE INDEX "royalty_userId_statementDate_idx" ON "icecream"."royalty"("userId", "statementDate");

-- CreateIndex
CREATE INDEX "royalty_releaseId_statementDate_idx" ON "icecream"."royalty"("releaseId", "statementDate");

-- CreateIndex
CREATE INDEX "Message_userId_createdAt_idx" ON "icecream"."Message"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_chat_messages_user_id_created_at_idx" ON "icecream"."ai_chat_messages"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_chat_threads_user_id_updated_at_idx" ON "icecream"."ai_chat_threads"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_chat_threads_user_id_last_message_at_idx" ON "icecream"."ai_chat_threads"("user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "ai_generations_user_id_created_at_idx" ON "icecream"."ai_generations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_token_transactions_user_id_created_at_idx" ON "icecream"."ai_token_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_uploads_user_id_created_at_idx" ON "icecream"."ai_uploads"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_user_notifications_user_id_created_at_idx" ON "icecream"."ai_user_notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "analytics_daily_summaries_user_id_report_date_idx" ON "icecream"."analytics_daily_summaries"("user_id", "report_date");

-- CreateIndex
CREATE INDEX "analytics_daily_summaries_release_id_report_date_idx" ON "icecream"."analytics_daily_summaries"("release_id", "report_date");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_daily_summaries_user_id_release_id_report_date_key" ON "icecream"."analytics_daily_summaries"("user_id", "release_id", "report_date");

-- CreateIndex
CREATE INDEX "analytics_platform_summaries_user_id_report_date_idx" ON "icecream"."analytics_platform_summaries"("user_id", "report_date");

-- CreateIndex
CREATE INDEX "analytics_platform_summaries_release_id_report_date_idx" ON "icecream"."analytics_platform_summaries"("release_id", "report_date");

-- CreateIndex
CREATE INDEX "analytics_report_snapshots_user_id_report_date_idx" ON "icecream"."analytics_report_snapshots"("user_id", "report_date");

-- CreateIndex
CREATE INDEX "analytics_report_snapshots_release_id_report_date_idx" ON "icecream"."analytics_report_snapshots"("release_id", "report_date");

-- CreateIndex
CREATE INDEX "balance_transactions_user_id_created_at_idx" ON "icecream"."balance_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "catalog_imports_created_by_admin_id_created_at_idx" ON "icecream"."catalog_imports"("created_by_admin_id", "created_at");

-- CreateIndex
CREATE INDEX "contract_commission_rates_user_id_active_idx" ON "icecream"."contract_commission_rates"("user_id", "active");

-- CreateIndex
CREATE INDEX "event_financial_transactions_organizer_user_id_created_at_idx" ON "icecream"."event_financial_transactions"("organizer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "event_payouts_organizer_user_id_requested_at_idx" ON "icecream"."event_payouts"("organizer_user_id", "requested_at");

-- CreateIndex
CREATE INDEX "event_tickets_buyer_user_id_created_at_idx" ON "icecream"."event_tickets"("buyer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "events_organizer_user_id_status_starts_at_idx" ON "icecream"."events"("organizer_user_id", "status", "starts_at");

-- CreateIndex
CREATE INDEX "events_slug_idx" ON "icecream"."events"("slug");

-- CreateIndex
CREATE INDEX "financeReport_userId_periodStart_periodEnd_idx" ON "icecream"."financeReport"("userId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "financial_imports_created_by_admin_id_created_at_idx" ON "icecream"."financial_imports"("created_by_admin_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "partner_code_usages_partnerCodeId_releaseId_key" ON "icecream"."partner_code_usages"("partnerCodeId", "releaseId");

-- CreateIndex
CREATE INDEX "promo_submissions_status_created_at_idx" ON "icecream"."promo_submissions"("status", "created_at");

-- CreateIndex
CREATE INDEX "promo_submissions_user_id_created_at_idx" ON "icecream"."promo_submissions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "promo_submissions_release_id_idx" ON "icecream"."promo_submissions"("release_id");

-- CreateIndex
CREATE UNIQUE INDEX "promo_submissions_user_id_release_id_key" ON "icecream"."promo_submissions"("user_id", "release_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "icecream"."push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "royalty_transactions_user_id_created_at_idx" ON "icecream"."royalty_transactions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ticket_orders_buyer_user_id_created_at_idx" ON "icecream"."ticket_orders"("buyer_user_id", "created_at");

-- CreateIndex
CREATE INDEX "transaction_userId_createdAt_idx" ON "icecream"."transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "user_commission_rates_user_id_active_idx" ON "icecream"."user_commission_rates"("user_id", "active");

-- CreateIndex
CREATE INDEX "venues_owner_user_id_created_at_idx" ON "icecream"."venues"("owner_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "icecream"."accounts" ADD CONSTRAINT "accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "icecream"."analytics" ADD CONSTRAINT "analytics_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."partner_codes" ADD CONSTRAINT "partner_codes_allowedUserId_fkey" FOREIGN KEY ("allowedUserId") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."partner_codes" ADD CONSTRAINT "partner_codes_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."orders" ADD CONSTRAINT "orders_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."payment_methods" ADD CONSTRAINT "payment_methods_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."payouts" ADD CONSTRAINT "payouts_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."promo_links" ADD CONSTRAINT "promo_links_releaseId_release_id_fk" FOREIGN KEY ("releaseId") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."promo_urls" ADD CONSTRAINT "promo_urls_promoLinkId_promo_links_id_fk" FOREIGN KEY ("promoLinkId") REFERENCES "icecream"."promo_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."promo_submissions" ADD CONSTRAINT "promo_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."promo_submissions" ADD CONSTRAINT "promo_submissions_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."promo_submissions" ADD CONSTRAINT "promo_submissions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."venues" ADD CONSTRAINT "venues_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."events" ADD CONSTRAINT "events_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."event_artists" ADD CONSTRAINT "event_artists_artist_user_id_fkey" FOREIGN KEY ("artist_user_id") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."ticket_orders" ADD CONSTRAINT "ticket_orders_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."event_tickets" ADD CONSTRAINT "event_tickets_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."staff_access_tokens" ADD CONSTRAINT "staff_access_tokens_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."ticket_checkins" ADD CONSTRAINT "ticket_checkins_checked_in_by_user_id_fkey" FOREIGN KEY ("checked_in_by_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."event_financial_transactions" ADD CONSTRAINT "event_financial_transactions_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."event_payouts" ADD CONSTRAINT "event_payouts_organizer_user_id_fkey" FOREIGN KEY ("organizer_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."release" ADD CONSTRAINT "release_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."scene_release_reactions" ADD CONSTRAINT "scene_release_reactions_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."scene_release_plays" ADD CONSTRAINT "scene_release_plays_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."artist_profile_posts" ADD CONSTRAINT "artist_profile_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."artist_profile_posts" ADD CONSTRAINT "artist_profile_posts_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."artist_profile_post_comments" ADD CONSTRAINT "artist_profile_post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "icecream"."artist_profile_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."artist_profile_post_comments" ADD CONSTRAINT "artist_profile_post_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."artist_profile_post_comments" ADD CONSTRAINT "artist_profile_post_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "icecream"."artist_profile_post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."artist_profile_post_likes" ADD CONSTRAINT "artist_profile_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "icecream"."artist_profile_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."scene_release_likes" ADD CONSTRAINT "scene_release_likes_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."scene_release_comments" ADD CONSTRAINT "scene_release_comments_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."scene_release_comments" ADD CONSTRAINT "scene_release_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."scene_release_comments" ADD CONSTRAINT "scene_release_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "icecream"."scene_release_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."artist_profile_followers" ADD CONSTRAINT "artist_profile_followers_profile_user_id_fkey" FOREIGN KEY ("profile_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."artist_profile_followers" ADD CONSTRAINT "artist_profile_followers_follower_user_id_fkey" FOREIGN KEY ("follower_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."social_user_blocks" ADD CONSTRAINT "social_user_blocks_blocker_user_id_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."social_user_blocks" ADD CONSTRAINT "social_user_blocks_blocked_user_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."social_reports" ADD CONSTRAINT "social_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."social_reports" ADD CONSTRAINT "social_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."sessions" ADD CONSTRAINT "sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "icecream"."studio_photos" ADD CONSTRAINT "studio_photos_studioId_studios_id_fk" FOREIGN KEY ("studioId") REFERENCES "icecream"."studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."studio_stats" ADD CONSTRAINT "studio_stats_studioId_studios_id_fk" FOREIGN KEY ("studioId") REFERENCES "icecream"."studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."studio_team" ADD CONSTRAINT "studio_team_studioId_studios_id_fk" FOREIGN KEY ("studioId") REFERENCES "icecream"."studios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."track" ADD CONSTRAINT "track_releaseId_release_id_fk" FOREIGN KEY ("releaseId") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."partner_code_usages" ADD CONSTRAINT "partner_code_usages_releaseId_release_id_fk" FOREIGN KEY ("releaseId") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."partner_code_usages" ADD CONSTRAINT "partner_code_usages_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."ai_generations" ADD CONSTRAINT "ai_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."ai_uploads" ADD CONSTRAINT "ai_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."ai_chat_threads" ADD CONSTRAINT "ai_chat_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."ai_token_transactions" ADD CONSTRAINT "ai_token_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."ai_user_notifications" ADD CONSTRAINT "ai_user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."financeReport" ADD CONSTRAINT "financeReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."transaction" ADD CONSTRAINT "transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."Message" ADD CONSTRAINT "Message_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "icecream"."SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."direct_conversations" ADD CONSTRAINT "direct_conversations_participant_a_id_fkey" FOREIGN KEY ("participant_a_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."direct_conversations" ADD CONSTRAINT "direct_conversations_participant_b_id_fkey" FOREIGN KEY ("participant_b_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "icecream"."direct_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."direct_messages" ADD CONSTRAINT "direct_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."payoutRequest" ADD CONSTRAINT "payoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."playlist_placements" ADD CONSTRAINT "playlist_placements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."playlist_placements" ADD CONSTRAINT "playlist_placements_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."royalty" ADD CONSTRAINT "royalty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."royalty" ADD CONSTRAINT "royalty_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."catalog_imports" ADD CONSTRAINT "catalog_imports_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."catalog_import_rows" ADD CONSTRAINT "catalog_import_rows_matched_release_id_fkey" FOREIGN KEY ("matched_release_id") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."catalog_import_rows" ADD CONSTRAINT "catalog_import_rows_matched_track_id_fkey" FOREIGN KEY ("matched_track_id") REFERENCES "icecream"."track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."catalog_import_rows" ADD CONSTRAINT "catalog_import_rows_created_release_id_fkey" FOREIGN KEY ("created_release_id") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."catalog_import_rows" ADD CONSTRAINT "catalog_import_rows_created_track_id_fkey" FOREIGN KEY ("created_track_id") REFERENCES "icecream"."track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."catalog_conflicts" ADD CONSTRAINT "catalog_conflicts_matched_release_id_fkey" FOREIGN KEY ("matched_release_id") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."catalog_conflicts" ADD CONSTRAINT "catalog_conflicts_matched_track_id_fkey" FOREIGN KEY ("matched_track_id") REFERENCES "icecream"."track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."financial_imports" ADD CONSTRAINT "financial_imports_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."financial_import_rows" ADD CONSTRAINT "financial_import_rows_matched_release_id_fkey" FOREIGN KEY ("matched_release_id") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."financial_import_rows" ADD CONSTRAINT "financial_import_rows_matched_track_id_fkey" FOREIGN KEY ("matched_track_id") REFERENCES "icecream"."track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."financial_import_rows" ADD CONSTRAINT "financial_import_rows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."royalty_transactions" ADD CONSTRAINT "royalty_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."royalty_transactions" ADD CONSTRAINT "royalty_transactions_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."royalty_transactions" ADD CONSTRAINT "royalty_transactions_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "icecream"."track"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."commission_calculations" ADD CONSTRAINT "commission_calculations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."balance_transactions" ADD CONSTRAINT "balance_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."user_commission_rates" ADD CONSTRAINT "user_commission_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."contract_commission_rates" ADD CONSTRAINT "contract_commission_rates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."verification" ADD CONSTRAINT "verification_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."verification_tokens" ADD CONSTRAINT "verification_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "icecream"."analytics_report_snapshots" ADD CONSTRAINT "analytics_report_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."analytics_report_snapshots" ADD CONSTRAINT "analytics_report_snapshots_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."analytics_daily_summaries" ADD CONSTRAINT "analytics_daily_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."analytics_daily_summaries" ADD CONSTRAINT "analytics_daily_summaries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."analytics_platform_summaries" ADD CONSTRAINT "analytics_platform_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."analytics_platform_summaries" ADD CONSTRAINT "analytics_platform_summaries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."analytics_import_jobs" ADD CONSTRAINT "analytics_import_jobs_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."unmatched_analytics_imports" ADD CONSTRAINT "unmatched_analytics_imports_resolved_by_admin_id_fkey" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "icecream"."user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icecream"."unmatched_analytics_imports" ADD CONSTRAINT "unmatched_analytics_imports_resolved_release_id_fkey" FOREIGN KEY ("resolved_release_id") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;
