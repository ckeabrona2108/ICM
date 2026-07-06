DO $$
BEGIN
  CREATE TYPE "icecream"."PromoSubmissionStatus" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SENT_TO_PARTNERS', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "icecream"."promo_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "release_id" UUID NOT NULL,
  "status" "icecream"."PromoSubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "email" TEXT NOT NULL,
  "partner_name" TEXT NOT NULL,
  "artist_name" TEXT NOT NULL,
  "artist_country" TEXT NOT NULL,
  "release_title" TEXT NOT NULL,
  "release_date" TIMESTAMP(6) NOT NULL,
  "genre" TEXT NOT NULL,
  "release_format" TEXT NOT NULL,
  "release_language" TEXT NOT NULL,
  "upc" TEXT NOT NULL,
  "key_track_title" TEXT NOT NULL,
  "has_music_video" BOOLEAN NOT NULL DEFAULT false,
  "video_preview_url" TEXT,
  "label" TEXT NOT NULL,
  "release_description" TEXT NOT NULL,
  "artist_photo_url" TEXT NOT NULL,
  "listening_link" TEXT NOT NULL,
  "promotion_plan" TEXT NOT NULL,
  "artist_social_links" TEXT NOT NULL,
  "confirmation_accepted" BOOLEAN NOT NULL DEFAULT false,
  "admin_comment" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(6),
  "reviewed_by" UUID,
  CONSTRAINT "promo_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promo_submissions_user_id_release_id_key" UNIQUE ("user_id", "release_id"),
  CONSTRAINT "promo_submissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promo_submissions_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "promo_submissions_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "icecream"."user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "promo_submissions_status_created_at_idx"
  ON "icecream"."promo_submissions"("status", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "promo_submissions_user_id_created_at_idx"
  ON "icecream"."promo_submissions"("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "promo_submissions_release_id_idx"
  ON "icecream"."promo_submissions"("release_id");
