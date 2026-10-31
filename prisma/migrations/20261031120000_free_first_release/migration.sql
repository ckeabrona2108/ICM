-- Free first single: a confirmed VK account plus one claim per cabinet, VK account and passport.
-- release_id is cleared when the release is deleted, so a consumed claim is never lost.
CREATE TABLE "icecream"."vk_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "vk_user_id" TEXT NOT NULL,
  "is_group_member" BOOLEAN NOT NULL DEFAULT false,
  "member_checked_at" TIMESTAMPTZ(6),
  "linked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vk_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vk_links_user_id_key" ON "icecream"."vk_links" ("user_id");
CREATE UNIQUE INDEX "vk_links_vk_user_id_key" ON "icecream"."vk_links" ("vk_user_id");

ALTER TABLE "icecream"."vk_links"
  ADD CONSTRAINT "vk_links_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "icecream"."free_release_claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "release_id" UUID,
  "identity_key" TEXT NOT NULL,
  "vk_user_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'reserved',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumed_at" TIMESTAMPTZ(6),
  CONSTRAINT "free_release_claims_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "free_release_claims_user_id_key" ON "icecream"."free_release_claims" ("user_id");
CREATE UNIQUE INDEX "free_release_claims_release_id_key" ON "icecream"."free_release_claims" ("release_id");
CREATE UNIQUE INDEX "free_release_claims_identity_key_key" ON "icecream"."free_release_claims" ("identity_key");
CREATE UNIQUE INDEX "free_release_claims_vk_user_id_key" ON "icecream"."free_release_claims" ("vk_user_id");

ALTER TABLE "icecream"."free_release_claims"
  ADD CONSTRAINT "free_release_claims_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icecream"."free_release_claims"
  ADD CONSTRAINT "free_release_claims_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE SET NULL ON UPDATE CASCADE;
