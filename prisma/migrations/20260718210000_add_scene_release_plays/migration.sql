CREATE TABLE IF NOT EXISTS icecream.scene_release_plays (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL,
  visitor_id uuid NOT NULL,
  ip_hash varchar(64),
  created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT scene_release_plays_pkey PRIMARY KEY (id),
  CONSTRAINT scene_release_plays_release_id_fkey
    FOREIGN KEY (release_id) REFERENCES "icecream"."release"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "icecream"."scene_release_plays"
  DROP CONSTRAINT IF EXISTS "scene_release_plays_release_id_fkey",
  ALTER COLUMN "release_id" TYPE UUID USING "release_id"::UUID;

ALTER TABLE "icecream"."scene_release_plays"
  ADD CONSTRAINT "scene_release_plays_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS scene_release_plays_release_id_created_at_idx
  ON icecream.scene_release_plays(release_id, created_at);

CREATE INDEX IF NOT EXISTS scene_release_plays_visitor_id_created_at_idx
  ON icecream.scene_release_plays(visitor_id, created_at);
