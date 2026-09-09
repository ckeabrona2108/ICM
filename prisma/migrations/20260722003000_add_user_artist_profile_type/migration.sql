ALTER TABLE "icecream"."user"
ADD COLUMN IF NOT EXISTS "artistProfileType" TEXT NOT NULL DEFAULT 'artist';

ALTER TABLE "icecream"."user"
DROP CONSTRAINT IF EXISTS "user_artistProfileType_check";

ALTER TABLE "icecream"."user"
ADD CONSTRAINT "user_artistProfileType_check"
CHECK ("artistProfileType" IN ('artist', 'producer', 'group', 'label'));
