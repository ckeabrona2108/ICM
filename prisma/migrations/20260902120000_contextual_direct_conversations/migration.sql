ALTER TABLE "icecream"."direct_conversations"
  ADD COLUMN IF NOT EXISTS "context_type" varchar(40) NOT NULL DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS "context_id" varchar(160);

ALTER TABLE "icecream"."direct_conversations"
  DROP CONSTRAINT IF EXISTS "direct_conversations_unique_pair";

DROP INDEX IF EXISTS "icecream"."direct_conversations_unique_pair";

CREATE UNIQUE INDEX IF NOT EXISTS "direct_conversations_direct_pair_key"
  ON "icecream"."direct_conversations" ("participant_a_id", "participant_b_id")
  WHERE "context_type" = 'direct';

CREATE INDEX IF NOT EXISTS "direct_conversations_context_idx"
  ON "icecream"."direct_conversations" ("context_type", "context_id");
