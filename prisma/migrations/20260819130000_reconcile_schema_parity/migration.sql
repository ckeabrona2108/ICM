-- Preserve legacy payout values while adding the methods used by the current app.
-- PostgreSQL enum values are intentionally not removed in a forward migration.
ALTER TYPE "icecream"."PayoutMethod" ADD VALUE IF NOT EXISTS 'CARD';
ALTER TYPE "icecream"."PayoutMethod" ADD VALUE IF NOT EXISTS 'SBP';

-- Restore the uniqueness declared by the Prisma datamodel and relied on by
-- analytics upserts. Existing duplicate rows must be resolved before production
-- deployment; the migration deliberately fails instead of silently deleting data.
CREATE UNIQUE INDEX IF NOT EXISTS "ars_release_date_country_platform_uniq"
  ON "icecream"."analytics_report_snapshots" ("release_id", "report_date", "country", "platform");

CREATE UNIQUE INDEX IF NOT EXISTS "aps_user_release_date_platform_uniq"
  ON "icecream"."analytics_platform_summaries" ("user_id", "release_id", "report_date", "platform");

-- The canonical bridge and later idempotent social migrations used different
-- names for the same follower foreign keys. Keep one canonical pair.
ALTER TABLE "icecream"."artist_profile_followers"
  DROP CONSTRAINT IF EXISTS "artist_profile_followers_profile_owner_fkey",
  DROP CONSTRAINT IF EXISTS "artist_profile_followers_follower_fkey";

-- Later CREATE TABLE/repair migrations omitted ON UPDATE CASCADE, while the
-- canonical schema and Prisma relation defaults require it.
ALTER TABLE "icecream"."artist_profile_posts"
  DROP CONSTRAINT IF EXISTS "artist_profile_posts_user_id_fkey",
  ADD CONSTRAINT "artist_profile_posts_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icecream"."scene_release_likes"
  DROP CONSTRAINT IF EXISTS "scene_release_likes_release_id_fkey",
  ADD CONSTRAINT "scene_release_likes_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icecream"."scene_release_comments"
  DROP CONSTRAINT IF EXISTS "scene_release_comments_release_id_fkey",
  DROP CONSTRAINT IF EXISTS "scene_release_comments_user_id_fkey",
  ADD CONSTRAINT "scene_release_comments_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "scene_release_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icecream"."social_feed_preferences"
  DROP CONSTRAINT IF EXISTS "social_feed_preferences_viewer_user_id_fkey",
  ADD CONSTRAINT "social_feed_preferences_viewer_user_id_fkey"
    FOREIGN KEY ("viewer_user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The original auto-generated name exceeds PostgreSQL's 63-byte identifier
-- limit and is stored truncated. Replace it with a stable explicit name.
DROP INDEX IF EXISTS "icecream"."social_feed_preferences_viewer_user_id_action_target_type_targe";
CREATE UNIQUE INDEX IF NOT EXISTS "social_feed_preferences_viewer_action_target_key"
  ON "icecream"."social_feed_preferences" ("viewer_user_id", "action", "target_type", "target_id");
