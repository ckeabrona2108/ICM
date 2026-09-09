CREATE TABLE IF NOT EXISTS icecream.scene_release_reactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  release_id uuid NOT NULL,
  visitor_id uuid NOT NULL,
  reaction varchar(24) NOT NULL,
  ip_hash varchar(64),
  created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT scene_release_reactions_pkey PRIMARY KEY (id),
  CONSTRAINT scene_release_reactions_release_id_fkey
    FOREIGN KEY (release_id) REFERENCES "icecream"."release"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT scene_release_reactions_release_id_visitor_id_reaction_key
    UNIQUE (release_id, visitor_id, reaction),
  CONSTRAINT scene_release_reactions_reaction_check
    CHECK (reaction IN ('playlist', 'hit', 'cover'))
);

ALTER TABLE "icecream"."scene_release_reactions"
  DROP CONSTRAINT IF EXISTS "scene_release_reactions_release_id_fkey",
  ALTER COLUMN "release_id" TYPE UUID USING "release_id"::UUID;

ALTER TABLE "icecream"."scene_release_reactions"
  ADD CONSTRAINT "scene_release_reactions_release_id_fkey"
  FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS scene_release_reactions_release_id_created_at_idx
  ON icecream.scene_release_reactions(release_id, created_at);

CREATE INDEX IF NOT EXISTS scene_release_reactions_visitor_id_created_at_idx
  ON icecream.scene_release_reactions(visitor_id, created_at);
