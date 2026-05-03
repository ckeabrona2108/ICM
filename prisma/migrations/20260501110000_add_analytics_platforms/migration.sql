ALTER TABLE "analytics_report_snapshots"
  ADD COLUMN IF NOT EXISTS "platform" TEXT;

DROP INDEX IF EXISTS "analytics_report_snapshots_release_id_report_date_country_key";

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_report_snapshots_release_id_report_date_country_platform_key"
ON "analytics_report_snapshots"("release_id", "report_date", "country", "platform");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_platform_idx"
ON "analytics_report_snapshots"("platform");

ALTER TABLE "analytics_daily_summaries"
  ADD COLUMN IF NOT EXISTS "top_platform" TEXT,
  ADD COLUMN IF NOT EXISTS "platforms_count" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "analytics_platform_summaries" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "release_id" TEXT,
  "report_date" TIMESTAMP(3) NOT NULL,
  "platform" TEXT NOT NULL,
  "streams" INTEGER NOT NULL,
  "pay_streams" INTEGER NOT NULL,
  "share_percent" DECIMAL(7,3) NOT NULL DEFAULT 0,
  "change_percent" DECIMAL(7,3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_platform_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analytics_platform_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "analytics_platform_summaries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_platform_summaries_user_id_release_id_report_date_platform_key"
ON "analytics_platform_summaries"("user_id", "release_id", "report_date", "platform");

CREATE INDEX IF NOT EXISTS "analytics_platform_summaries_user_id_report_date_idx"
ON "analytics_platform_summaries"("user_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_platform_summaries_release_id_report_date_idx"
ON "analytics_platform_summaries"("release_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_platform_summaries_platform_idx"
ON "analytics_platform_summaries"("platform");

ALTER TABLE "analytics_import_jobs"
  ADD COLUMN IF NOT EXISTS "platforms_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "rows_with_unknown_platform" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "top_platform" TEXT;

