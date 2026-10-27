-- Smart Link analytics moves out of release.roles JSON into an insert-only events table.
CREATE TABLE "icecream"."smart_link_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "release_id" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "platform" TEXT,
  "source" TEXT NOT NULL,
  "device" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "visitor_hash" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "smart_link_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "smart_link_events_release_id_created_at_idx"
  ON "icecream"."smart_link_events" ("release_id", "created_at");

CREATE INDEX "smart_link_events_release_id_type_visitor_hash_created_at_idx"
  ON "icecream"."smart_link_events" ("release_id", "type", "visitor_hash", "created_at");

ALTER TABLE "icecream"."smart_link_events"
  ADD CONSTRAINT "smart_link_events_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
