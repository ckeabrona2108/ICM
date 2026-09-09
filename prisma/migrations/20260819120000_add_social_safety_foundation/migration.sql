CREATE TABLE IF NOT EXISTS "icecream"."social_user_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "blocker_user_id" UUID NOT NULL,
  "blocked_user_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_user_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_user_blocks_distinct_users_check" CHECK ("blocker_user_id" <> "blocked_user_id"),
  CONSTRAINT "social_user_blocks_blocker_user_id_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE,
  CONSTRAINT "social_user_blocks_blocked_user_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_user_blocks_blocker_user_id_blocked_user_id_key"
  ON "icecream"."social_user_blocks"("blocker_user_id", "blocked_user_id");
CREATE INDEX IF NOT EXISTS "social_user_blocks_blocker_user_id_created_at_idx"
  ON "icecream"."social_user_blocks"("blocker_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "social_user_blocks_blocked_user_id_created_at_idx"
  ON "icecream"."social_user_blocks"("blocked_user_id", "created_at");

CREATE TABLE IF NOT EXISTS "icecream"."social_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "reporter_user_id" UUID NOT NULL,
  "reported_user_id" UUID NOT NULL,
  "target_type" VARCHAR(32) NOT NULL,
  "target_id" UUID NOT NULL,
  "reason" VARCHAR(32) NOT NULL,
  "details" VARCHAR(1000),
  "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "social_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_reports_target_type_check" CHECK ("target_type" IN ('post', 'release', 'post_comment', 'release_comment', 'user')),
  CONSTRAINT "social_reports_reason_check" CHECK ("reason" IN ('spam', 'harassment', 'hate', 'impersonation', 'privacy', 'illegal', 'other')),
  CONSTRAINT "social_reports_status_check" CHECK ("status" IN ('pending', 'reviewing', 'resolved', 'dismissed')),
  CONSTRAINT "social_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE,
  CONSTRAINT "social_reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_reports_reporter_user_id_target_type_target_id_key"
  ON "icecream"."social_reports"("reporter_user_id", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "social_reports_reported_user_id_status_created_at_idx"
  ON "icecream"."social_reports"("reported_user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "social_reports_status_created_at_idx"
  ON "icecream"."social_reports"("status", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_user_blocks_distinct_users_check') THEN
    ALTER TABLE "icecream"."social_user_blocks"
      ADD CONSTRAINT "social_user_blocks_distinct_users_check" CHECK ("blocker_user_id" <> "blocked_user_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_reports_target_type_check') THEN
    ALTER TABLE "icecream"."social_reports"
      ADD CONSTRAINT "social_reports_target_type_check" CHECK ("target_type" IN ('post', 'release', 'post_comment', 'release_comment', 'user'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_reports_reason_check') THEN
    ALTER TABLE "icecream"."social_reports"
      ADD CONSTRAINT "social_reports_reason_check" CHECK ("reason" IN ('spam', 'harassment', 'hate', 'impersonation', 'privacy', 'illegal', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_reports_status_check') THEN
    ALTER TABLE "icecream"."social_reports"
      ADD CONSTRAINT "social_reports_status_check" CHECK ("status" IN ('pending', 'reviewing', 'resolved', 'dismissed'));
  END IF;
END $$;
