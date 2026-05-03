DO $$
BEGIN
  CREATE TYPE "AnalyticsAiInsightStatus" AS ENUM ('PROCESSING', 'SUCCESS', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "analytics_ai_insights" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "artist_id" TEXT,
  "release_id" TEXT,
  "period_days" INTEGER NOT NULL,
  "filters_hash" TEXT NOT NULL,
  "context_snapshot" JSONB NOT NULL,
  "ai_response" JSONB,
  "status" "AnalyticsAiInsightStatus" NOT NULL DEFAULT 'PROCESSING',
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_ai_insights_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analytics_ai_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "analytics_ai_insights_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "ArtistProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "analytics_ai_insights_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "analytics_ai_insights_user_id_idx"
ON "analytics_ai_insights"("user_id");

CREATE INDEX IF NOT EXISTS "analytics_ai_insights_artist_id_idx"
ON "analytics_ai_insights"("artist_id");

CREATE INDEX IF NOT EXISTS "analytics_ai_insights_release_id_idx"
ON "analytics_ai_insights"("release_id");

CREATE INDEX IF NOT EXISTS "analytics_ai_insights_created_at_idx"
ON "analytics_ai_insights"("created_at");

CREATE INDEX IF NOT EXISTS "analytics_ai_insights_filters_hash_idx"
ON "analytics_ai_insights"("filters_hash");
