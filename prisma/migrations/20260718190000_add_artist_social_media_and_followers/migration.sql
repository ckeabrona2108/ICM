ALTER TABLE "icecream"."artist_profile_posts"
  ADD COLUMN IF NOT EXISTS "media_type" VARCHAR(16),
  ADD COLUMN IF NOT EXISTS "media_key" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "media_name" VARCHAR(255);

ALTER TABLE "icecream"."scene_release_comments"
  ADD COLUMN IF NOT EXISTS "media_key" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "media_name" VARCHAR(255);

CREATE TABLE IF NOT EXISTS "icecream"."artist_profile_followers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "profile_user_id" UUID NOT NULL,
  "profile_key" VARCHAR(160) NOT NULL,
  "follower_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artist_profile_followers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "artist_profile_followers_profile_owner_fkey"
    FOREIGN KEY ("profile_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE,
  CONSTRAINT "artist_profile_followers_follower_fkey"
    FOREIGN KEY ("follower_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE
);

ALTER TABLE "icecream"."artist_profile_followers"
  DROP CONSTRAINT IF EXISTS "artist_profile_followers_profile_owner_fkey",
  DROP CONSTRAINT IF EXISTS "artist_profile_followers_follower_fkey",
  ALTER COLUMN "profile_user_id" TYPE UUID USING "profile_user_id"::UUID,
  ALTER COLUMN "follower_user_id" TYPE UUID USING "follower_user_id"::UUID;
ALTER TABLE "icecream"."artist_profile_followers"
  ADD CONSTRAINT "artist_profile_followers_profile_owner_fkey"
  FOREIGN KEY ("profile_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "artist_profile_followers_follower_fkey"
  FOREIGN KEY ("follower_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "artist_profile_followers_profile_user_id_profile_key_follower_key"
  ON "icecream"."artist_profile_followers"("profile_user_id", "profile_key", "follower_user_id");
CREATE INDEX IF NOT EXISTS "artist_profile_followers_profile_user_id_profile_key_created_idx"
  ON "icecream"."artist_profile_followers"("profile_user_id", "profile_key", "created_at");
CREATE INDEX IF NOT EXISTS "artist_profile_followers_follower_user_id_created_at_idx"
  ON "icecream"."artist_profile_followers"("follower_user_id", "created_at");
