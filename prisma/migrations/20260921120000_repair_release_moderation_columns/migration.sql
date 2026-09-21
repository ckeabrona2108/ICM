-- The canonical `icecream.release` table was introduced after an earlier
-- release-workflow migration had targeted the legacy unqualified table.
ALTER TABLE "icecream"."release"
  ADD COLUMN IF NOT EXISTS "moderationStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moderationCancelledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "moderationReturnedAt" TIMESTAMP(3);
