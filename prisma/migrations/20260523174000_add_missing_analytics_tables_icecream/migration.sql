SET search_path TO "icecream";

DO $$ BEGIN
  CREATE TYPE "AnalyticsImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "analytics_import_jobs" (
  "id" TEXT NOT NULL,
  "source_file_name" TEXT NOT NULL,
  "stored_file_path" TEXT,
  "report_date" TIMESTAMP(3) NOT NULL,
  "status" "AnalyticsImportJobStatus" NOT NULL DEFAULT 'PENDING',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "imported_rows" INTEGER NOT NULL DEFAULT 0,
  "matched_rows" INTEGER NOT NULL DEFAULT 0,
  "unmatched_rows" INTEGER NOT NULL DEFAULT 0,
  "affected_users_count" INTEGER NOT NULL DEFAULT 0,
  "affected_releases_count" INTEGER NOT NULL DEFAULT 0,
  "platforms_count" INTEGER NOT NULL DEFAULT 0,
  "rows_with_unknown_platform" INTEGER NOT NULL DEFAULT 0,
  "top_platform" TEXT,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_by_admin_id" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_import_jobs_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "analytics_import_jobs"
    ADD CONSTRAINT "analytics_import_jobs_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "analytics_import_jobs_status_created_at_idx"
ON "analytics_import_jobs"("status", "created_at");

CREATE INDEX IF NOT EXISTS "analytics_import_jobs_report_date_idx"
ON "analytics_import_jobs"("report_date");

CREATE TABLE IF NOT EXISTS "analytics_report_snapshots" (
  "id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "release_id" UUID NOT NULL,
  "upc" TEXT NOT NULL,
  "report_date" TIMESTAMP(3) NOT NULL,
  "period_days" INTEGER NOT NULL DEFAULT 30,
  "country" TEXT NOT NULL,
  "platform" TEXT,
  "streams" INTEGER NOT NULL,
  "pay_streams" INTEGER NOT NULL,
  "track_name" TEXT,
  "artist_name" TEXT,
  "album_name" TEXT,
  "source_file_name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_report_snapshots_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "analytics_report_snapshots"
    ADD CONSTRAINT "analytics_report_snapshots_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_report_snapshots"
    ADD CONSTRAINT "analytics_report_snapshots_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ars_release_date_country_platform_uniq"
ON "analytics_report_snapshots"("release_id", "report_date", "country", "platform");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_user_id_report_date_idx"
ON "analytics_report_snapshots"("user_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_release_id_report_date_idx"
ON "analytics_report_snapshots"("release_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_upc_idx"
ON "analytics_report_snapshots"("upc");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_country_idx"
ON "analytics_report_snapshots"("country");

CREATE INDEX IF NOT EXISTS "analytics_report_snapshots_platform_idx"
ON "analytics_report_snapshots"("platform");

CREATE TABLE IF NOT EXISTS "analytics_daily_summaries" (
  "id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "release_id" UUID,
  "report_date" TIMESTAMP(3) NOT NULL,
  "total_streams" INTEGER NOT NULL,
  "total_pay_streams" INTEGER NOT NULL,
  "countries_count" INTEGER NOT NULL DEFAULT 0,
  "top_country" TEXT,
  "releases_count" INTEGER NOT NULL DEFAULT 0,
  "top_platform" TEXT,
  "platforms_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_daily_summaries_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "analytics_daily_summaries"
    ADD CONSTRAINT "analytics_daily_summaries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_daily_summaries"
    ADD CONSTRAINT "analytics_daily_summaries_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_daily_summaries_user_id_release_id_report_date_key"
ON "analytics_daily_summaries"("user_id", "release_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_daily_summaries_user_id_report_date_idx"
ON "analytics_daily_summaries"("user_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_daily_summaries_release_id_report_date_idx"
ON "analytics_daily_summaries"("release_id", "report_date");

CREATE TABLE IF NOT EXISTS "analytics_platform_summaries" (
  "id" TEXT NOT NULL,
  "user_id" UUID NOT NULL,
  "release_id" UUID,
  "report_date" TIMESTAMP(3) NOT NULL,
  "platform" TEXT NOT NULL,
  "streams" INTEGER NOT NULL,
  "pay_streams" INTEGER NOT NULL,
  "share_percent" DECIMAL(7,3) NOT NULL DEFAULT 0,
  "change_percent" DECIMAL(7,3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_platform_summaries_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "analytics_platform_summaries"
    ADD CONSTRAINT "analytics_platform_summaries_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "analytics_platform_summaries"
    ADD CONSTRAINT "analytics_platform_summaries_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "aps_user_release_date_platform_uniq"
ON "analytics_platform_summaries"("user_id", "release_id", "report_date", "platform");

CREATE INDEX IF NOT EXISTS "analytics_platform_summaries_user_id_report_date_idx"
ON "analytics_platform_summaries"("user_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_platform_summaries_release_id_report_date_idx"
ON "analytics_platform_summaries"("release_id", "report_date");

CREATE INDEX IF NOT EXISTS "analytics_platform_summaries_platform_idx"
ON "analytics_platform_summaries"("platform");

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
  "import_job_id" TEXT,
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_admin_id" UUID,
  "resolved_release_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unmatched_analytics_imports_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "unmatched_analytics_imports"
    ADD CONSTRAINT "unmatched_analytics_imports_import_job_id_fkey"
    FOREIGN KEY ("import_job_id") REFERENCES "analytics_import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "unmatched_analytics_imports"
    ADD CONSTRAINT "unmatched_analytics_imports_resolved_by_admin_id_fkey"
    FOREIGN KEY ("resolved_by_admin_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "unmatched_analytics_imports"
    ADD CONSTRAINT "unmatched_analytics_imports_resolved_release_id_fkey"
    FOREIGN KEY ("resolved_release_id") REFERENCES "release"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "unmatched_analytics_imports_report_date_idx"
ON "unmatched_analytics_imports"("report_date");

CREATE INDEX IF NOT EXISTS "unmatched_analytics_imports_upc_idx"
ON "unmatched_analytics_imports"("upc");

CREATE INDEX IF NOT EXISTS "unmatched_analytics_imports_resolved_report_date_idx"
ON "unmatched_analytics_imports"("resolved", "report_date");
