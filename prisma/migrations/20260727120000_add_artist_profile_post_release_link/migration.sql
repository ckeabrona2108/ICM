ALTER TABLE "icecream"."artist_profile_posts"
  ADD COLUMN IF NOT EXISTS "release_id" UUID;

CREATE INDEX IF NOT EXISTS "artist_profile_posts_release_id_idx"
  ON "icecream"."artist_profile_posts"("release_id");

DO $$ BEGIN
  ALTER TABLE "icecream"."artist_profile_posts"
    ADD CONSTRAINT "artist_profile_posts_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
