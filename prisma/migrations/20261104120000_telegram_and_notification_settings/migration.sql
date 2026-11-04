-- Telegram notifications: when the bot last failed to write to the artist (blocked the bot or
-- never allowed messages). NULL means messages reach them.
ALTER TABLE "icecream"."oauth_accounts" ADD COLUMN "messages_blocked_at" TIMESTAMPTZ(6);

-- Which channels the artist wants account events in. No row means everything is on.
CREATE TABLE "icecream"."user_notification_settings" (
  "user_id" UUID NOT NULL,
  "email" BOOLEAN NOT NULL DEFAULT true,
  "vk" BOOLEAN NOT NULL DEFAULT true,
  "telegram" BOOLEAN NOT NULL DEFAULT true,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notification_settings_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "icecream"."user_notification_settings"
  ADD CONSTRAINT "user_notification_settings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
