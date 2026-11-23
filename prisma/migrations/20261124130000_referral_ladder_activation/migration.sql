-- Ladder months are earned first and switched on by the artist with a button, when they choose.
-- granted_at = when it was earned; activated_at = when the artist switched it on. Safe to run twice.
ALTER TABLE "icecream"."referral_ladder_rewards" ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMPTZ(6);
