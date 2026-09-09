CREATE TABLE IF NOT EXISTS "icecream"."artist_profile_posts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "profile_key" VARCHAR(160) NOT NULL,
  "content" VARCHAR(1500) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artist_profile_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "artist_profile_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."artist_profile_post_likes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL,
  "visitor_id" UUID NOT NULL,
  "ip_hash" VARCHAR(64),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artist_profile_post_likes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "artist_profile_post_likes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "icecream"."artist_profile_posts"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."scene_release_likes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "release_id" UUID NOT NULL,
  "visitor_id" UUID NOT NULL,
  "ip_hash" VARCHAR(64),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scene_release_likes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scene_release_likes_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."scene_release_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "release_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "content" VARCHAR(800) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scene_release_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "scene_release_comments_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE,
  CONSTRAINT "scene_release_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE
);

ALTER TABLE "icecream"."artist_profile_posts"
  DROP CONSTRAINT IF EXISTS "artist_profile_posts_user_id_fkey",
  ALTER COLUMN "user_id" TYPE UUID USING "user_id"::UUID;
ALTER TABLE "icecream"."artist_profile_posts"
  ADD CONSTRAINT "artist_profile_posts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE;

ALTER TABLE "icecream"."scene_release_likes"
  DROP CONSTRAINT IF EXISTS "scene_release_likes_release_id_fkey",
  ALTER COLUMN "release_id" TYPE UUID USING "release_id"::UUID;
ALTER TABLE "icecream"."scene_release_likes"
  ADD CONSTRAINT "scene_release_likes_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE;

ALTER TABLE "icecream"."scene_release_comments"
  DROP CONSTRAINT IF EXISTS "scene_release_comments_release_id_fkey",
  DROP CONSTRAINT IF EXISTS "scene_release_comments_user_id_fkey",
  ALTER COLUMN "release_id" TYPE UUID USING "release_id"::UUID,
  ALTER COLUMN "user_id" TYPE UUID USING "user_id"::UUID;
ALTER TABLE "icecream"."scene_release_comments"
  ADD CONSTRAINT "scene_release_comments_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "scene_release_comments_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "artist_profile_posts_user_id_profile_key_created_at_idx" ON "icecream"."artist_profile_posts"("user_id", "profile_key", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "artist_profile_post_likes_post_id_visitor_id_key" ON "icecream"."artist_profile_post_likes"("post_id", "visitor_id");
CREATE INDEX IF NOT EXISTS "artist_profile_post_likes_post_id_created_at_idx" ON "icecream"."artist_profile_post_likes"("post_id", "created_at");
CREATE INDEX IF NOT EXISTS "artist_profile_post_likes_visitor_id_created_at_idx" ON "icecream"."artist_profile_post_likes"("visitor_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "scene_release_likes_release_id_visitor_id_key" ON "icecream"."scene_release_likes"("release_id", "visitor_id");
CREATE INDEX IF NOT EXISTS "scene_release_likes_release_id_created_at_idx" ON "icecream"."scene_release_likes"("release_id", "created_at");
CREATE INDEX IF NOT EXISTS "scene_release_likes_visitor_id_created_at_idx" ON "icecream"."scene_release_likes"("visitor_id", "created_at");
CREATE INDEX IF NOT EXISTS "scene_release_comments_release_id_created_at_idx" ON "icecream"."scene_release_comments"("release_id", "created_at");
CREATE INDEX IF NOT EXISTS "scene_release_comments_user_id_created_at_idx" ON "icecream"."scene_release_comments"("user_id", "created_at");
