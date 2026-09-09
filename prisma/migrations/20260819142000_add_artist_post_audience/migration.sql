ALTER TABLE icecream.artist_profile_posts
  ADD COLUMN IF NOT EXISTS audience VARCHAR(16) NOT NULL DEFAULT 'PUBLIC';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'artist_profile_posts_audience_check'
      AND conrelid = 'icecream.artist_profile_posts'::regclass
  ) THEN
    ALTER TABLE icecream.artist_profile_posts
      ADD CONSTRAINT artist_profile_posts_audience_check
      CHECK (audience IN ('PUBLIC', 'FOLLOWERS', 'PRIVATE'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS artist_profile_posts_audience_created_at_id_idx
  ON icecream.artist_profile_posts(audience, created_at, id);
