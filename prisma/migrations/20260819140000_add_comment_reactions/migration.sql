ALTER TABLE "icecream"."artist_profile_posts"
  ADD COLUMN IF NOT EXISTS "edited_at" TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS "icecream"."artist_profile_post_comment_likes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "comment_id" UUID NOT NULL,
  "visitor_id" UUID NOT NULL,
  "reaction" VARCHAR(24) NOT NULL DEFAULT 'heart',
  "ip_hash" VARCHAR(64),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artist_profile_post_comment_likes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "icecream"."scene_release_comment_likes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "comment_id" UUID NOT NULL,
  "visitor_id" UUID NOT NULL,
  "reaction" VARCHAR(24) NOT NULL DEFAULT 'heart',
  "ip_hash" VARCHAR(64),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scene_release_comment_likes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "artist_profile_post_comment_likes_comment_id_visitor_id_key"
  ON "icecream"."artist_profile_post_comment_likes"("comment_id", "visitor_id");
CREATE INDEX IF NOT EXISTS "artist_profile_post_comment_likes_comment_id_reaction_creat_idx"
  ON "icecream"."artist_profile_post_comment_likes"("comment_id", "reaction", "created_at");
CREATE INDEX IF NOT EXISTS "artist_profile_post_comment_likes_visitor_id_created_at_idx"
  ON "icecream"."artist_profile_post_comment_likes"("visitor_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "scene_release_comment_likes_comment_id_visitor_id_key"
  ON "icecream"."scene_release_comment_likes"("comment_id", "visitor_id");
CREATE INDEX IF NOT EXISTS "scene_release_comment_likes_comment_id_reaction_created_at_idx"
  ON "icecream"."scene_release_comment_likes"("comment_id", "reaction", "created_at");
CREATE INDEX IF NOT EXISTS "scene_release_comment_likes_visitor_id_created_at_idx"
  ON "icecream"."scene_release_comment_likes"("visitor_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "icecream"."artist_profile_post_comment_likes"
    ADD CONSTRAINT "artist_profile_post_comment_likes_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "icecream"."artist_profile_post_comments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "icecream"."scene_release_comment_likes"
    ADD CONSTRAINT "scene_release_comment_likes_comment_id_fkey"
    FOREIGN KEY ("comment_id") REFERENCES "icecream"."scene_release_comments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "icecream"."artist_profile_post_comment_likes"
    ADD CONSTRAINT "artist_profile_post_comment_likes_reaction_check"
    CHECK ("reaction" IN ('heart', 'fire', 'laugh', 'wow', 'sad', 'thumbs', 'party', 'diamond'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "icecream"."scene_release_comment_likes"
    ADD CONSTRAINT "scene_release_comment_likes_reaction_check"
    CHECK ("reaction" IN ('heart', 'fire', 'laugh', 'wow', 'sad', 'thumbs', 'party', 'diamond'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
