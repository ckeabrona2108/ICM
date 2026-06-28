INSERT INTO "icecream"."ai_token_packages" ("code", "name", "token_amount", "bonus_tokens", "price_rub", "active")
VALUES
  ('starter', 'Starter', 1000, 0, 500, true),
  ('creator', 'Creator', 2500, 100, 1250, true),
  ('pro_creator', 'Pro Creator', 5000, 300, 2500, true),
  ('studio', 'Studio', 10000, 1000, 5000, true),
  ('mega_studio', 'Mega Studio', 15000, 2000, 7500, true),
  ('ultra_studio', 'Ultra Studio', 20000, 3000, 10000, true)
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "token_amount" = EXCLUDED."token_amount",
  "bonus_tokens" = EXCLUDED."bonus_tokens",
  "price_rub" = EXCLUDED."price_rub",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;
