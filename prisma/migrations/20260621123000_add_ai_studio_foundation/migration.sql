ALTER TABLE "icecream"."user"
  ADD COLUMN IF NOT EXISTS "aiTokenBalance" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "aiMonthlyBonusLastGrantedAt" TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS "icecream"."ai_models" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "input_type" TEXT,
  "supports_image" BOOLEAN NOT NULL DEFAULT false,
  "supports_audio" BOOLEAN NOT NULL DEFAULT false,
  "supports_video" BOOLEAN NOT NULL DEFAULT false,
  "base_cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "markup_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "price_tokens" INTEGER NOT NULL DEFAULT 0,
  "billing_type" TEXT NOT NULL DEFAULT 'generation',
  "parameters_schema" JSONB,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_code_key" ON "icecream"."ai_models"("code");

CREATE TABLE IF NOT EXISTS "icecream"."ai_generations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "ai_model_id" UUID,
  "section" TEXT NOT NULL,
  "model_code" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "input_files" JSONB,
  "parameters" JSONB,
  "cost_tokens" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "result_url" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_generations_ai_model_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "icecream"."ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_generations_user_id_created_at_idx" ON "icecream"."ai_generations"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_generations_section_status_idx" ON "icecream"."ai_generations"("section", "status");

CREATE TABLE IF NOT EXISTS "icecream"."ai_uploads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "section" TEXT NOT NULL,
  "file_name" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_uploads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_uploads_user_id_created_at_idx" ON "icecream"."ai_uploads"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "icecream"."ai_token_packages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "token_amount" INTEGER NOT NULL,
  "bonus_tokens" INTEGER NOT NULL DEFAULT 0,
  "price_rub" DOUBLE PRECISION NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_token_packages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_token_packages_code_key" ON "icecream"."ai_token_packages"("code");

CREATE TABLE IF NOT EXISTS "icecream"."ai_token_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "package_code" TEXT,
  "type" TEXT NOT NULL,
  "amount_tokens" INTEGER NOT NULL,
  "amount_rub" DOUBLE PRECISION,
  "balance_after" INTEGER NOT NULL,
  "generation_id" UUID,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_token_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_token_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_token_transactions_user_id_created_at_idx" ON "icecream"."ai_token_transactions"("user_id", "created_at");

INSERT INTO "icecream"."ai_token_packages" ("code", "name", "token_amount", "bonus_tokens", "price_rub")
VALUES
  ('starter', 'Starter', 1000, 0, 99),
  ('creator', 'Creator', 5000, 250, 449),
  ('pro_creator', 'Pro Creator', 10000, 750, 849),
  ('studio', 'Studio', 25000, 2500, 1990)
ON CONFLICT ("code") DO NOTHING;
