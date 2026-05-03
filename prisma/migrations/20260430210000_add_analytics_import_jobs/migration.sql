DO $$ BEGIN
  CREATE TYPE "AnalyticsImportJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'PARTIAL', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
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
  "error_message" TEXT,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_by_admin_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "analytics_import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analytics_import_jobs_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "analytics_import_jobs_status_created_at_idx"
ON "analytics_import_jobs"("status", "created_at");

CREATE INDEX IF NOT EXISTS "analytics_import_jobs_report_date_idx"
ON "analytics_import_jobs"("report_date");

ALTER TABLE "unmatched_analytics_imports"
  ADD COLUMN IF NOT EXISTS "import_job_id" TEXT,
  ADD COLUMN IF NOT EXISTS "resolved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolved_by_admin_id" TEXT,
  ADD COLUMN IF NOT EXISTS "resolved_release_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "unmatched_analytics_imports"
    ADD CONSTRAINT "unmatched_analytics_imports_import_job_id_fkey"
    FOREIGN KEY ("import_job_id") REFERENCES "analytics_import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "unmatched_analytics_imports"
    ADD CONSTRAINT "unmatched_analytics_imports_resolved_by_admin_id_fkey"
    FOREIGN KEY ("resolved_by_admin_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "unmatched_analytics_imports"
    ADD CONSTRAINT "unmatched_analytics_imports_resolved_release_id_fkey"
    FOREIGN KEY ("resolved_release_id") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "unmatched_analytics_imports_resolved_report_date_idx"
ON "unmatched_analytics_imports"("resolved", "report_date");
