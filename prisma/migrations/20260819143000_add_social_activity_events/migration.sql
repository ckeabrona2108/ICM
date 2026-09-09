CREATE TABLE IF NOT EXISTS icecream.social_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind VARCHAR(32) NOT NULL,
  source_id UUID NOT NULL,
  actor_user_id UUID,
  profile_key VARCHAR(160),
  audience VARCHAR(16) NOT NULL DEFAULT 'PUBLIC',
  consent_state VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
  provenance VARCHAR(32) NOT NULL DEFAULT 'APPLICATION',
  dedupe_key VARCHAR(255) NOT NULL UNIQUE,
  metadata JSONB,
  search_text TEXT NOT NULL DEFAULT '',
  media_kind VARCHAR(16) NOT NULL DEFAULT 'NONE',
  is_collaboration BOOLEAN NOT NULL DEFAULT false,
  collaboration_intent VARCHAR(40),
  collaboration_role VARCHAR(40),
  linked_release BOOLEAN NOT NULL DEFAULT false,
  category VARCHAR(64),
  published_at TIMESTAMP(6) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) NOT NULL,
  CONSTRAINT social_activity_events_kind_check CHECK (kind IN ('POST', 'RELEASE', 'NEWS')),
  CONSTRAINT social_activity_events_audience_check CHECK (audience IN ('PUBLIC', 'FOLLOWERS', 'PRIVATE')),
  CONSTRAINT social_activity_events_kind_source_key UNIQUE (kind, source_id)
);

CREATE INDEX IF NOT EXISTS social_activity_events_published_at_id_idx
  ON icecream.social_activity_events(published_at, id);
CREATE INDEX IF NOT EXISTS social_activity_events_actor_profile_published_idx
  ON icecream.social_activity_events(actor_user_id, profile_key, published_at);
CREATE INDEX IF NOT EXISTS social_activity_events_audience_published_at_idx
  ON icecream.social_activity_events(audience, published_at);
CREATE INDEX IF NOT EXISTS social_activity_events_kind_media_kind_published_at_idx
  ON icecream.social_activity_events(kind, media_kind, published_at);
CREATE INDEX IF NOT EXISTS social_activity_events_collab_filter_idx
  ON icecream.social_activity_events(is_collaboration, collaboration_intent, collaboration_role, published_at);

INSERT INTO icecream.social_activity_events
  (kind, source_id, actor_user_id, profile_key, audience, consent_state, provenance, dedupe_key, metadata, search_text, media_kind, is_collaboration, collaboration_intent, collaboration_role, linked_release, published_at, updated_at)
SELECT 'POST', id, user_id, profile_key, audience, 'PUBLISHED', 'BACKFILL', 'post:' || id::text,
  jsonb_build_object('releaseId', release_id), lower(content), upper(COALESCE(media_type, 'NONE')),
  content LIKE '[[ICM_POST_META_V1]]%"type":"collaboration"%',
  substring(content from '"intent":"([^"]+)"'), substring(content from '"role":"([^"]+)"'),
  release_id IS NOT NULL, created_at, CURRENT_TIMESTAMP
FROM icecream.artist_profile_posts
ON CONFLICT (kind, source_id) DO NOTHING;

INSERT INTO icecream.social_activity_events
  (kind, source_id, actor_user_id, profile_key, audience, consent_state, provenance, dedupe_key, metadata, search_text, media_kind, linked_release, published_at, updated_at)
SELECT 'RELEASE', r.id, r."userId", NULL, 'PUBLIC', 'PUBLISHED', 'BACKFILL', 'release:' || r.id::text,
  jsonb_build_object('status', r.status, 'confirmed', r.confirmed),
  lower(concat_ws(' ', r.title, r.performer, r.genre, r."labelName")), 'RELEASE', true, r.date, CURRENT_TIMESTAMP
FROM icecream.release r
WHERE r.confirmed = true OR r.status = 'approved'
ON CONFLICT (kind, source_id) DO NOTHING;

INSERT INTO icecream.social_activity_events
  (kind, source_id, actor_user_id, profile_key, audience, consent_state, provenance, dedupe_key, metadata, search_text, media_kind, category, published_at, updated_at)
SELECT 'NEWS', n.id, NULL, NULL, 'PUBLIC', 'PUBLISHED', 'BACKFILL', 'news:' || n.id::text,
  jsonb_build_object('title', n.title), lower(concat_ws(' ', n.title, n.content, n.preview)), 'NONE', 'news',
  COALESCE(n."createdAt", CURRENT_TIMESTAMP), CURRENT_TIMESTAMP
FROM icecream.news n
ON CONFLICT (kind, source_id) DO NOTHING;
