-- Prisma's @updatedAt owns this value on writes. Remove the creation-time
-- default left by the original table DDL so the deployed schema matches the
-- datamodel and migration verification can detect future drift reliably.
ALTER TABLE "icecream"."collaboration_responses"
  ALTER COLUMN "updated_at" DROP DEFAULT;
