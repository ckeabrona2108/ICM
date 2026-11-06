-- Artist profiles on streaming platforms ("Это я") and per-release link matches for smart links.
CREATE TABLE "icecream"."artist_platform_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "profile_key" VARCHAR(160) NOT NULL,
  "platform" VARCHAR(32) NOT NULL,
  "external_id" VARCHAR(160) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "url" TEXT NOT NULL,
  "image_url" TEXT,
  "status" VARCHAR(16) NOT NULL,
  "source" VARCHAR(16) NOT NULL,
  "details" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "artist_platform_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "artist_platform_profiles_user_id_profile_key_platform_external_id_key"
  ON "icecream"."artist_platform_profiles"("user_id", "profile_key", "platform", "external_id");
CREATE INDEX "artist_platform_profiles_user_id_profile_key_idx" ON "icecream"."artist_platform_profiles"("user_id", "profile_key");
CREATE INDEX "artist_platform_profiles_status_platform_idx" ON "icecream"."artist_platform_profiles"("status", "platform");

ALTER TABLE "icecream"."artist_platform_profiles"
  ADD CONSTRAINT "artist_platform_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "icecream"."release_platform_matches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "release_id" UUID NOT NULL,
  "platform" VARCHAR(32) NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "candidates" JSONB NOT NULL DEFAULT '[]',
  "rejected" JSONB NOT NULL DEFAULT '[]',
  "last_url" TEXT,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "checked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "release_platform_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "release_platform_matches_release_id_platform_key" ON "icecream"."release_platform_matches"("release_id", "platform");
CREATE INDEX "release_platform_matches_status_idx" ON "icecream"."release_platform_matches"("status");

ALTER TABLE "icecream"."release_platform_matches"
  ADD CONSTRAINT "release_platform_matches_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
