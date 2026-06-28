ALTER TABLE "icecream"."ai_token_transactions"
  ADD COLUMN IF NOT EXISTS "description" TEXT;

INSERT INTO "icecream"."ai_token_packages" ("code", "name", "token_amount", "bonus_tokens", "price_rub", "active")
VALUES
  ('starter', 'Starter', 1000, 0, 99, true),
  ('creator', 'Creator', 5000, 0, 449, true),
  ('pro_creator', 'Pro Creator', 10000, 0, 799, true),
  ('studio', 'Studio', 25000, 0, 1799, true)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "token_amount" = EXCLUDED."token_amount",
  "bonus_tokens" = EXCLUDED."bonus_tokens",
  "price_rub" = EXCLUDED."price_rub",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;
