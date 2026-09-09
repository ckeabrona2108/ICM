CREATE TABLE IF NOT EXISTS "icecream"."direct_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "participant_a_id" uuid NOT NULL REFERENCES "icecream"."user"("id") ON DELETE CASCADE,
  "participant_b_id" uuid NOT NULL REFERENCES "icecream"."user"("id") ON DELETE CASCADE,
  "created_at" timestamp(6) NOT NULL DEFAULT now(),
  "updated_at" timestamp(6) NOT NULL DEFAULT now(),
  CONSTRAINT "direct_conversations_distinct_participants" CHECK ("participant_a_id" <> "participant_b_id"),
  CONSTRAINT "direct_conversations_unique_pair" UNIQUE ("participant_a_id", "participant_b_id")
);

CREATE INDEX IF NOT EXISTS "direct_conversations_participant_a_idx"
  ON "icecream"."direct_conversations" ("participant_a_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "direct_conversations_participant_b_idx"
  ON "icecream"."direct_conversations" ("participant_b_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "icecream"."direct_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "icecream"."direct_conversations"("id") ON DELETE CASCADE,
  "sender_id" uuid NOT NULL REFERENCES "icecream"."user"("id") ON DELETE CASCADE,
  "body" text NOT NULL,
  "read_at" timestamp(6),
  "created_at" timestamp(6) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "direct_messages_conversation_created_idx"
  ON "icecream"."direct_messages" ("conversation_id", "created_at" ASC);

CREATE INDEX IF NOT EXISTS "direct_messages_unread_idx"
  ON "icecream"."direct_messages" ("conversation_id", "read_at")
  WHERE "read_at" IS NULL;
