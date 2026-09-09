CREATE TABLE "icecream"."collaboration_responses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "post_id" UUID NOT NULL,
  "sender_user_id" UUID NOT NULL,
  "sender_profile_key" VARCHAR(160) NOT NULL,
  "linked_release_id" UUID,
  "message" TEXT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "collaboration_responses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "collaboration_responses_post_sender_key"
  ON "icecream"."collaboration_responses"("post_id", "sender_user_id", "sender_profile_key");

CREATE INDEX "collaboration_responses_post_created_at_idx"
  ON "icecream"."collaboration_responses"("post_id", "created_at");

CREATE INDEX "collaboration_responses_sender_created_at_idx"
  ON "icecream"."collaboration_responses"("sender_user_id", "created_at");

ALTER TABLE "icecream"."collaboration_responses"
  ADD CONSTRAINT "collaboration_responses_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "icecream"."artist_profile_posts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icecream"."collaboration_responses"
  ADD CONSTRAINT "collaboration_responses_sender_user_id_fkey"
  FOREIGN KEY ("sender_user_id") REFERENCES "icecream"."user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icecream"."collaboration_responses"
  ADD CONSTRAINT "collaboration_responses_linked_release_id_fkey"
  FOREIGN KEY ("linked_release_id") REFERENCES "icecream"."release"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
