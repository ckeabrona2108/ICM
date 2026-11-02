-- Account events in VK direct messages from the community, once the artist allowed them.
ALTER TABLE "icecream"."vk_links"
  ADD COLUMN "messages_allowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "messages_allowed_at" TIMESTAMPTZ(6),
  ADD COLUMN "messages_checked_at" TIMESTAMPTZ(6);

CREATE TABLE "icecream"."user_notification_reminders" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notification_reminders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_notification_reminders_user_id_key_key" ON "icecream"."user_notification_reminders" ("user_id", "key");

ALTER TABLE "icecream"."user_notification_reminders"
  ADD CONSTRAINT "user_notification_reminders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
