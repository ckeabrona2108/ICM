-- One-time codes for payouts and account-access changes, and the 48-hour hold on new code channels.
-- Safe to run twice.
CREATE TABLE IF NOT EXISTS "icecream"."security_codes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "channel" VARCHAR(16) NOT NULL,
  "code_hash" VARCHAR(128) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "verified_at" TIMESTAMPTZ(6),
  "used_at" TIMESTAMPTZ(6),
  CONSTRAINT "security_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "security_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "security_codes_user_id_action_created_at_idx"
  ON "icecream"."security_codes"("user_id", "action", "created_at");

CREATE TABLE IF NOT EXISTS "icecream"."security_channel_holds" (
  "user_id" UUID NOT NULL,
  "channel" VARCHAR(16) NOT NULL,
  "trusted_from" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "security_channel_holds_pkey" PRIMARY KEY ("user_id", "channel"),
  CONSTRAINT "security_channel_holds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
