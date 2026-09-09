ALTER TABLE "icecream"."artist_profile_post_likes"
  ADD COLUMN IF NOT EXISTS "reaction" VARCHAR(24) NOT NULL DEFAULT 'heart';

ALTER TABLE "icecream"."scene_release_likes"
  ADD COLUMN IF NOT EXISTS "reaction" VARCHAR(24) NOT NULL DEFAULT 'heart';

CREATE INDEX IF NOT EXISTS "artist_profile_post_likes_post_id_reaction_created_at_idx"
  ON "icecream"."artist_profile_post_likes"("post_id", "reaction", "created_at");

CREATE INDEX IF NOT EXISTS "scene_release_likes_release_id_reaction_created_at_idx"
  ON "icecream"."scene_release_likes"("release_id", "reaction", "created_at");

ALTER TABLE "icecream"."artist_profile_post_comments"
  ADD COLUMN IF NOT EXISTS "parent_id" UUID,
  ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(6);

ALTER TABLE "icecream"."scene_release_comments"
  ADD COLUMN IF NOT EXISTS "parent_id" UUID,
  ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(6);

CREATE INDEX IF NOT EXISTS "artist_profile_post_comments_post_id_parent_id_created_at_idx"
  ON "icecream"."artist_profile_post_comments"("post_id", "parent_id", "created_at");
CREATE INDEX IF NOT EXISTS "artist_profile_post_comments_parent_id_created_at_idx"
  ON "icecream"."artist_profile_post_comments"("parent_id", "created_at");
CREATE INDEX IF NOT EXISTS "scene_release_comments_release_id_parent_id_created_at_idx"
  ON "icecream"."scene_release_comments"("release_id", "parent_id", "created_at");
CREATE INDEX IF NOT EXISTS "scene_release_comments_parent_id_created_at_idx"
  ON "icecream"."scene_release_comments"("parent_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "icecream"."artist_profile_post_comments"
    ADD CONSTRAINT "artist_profile_post_comments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "icecream"."artist_profile_post_comments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "icecream"."scene_release_comments"
    ADD CONSTRAINT "scene_release_comments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "icecream"."scene_release_comments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
