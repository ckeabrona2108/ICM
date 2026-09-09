ALTER TABLE "icecream"."direct_conversations"
  ADD COLUMN IF NOT EXISTS "hidden_for_participant_a_at" timestamp(6),
  ADD COLUMN IF NOT EXISTS "hidden_for_participant_b_at" timestamp(6);

ALTER TABLE "icecream"."direct_messages"
  ADD COLUMN IF NOT EXISTS "deleted_for_everyone_at" timestamp(6),
  ADD COLUMN IF NOT EXISTS "deleted_for_sender_at" timestamp(6);

CREATE INDEX IF NOT EXISTS "direct_conversations_hidden_participant_a_idx"
  ON "icecream"."direct_conversations" ("participant_a_id", "hidden_for_participant_a_at");

CREATE INDEX IF NOT EXISTS "direct_conversations_hidden_participant_b_idx"
  ON "icecream"."direct_conversations" ("participant_b_id", "hidden_for_participant_b_at");

CREATE INDEX IF NOT EXISTS "direct_messages_sender_deleted_idx"
  ON "icecream"."direct_messages" ("sender_id", "deleted_for_sender_at");

CREATE INDEX IF NOT EXISTS "direct_messages_everyone_deleted_idx"
  ON "icecream"."direct_messages" ("conversation_id", "deleted_for_everyone_at");
