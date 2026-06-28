ALTER TABLE "icecream"."user"
  ADD COLUMN IF NOT EXISTS "aiPendingTokenBalance" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "icecream"."orders"
  ADD COLUMN IF NOT EXISTS "payment_status" TEXT NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMP(6);

CREATE TABLE IF NOT EXISTS "icecream"."ai_studio_system_state" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'preparing',
  "activated_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_studio_system_state_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_studio_system_state_singleton_check" CHECK ("id" = 1)
);

INSERT INTO "icecream"."ai_studio_system_state" ("id", "status")
VALUES (1, 'preparing')
ON CONFLICT ("id") DO NOTHING;

CREATE TABLE IF NOT EXISTS "icecream"."ai_user_notifications" (
  "id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'info',
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "cta_label" TEXT,
  "cta_href" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "read_at" TIMESTAMP(6),
  CONSTRAINT "ai_user_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_user_notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_user_notifications_user_id_created_at_idx"
  ON "icecream"."ai_user_notifications"("user_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "ai_token_transactions_topup_order_id_uniq"
  ON "icecream"."ai_token_transactions" ((metadata->>'orderId'))
  WHERE "type" = 'topup'
    AND "metadata" IS NOT NULL
    AND ("metadata" ? 'orderId');
