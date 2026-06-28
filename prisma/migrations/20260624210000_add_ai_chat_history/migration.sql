CREATE TABLE IF NOT EXISTS "icecream"."ai_chat_threads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "model_code" TEXT NOT NULL,
  "last_message_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_chat_threads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_chat_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."ai_chat_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "thread_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "model_code" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ai_chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "icecream"."ai_chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ai_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_chat_threads_user_id_updated_at_idx"
  ON "icecream"."ai_chat_threads"("user_id", "updated_at");

CREATE INDEX IF NOT EXISTS "ai_chat_threads_user_id_last_message_at_idx"
  ON "icecream"."ai_chat_threads"("user_id", "last_message_at");

CREATE INDEX IF NOT EXISTS "ai_chat_messages_thread_id_created_at_idx"
  ON "icecream"."ai_chat_messages"("thread_id", "created_at");

CREATE INDEX IF NOT EXISTS "ai_chat_messages_user_id_created_at_idx"
  ON "icecream"."ai_chat_messages"("user_id", "created_at");
