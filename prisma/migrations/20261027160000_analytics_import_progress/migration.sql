-- Ход обработки импорта для полосы прогресса в админке.
ALTER TABLE "icecream"."analytics_import_jobs" ADD COLUMN IF NOT EXISTS "progress_percent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "icecream"."analytics_import_jobs" ADD COLUMN IF NOT EXISTS "progress_stage" TEXT;
