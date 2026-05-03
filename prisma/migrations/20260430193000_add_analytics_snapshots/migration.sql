CREATE TABLE IF NOT EXISTS "analytics_report_snapshots" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "release_id" TEXT NOT NULL,
  "upc" TEXT NOT NULL,
  "report_date" TIMESTAMP(3) NOT NULL,
  "period_days" INTEGER NOT NULL DEFAULT 30,
  "country" TEXT NOT NULL,
  "streams" INTEGER NOT NULL,
  "pay_streams" INTEGER NOT NULL,
  "track_name" TEXT,
  "artist_name" TEXT,
  "album_name" TEXT,
  "source_file_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_report_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analytics_report_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "analytics_report_snapshots_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_report_snapshots_release_id_report_date_country_key"
ON "analytics_report_snapshots"("release_id", "report_date", "country");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_user_id_report_date_idx"
ON "analytics_report_snapshots"("user_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_release_id_report_date_idx"
ON "analytics_report_snapshots"("release_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_upc_idx"
ON "analytics_report_snapshots"("upc");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_country_idx"
ON "analytics_report_snapshots"("country");

CREATE TABLE IF NOT EXISTS "analytics_daily_summaries" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "release_id" TEXT,
  "report_date" TIMESTAMP(3) NOT NULL,
  "total_streams" INTEGER NOT NULL,
  "total_pay_streams" INTEGER NOT NULL,
  "countries_count" INTEGER NOT NULL DEFAULT 0,
  "top_country" TEXT,
  "releases_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_daily_summaries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analytics_daily_summaries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "analytics_daily_summaries_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_daily_summaries_user_id_release_id_report_date_key"
ON "analytics_daily_summaries"("user_id", "release_id", "report_date");

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_daily_summaries_user_id_report_date_null_release_key"
ON "analytics_daily_summaries"("user_id", "report_date")
WHERE "release_id" IS NULL;

CREATE INDEX IF NOT EXISTS "analytics_daily_summaries_user_id_report_date_idx"
ON "analytics_daily_summaries"("user_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_daily_summaries_release_id_report_date_idx"
ON "analytics_daily_summaries"("release_id", "report_date");

CREATE TABLE IF NOT EXISTS "unmatched_analytics_imports" (
  "id" TEXT NOT NULL,
  "upc" TEXT NOT NULL,
  "track_name" TEXT,
  "artist_name" TEXT,
  "album_name" TEXT,
  "country" TEXT NOT NULL,
  "streams" INTEGER NOT NULL,
  "pay_streams" INTEGER NOT NULL,
  "source_file_name" TEXT NOT NULL,
  "report_date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unmatched_analytics_imports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "unmatched_analytics_imports_report_date_idx"
ON "unmatched_analytics_imports"("report_date");

CREATE INDEX IF NOT EXISTS "unmatched_analytics_imports_upc_idx"
ON "unmatched_analytics_imports"("upc");
