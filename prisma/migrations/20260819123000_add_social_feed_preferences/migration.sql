CREATE TABLE IF NOT EXISTS "icecream"."social_feed_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "viewer_user_id" UUID NOT NULL,
    "action" VARCHAR(16) NOT NULL,
    "target_type" VARCHAR(16) NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_feed_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "social_feed_preferences_action_target_check" CHECK (("action" = 'hide' AND "target_type" IN ('post', 'release')) OR ("action" = 'mute' AND "target_type" = 'user')),
    CONSTRAINT "social_feed_preferences_viewer_user_id_fkey" FOREIGN KEY ("viewer_user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_feed_preferences_viewer_user_id_action_target_type_target_id_key"
ON "icecream"."social_feed_preferences"("viewer_user_id", "action", "target_type", "target_id");

CREATE INDEX IF NOT EXISTS "social_feed_preferences_viewer_user_id_action_created_at_idx"
ON "icecream"."social_feed_preferences"("viewer_user_id", "action", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'social_feed_preferences_action_target_check') THEN
    ALTER TABLE "icecream"."social_feed_preferences"
      ADD CONSTRAINT "social_feed_preferences_action_target_check"
      CHECK (("action" = 'hide' AND "target_type" IN ('post', 'release')) OR ("action" = 'mute' AND "target_type" = 'user'));
  END IF;
END $$;
