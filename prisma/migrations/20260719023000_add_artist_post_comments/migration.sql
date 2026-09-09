CREATE TABLE IF NOT EXISTS "icecream"."artist_profile_post_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "content" VARCHAR(800) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artist_profile_post_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "artist_profile_post_comments_post_id_created_at_idx"
  ON "icecream"."artist_profile_post_comments"("post_id", "created_at");
CREATE INDEX IF NOT EXISTS "artist_profile_post_comments_user_id_created_at_idx"
  ON "icecream"."artist_profile_post_comments"("user_id", "created_at");

DO $$ BEGIN
  ALTER TABLE "icecream"."artist_profile_post_comments"
    ADD CONSTRAINT "artist_profile_post_comments_post_id_fkey"
    FOREIGN KEY ("post_id") REFERENCES "icecream"."artist_profile_posts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "icecream"."artist_profile_post_comments"
    ADD CONSTRAINT "artist_profile_post_comments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
