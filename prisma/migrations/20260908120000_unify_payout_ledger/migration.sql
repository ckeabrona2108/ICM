BEGIN;

-- Older installations have the original `payouts` table but may not have
-- received the payout-request enum introduced by the finance ledger.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type type
    JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = 'icecream' AND type.typname = 'PayoutRequestStatus'
  ) THEN
    CREATE TYPE "icecream"."PayoutRequestStatus" AS ENUM (
      'REQUESTED', 'PROCESSING', 'PAID', 'REJECTED'
    );
  END IF;
END $$;

-- `payouts` is the canonical payout-request table. Keep the older flattened
-- columns during the transition so existing rows remain readable.
ALTER TABLE "icecream"."payouts"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "processedAt" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "status" "icecream"."PayoutRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  ADD COLUMN IF NOT EXISTS "method" "icecream"."PayoutMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  ADD COLUMN IF NOT EXISTS "requisites" JSONB;

UPDATE "icecream"."payouts"
SET "status" = CASE
  WHEN "confirmed" IS TRUE THEN 'PAID'::"icecream"."PayoutRequestStatus"
  WHEN "confirmed" IS NULL THEN 'REJECTED'::"icecream"."PayoutRequestStatus"
  ELSE 'REQUESTED'::"icecream"."PayoutRequestStatus"
END
WHERE "status" = 'REQUESTED'::"icecream"."PayoutRequestStatus";

CREATE INDEX IF NOT EXISTS "payouts_userId_createdAt_idx"
  ON "icecream"."payouts" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "payouts_status_createdAt_idx"
  ON "icecream"."payouts" ("status", "createdAt");

ALTER TABLE "icecream"."transaction"
  ADD COLUMN IF NOT EXISTS "payoutId" UUID;
-- Preserve requests created by the former ledger API when that legacy table
-- exists. Some installations started directly with `payouts`.
DO $$
BEGIN
  IF to_regclass('icecream."payoutRequest"') IS NOT NULL THEN
    INSERT INTO "icecream"."payouts" (
      "id", "userId", "amount", "status", "method", "requisites", "createdAt",
      "updatedAt", "processedAt", "paidAt", "rejectedAt", "confirmed"
    )
    SELECT "id", "userId", "amount", "status", "method", "requisites", "createdAt",
      "updatedAt", "processedAt", "paidAt", "rejectedAt",
      CASE WHEN "status" = 'PAID' THEN TRUE WHEN "status" = 'REJECTED' THEN NULL ELSE FALSE END
    FROM "icecream"."payoutRequest"
    ON CONFLICT ("id") DO NOTHING;
  END IF;
END $$;

-- Link known historical debits before creating missing ones. Never infer a
-- payment identity from its amount: ambiguous historical records need review.
UPDATE "icecream"."transaction" t
SET "payoutId" = p."id"
FROM "icecream"."payouts" p
WHERE t."payoutId" IS NULL AND t."type" = 'PAYOUT'
  AND (t."metadata"->>'payoutRequestId' = p."id"::text
       OR t."description" = 'Payout request ' || p."id"::text);

CREATE UNIQUE INDEX IF NOT EXISTS "transaction_payoutId_key"
  ON "icecream"."transaction" ("payoutId");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "icecream"."payouts" p
    WHERE p."status" = 'PAID'
      AND (p."amount" IS NULL OR p."amount" <= 0 OR p."amount"::text IN ('NaN', 'Infinity', '-Infinity'))
  ) THEN
    RAISE EXCEPTION 'Invalid historical paid payout amount; reconcile before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "icecream"."payouts" p
    WHERE p."status" = 'PAID'
      AND NOT EXISTS (SELECT 1 FROM "icecream"."transaction" t WHERE t."payoutId" = p."id")
      AND EXISTS (SELECT 1 FROM "icecream"."transaction" t
                  WHERE t."userId" = p."userId" AND t."type" = 'PAYOUT'
                    AND t."status" = 'COMPLETED' AND t."payoutId" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Unlinked historical payout debits; reconcile payout identities before migration';
  END IF;
END $$;

INSERT INTO "icecream"."transaction" (
  "id", "userId", "amount", "type", "status", "description", "processedAt", "metadata", "payoutId"
)
SELECT gen_random_uuid(), p."userId", -abs(p."amount"::numeric(12,2)), 'PAYOUT', 'COMPLETED',
  'Payout request ' || p."id"::text, COALESCE(p."paidAt", p."processedAt", p."createdAt"),
  jsonb_build_object('payoutRequestId', p."id"::text, 'migrationBackfill', true), p."id"
FROM "icecream"."payouts" p
WHERE p."status" = 'PAID'
  AND NOT EXISTS (SELECT 1 FROM "icecream"."transaction" t WHERE t."payoutId" = p."id");

COMMIT;
