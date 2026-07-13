DO $$
BEGIN
  CREATE TYPE "icecream"."FinanceReportStatus" AS ENUM ('READY_TO_CONFIRM', 'AGREED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."TransactionType" AS ENUM ('ROYALTY', 'PAYOUT', 'FEE', 'REFUND');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "icecream"."financeReport" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "periodStart" TIMESTAMP(6) NOT NULL,
  "periodEnd" TIMESTAMP(6) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "status" "icecream"."FinanceReportStatus" NOT NULL DEFAULT 'READY_TO_CONFIRM',
  "agreedAt" TIMESTAMP(6),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financeReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financeReport_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "financeReport_userId_periodStart_periodEnd_idx"
  ON "icecream"."financeReport"("userId", "periodStart", "periodEnd");

CREATE TABLE IF NOT EXISTS "icecream"."transaction" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "type" "icecream"."TransactionType" NOT NULL,
  "status" "icecream"."TransactionStatus" NOT NULL DEFAULT 'PENDING',
  "description" TEXT,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(6),
  "metadata" JSONB,
  CONSTRAINT "transaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "transaction_userId_createdAt_idx"
  ON "icecream"."transaction"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "transaction_type_status_idx"
  ON "icecream"."transaction"("type", "status");
