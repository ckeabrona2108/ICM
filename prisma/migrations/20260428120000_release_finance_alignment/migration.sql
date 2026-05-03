-- CreateEnum
CREATE TYPE "ReleaseKind" AS ENUM ('STANDARD', 'SINGLE_MAXI', 'MIXTAPE', 'AUDIOBOOK');

-- CreateEnum
CREATE TYPE "PlatformMode" AS ENUM ('ALL', 'SELECTED');

-- CreateEnum
CREATE TYPE "FinanceReportStatus" AS ENUM ('READY_TO_CONFIRM', 'AGREED');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('BANK_TRANSFER', 'PAYPAL', 'OTHER');

-- CreateEnum
CREATE TYPE "PayoutRequestStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "Release"
  ADD COLUMN "subtitle" TEXT,
  ADD COLUMN "subgenre" TEXT,
  ADD COLUMN "releaseKind" "ReleaseKind" NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN "platformMode" "PlatformMode" NOT NULL DEFAULT 'ALL',
  ADD COLUMN "platforms" JSONB,
  ADD COLUMN "partnerCode" TEXT,
  ADD COLUMN "rightsYear" INTEGER,
  ADD COLUMN "moderationRemarks" JSONB,
  ADD COLUMN "moderationReturnedAt" TIMESTAMP(3),
  ADD COLUMN "moderationCancelledAt" TIMESTAMP(3),
  ADD COLUMN "moderationStartedAt" TIMESTAMP(3),
  ADD COLUMN "coverMeta" JSONB,
  ADD COLUMN "submissionData" JSONB;

-- AlterTable
ALTER TABLE "Track"
  ADD COLUMN "subtitle" TEXT,
  ADD COLUMN "partnerCode" TEXT,
  ADD COLUMN "hasAudio" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "metadataLanguage" TEXT,
  ADD COLUMN "previewStart" TEXT,
  ADD COLUMN "instantGratification" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "focusTrack" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "versionExplicit" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "versionLive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "versionCover" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "versionRemix" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "versionInstrumental" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lyrics" TEXT,
  ADD COLUMN "ringtoneDurationSec" DOUBLE PRECISION,
  ADD COLUMN "copyrightPct" DOUBLE PRECISION,
  ADD COLUMN "relatedRightsPct" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "FinanceReport" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" "FinanceReportStatus" NOT NULL DEFAULT 'READY_TO_CONFIRM',
  "agreedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinanceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "method" "PayoutMethod" NOT NULL,
  "requisites" JSONB NOT NULL,
  "status" "PayoutRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "PayoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceReport_userId_status_idx" ON "FinanceReport"("userId", "status");

-- CreateIndex
CREATE INDEX "FinanceReport_userId_periodStart_idx" ON "FinanceReport"("userId", "periodStart");

-- CreateIndex
CREATE INDEX "PayoutRequest_userId_status_idx" ON "PayoutRequest"("userId", "status");

-- CreateIndex
CREATE INDEX "PayoutRequest_createdAt_idx" ON "PayoutRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "FinanceReport" ADD CONSTRAINT "FinanceReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutRequest" ADD CONSTRAINT "PayoutRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
