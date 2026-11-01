-- Quick sign-in with Yandex ID: one row per provider account, at most one per cabinet and provider.
CREATE TABLE "icecream"."oauth_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "provider_account_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "oauth_accounts_provider_provider_account_id_key" ON "icecream"."oauth_accounts" ("provider", "provider_account_id");
CREATE UNIQUE INDEX "oauth_accounts_user_id_provider_key" ON "icecream"."oauth_accounts" ("user_id", "provider");

ALTER TABLE "icecream"."oauth_accounts"
  ADD CONSTRAINT "oauth_accounts_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
