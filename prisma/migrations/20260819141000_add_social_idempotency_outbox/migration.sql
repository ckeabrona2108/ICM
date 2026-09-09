ALTER TABLE "icecream"."artist_profile_posts"
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128);
ALTER TABLE "icecream"."artist_profile_post_comments"
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128);
ALTER TABLE "icecream"."scene_release_comments"
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS "artist_profile_posts_user_id_idempotency_key"
  ON "icecream"."artist_profile_posts" ("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "artist_post_comments_user_id_idempotency_key"
  ON "icecream"."artist_profile_post_comments" ("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "scene_release_comments_user_id_idempotency_key"
  ON "icecream"."scene_release_comments" ("user_id", "idempotency_key");

ALTER TABLE "icecream"."ai_user_notifications"
  ADD COLUMN IF NOT EXISTS "source_type" VARCHAR(24),
  ADD COLUMN IF NOT EXISTS "source_id" UUID;

CREATE TABLE IF NOT EXISTS "icecream"."social_notification_outbox" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_id" VARCHAR(191) NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" VARCHAR(64) NOT NULL,
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "href" VARCHAR(500) NOT NULL,
  "source_type" VARCHAR(24),
  "source_id" UUID,
  "send_push" BOOLEAN NOT NULL DEFAULT true,
  "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(6),
  "delivered_at" TIMESTAMP(6),
  "last_error" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "social_notification_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_notification_outbox_event_id_key" UNIQUE ("event_id"),
  CONSTRAINT "social_notification_outbox_status_check" CHECK ("status" IN ('pending', 'processing', 'failed', 'delivered')),
  CONSTRAINT "social_notification_outbox_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "social_notification_outbox_pending_idx"
  ON "icecream"."social_notification_outbox" ("status", "available_at");
CREATE INDEX IF NOT EXISTS "social_notification_outbox_user_idx"
  ON "icecream"."social_notification_outbox" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "icecream"."social_notification_push_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "outbox_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "delivered_at" TIMESTAMP(6),
  "last_error" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "social_notification_push_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "social_notification_push_deliveries_outbox_id_fkey" FOREIGN KEY ("outbox_id")
    REFERENCES "icecream"."social_notification_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "social_notification_push_delivery_key"
  ON "icecream"."social_notification_push_deliveries" ("outbox_id", "endpoint");
CREATE INDEX IF NOT EXISTS "social_notification_push_pending_idx"
  ON "icecream"."social_notification_push_deliveries" ("outbox_id", "delivered_at");
