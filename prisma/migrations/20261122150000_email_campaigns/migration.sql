-- Campaign letters: who unsubscribed, and which letters went to whom. Safe to run twice.
CREATE TABLE IF NOT EXISTS "icecream"."marketing_email_optouts" (
  "user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_email_optouts_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "marketing_email_optouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."email_campaign_sends" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign" VARCHAR(64) NOT NULL,
  "user_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "message_id" TEXT,
  "token" VARCHAR(64) NOT NULL,
  CONSTRAINT "email_campaign_sends_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_campaign_sends_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_campaign_sends_campaign_user_id_key"
  ON "icecream"."email_campaign_sends"("campaign", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "email_campaign_sends_token_key"
  ON "icecream"."email_campaign_sends"("token");
