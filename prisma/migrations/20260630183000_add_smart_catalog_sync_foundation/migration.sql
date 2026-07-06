DO $$
BEGIN
  CREATE TYPE "icecream"."SmartImportStatus" AS ENUM ('PREVIEW', 'CONFIRMED', 'ROLLED_BACK', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."SmartImportRowAction" AS ENUM ('MATCH', 'UPDATE', 'CREATE', 'CONFLICT', 'SKIP', 'ERROR', 'NEEDS_REVIEW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."SmartConflictStatus" AS ENUM ('PENDING', 'RESOLVED', 'SKIPPED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  CREATE TYPE "icecream"."SmartBalanceDirection" AS ENUM ('CREDIT', 'DEBIT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS "icecream"."catalog_imports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "kind" TEXT NOT NULL DEFAULT 'catalog',
  "source_file_name" TEXT NOT NULL,
  "file_format" TEXT NOT NULL,
  "detected_encoding" TEXT,
  "detected_delimiter" TEXT,
  "header_row_index" INTEGER NOT NULL DEFAULT 0,
  "status" "icecream"."SmartImportStatus" NOT NULL DEFAULT 'PREVIEW',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "matched_rows" INTEGER NOT NULL DEFAULT 0,
  "update_rows" INTEGER NOT NULL DEFAULT 0,
  "create_rows" INTEGER NOT NULL DEFAULT 0,
  "conflict_rows" INTEGER NOT NULL DEFAULT 0,
  "skipped_rows" INTEGER NOT NULL DEFAULT 0,
  "error_rows" INTEGER NOT NULL DEFAULT 0,
  "create_missing" BOOLEAN NOT NULL DEFAULT false,
  "auto_detected_map" JSONB,
  "summary" JSONB,
  "started_at" TIMESTAMP(6),
  "confirmed_at" TIMESTAMP(6),
  "rolled_back_at" TIMESTAMP(6),
  "error_message" TEXT,
  "created_by_admin_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_imports_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."catalog_import_rows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "action" "icecream"."SmartImportRowAction" NOT NULL,
  "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "raw_data" JSONB NOT NULL,
  "normalized_data" JSONB,
  "detected_match_rule" TEXT,
  "error_message" TEXT,
  "matched_release_id" UUID,
  "matched_track_id" UUID,
  "created_release_id" UUID,
  "created_track_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_import_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_import_rows_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "icecream"."catalog_imports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalog_import_rows_matched_release_id_fkey"
    FOREIGN KEY ("matched_release_id") REFERENCES "icecream"."release"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "catalog_import_rows_matched_track_id_fkey"
    FOREIGN KEY ("matched_track_id") REFERENCES "icecream"."track"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "catalog_import_rows_created_release_id_fkey"
    FOREIGN KEY ("created_release_id") REFERENCES "icecream"."release"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "catalog_import_rows_created_track_id_fkey"
    FOREIGN KEY ("created_track_id") REFERENCES "icecream"."track"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."catalog_import_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_id" UUID NOT NULL,
  "level" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_import_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_import_logs_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "icecream"."catalog_imports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."catalog_conflicts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_id" UUID NOT NULL,
  "row_id" UUID,
  "field_name" TEXT NOT NULL,
  "existing_value" TEXT,
  "incoming_value" TEXT,
  "resolution_status" "icecream"."SmartConflictStatus" NOT NULL DEFAULT 'PENDING',
  "matched_release_id" UUID,
  "matched_track_id" UUID,
  "notes" TEXT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_conflicts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_conflicts_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "icecream"."catalog_imports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalog_conflicts_row_id_fkey"
    FOREIGN KEY ("row_id") REFERENCES "icecream"."catalog_import_rows"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "catalog_conflicts_matched_release_id_fkey"
    FOREIGN KEY ("matched_release_id") REFERENCES "icecream"."release"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "catalog_conflicts_matched_track_id_fkey"
    FOREIGN KEY ("matched_track_id") REFERENCES "icecream"."track"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."catalog_updates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_id" UUID NOT NULL,
  "row_id" UUID,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "before_state" JSONB,
  "after_state" JSONB,
  "applied_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rolled_back_at" TIMESTAMP(6),
  CONSTRAINT "catalog_updates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "catalog_updates_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "icecream"."catalog_imports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "catalog_updates_row_id_fkey"
    FOREIGN KEY ("row_id") REFERENCES "icecream"."catalog_import_rows"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."import_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_type" TEXT NOT NULL,
  "import_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "actor_id" UUID,
  "description" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "import_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "icecream"."financial_imports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_file_name" TEXT NOT NULL,
  "file_format" TEXT NOT NULL,
  "detected_encoding" TEXT,
  "detected_delimiter" TEXT,
  "header_row_index" INTEGER NOT NULL DEFAULT 0,
  "status" "icecream"."SmartImportStatus" NOT NULL DEFAULT 'PREVIEW',
  "total_rows" INTEGER NOT NULL DEFAULT 0,
  "matched_rows" INTEGER NOT NULL DEFAULT 0,
  "update_rows" INTEGER NOT NULL DEFAULT 0,
  "create_rows" INTEGER NOT NULL DEFAULT 0,
  "conflict_rows" INTEGER NOT NULL DEFAULT 0,
  "skipped_rows" INTEGER NOT NULL DEFAULT 0,
  "error_rows" INTEGER NOT NULL DEFAULT 0,
  "gross_amount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "net_amount_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "commission_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "auto_detected_map" JSONB,
  "summary" JSONB,
  "started_at" TIMESTAMP(6),
  "confirmed_at" TIMESTAMP(6),
  "rolled_back_at" TIMESTAMP(6),
  "error_message" TEXT,
  "created_by_admin_id" UUID NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_imports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_imports_created_by_admin_id_fkey"
    FOREIGN KEY ("created_by_admin_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."financial_import_rows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "import_id" UUID NOT NULL,
  "row_number" INTEGER NOT NULL,
  "action" "icecream"."SmartImportRowAction" NOT NULL,
  "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "raw_data" JSONB NOT NULL,
  "normalized_data" JSONB,
  "detected_match_rule" TEXT,
  "error_message" TEXT,
  "matched_release_id" UUID,
  "matched_track_id" UUID,
  "user_id" UUID,
  "gross_amount" DECIMAL(14,2),
  "net_amount" DECIMAL(14,2),
  "commission_amount" DECIMAL(14,2),
  "commission_rate" DECIMAL(7,4),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_import_rows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "financial_import_rows_import_id_fkey"
    FOREIGN KEY ("import_id") REFERENCES "icecream"."financial_imports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "financial_import_rows_matched_release_id_fkey"
    FOREIGN KEY ("matched_release_id") REFERENCES "icecream"."release"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "financial_import_rows_matched_track_id_fkey"
    FOREIGN KEY ("matched_track_id") REFERENCES "icecream"."track"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "financial_import_rows_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."royalty_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "financial_import_id" UUID,
  "financial_import_row_id" UUID,
  "user_id" UUID NOT NULL,
  "release_id" UUID,
  "track_id" UUID,
  "gross_amount" DECIMAL(14,2) NOT NULL,
  "platform_commission_amount" DECIMAL(14,2) NOT NULL,
  "commission_rate" DECIMAL(7,4) NOT NULL,
  "net_amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'RUB',
  "platform_name" TEXT,
  "source_reference" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversed_at" TIMESTAMP(6),
  CONSTRAINT "royalty_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "royalty_transactions_financial_import_id_fkey"
    FOREIGN KEY ("financial_import_id") REFERENCES "icecream"."financial_imports"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "royalty_transactions_financial_import_row_id_fkey"
    FOREIGN KEY ("financial_import_row_id") REFERENCES "icecream"."financial_import_rows"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "royalty_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "royalty_transactions_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "icecream"."release"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "royalty_transactions_track_id_fkey"
    FOREIGN KEY ("track_id") REFERENCES "icecream"."track"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."royalty_matching_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "financial_import_id" UUID NOT NULL,
  "row_id" UUID,
  "rule_name" TEXT NOT NULL,
  "matched" BOOLEAN NOT NULL DEFAULT false,
  "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "details" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "royalty_matching_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "royalty_matching_logs_financial_import_id_fkey"
    FOREIGN KEY ("financial_import_id") REFERENCES "icecream"."financial_imports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "royalty_matching_logs_row_id_fkey"
    FOREIGN KEY ("row_id") REFERENCES "icecream"."financial_import_rows"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."commission_calculations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "financial_import_id" UUID,
  "row_id" UUID,
  "user_id" UUID,
  "source_type" TEXT NOT NULL,
  "source_reference" TEXT,
  "gross_amount" DECIMAL(14,2) NOT NULL,
  "commission_rate" DECIMAL(7,4) NOT NULL,
  "commission_amount" DECIMAL(14,2) NOT NULL,
  "net_amount" DECIMAL(14,2) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commission_calculations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commission_calculations_financial_import_id_fkey"
    FOREIGN KEY ("financial_import_id") REFERENCES "icecream"."financial_imports"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "commission_calculations_row_id_fkey"
    FOREIGN KEY ("row_id") REFERENCES "icecream"."financial_import_rows"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "commission_calculations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."balance_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "royalty_transaction_id" UUID,
  "amount" DECIMAL(14,2) NOT NULL,
  "direction" "icecream"."SmartBalanceDirection" NOT NULL,
  "balance_before" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "balance_after" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "description" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "balance_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "balance_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "balance_transactions_royalty_transaction_id_fkey"
    FOREIGN KEY ("royalty_transaction_id") REFERENCES "icecream"."royalty_transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."user_commission_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "commission_rate" DECIMAL(7,4) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "starts_at" TIMESTAMP(6),
  "ends_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_commission_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_commission_rates_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."label_commission_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "label_name" TEXT NOT NULL,
  "commission_rate" DECIMAL(7,4) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "starts_at" TIMESTAMP(6),
  "ends_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "label_commission_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "icecream"."contract_commission_rates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "contract_reference" TEXT,
  "commission_rate" DECIMAL(7,4) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "starts_at" TIMESTAMP(6),
  "ends_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contract_commission_rates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contract_commission_rates_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "icecream"."platform_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "value_string" TEXT,
  "value_number" DECIMAL(14,4),
  "value_json" JSONB,
  "updated_by_id" UUID,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "catalog_import_rows_import_id_row_number_key"
  ON "icecream"."catalog_import_rows"("import_id", "row_number");
CREATE UNIQUE INDEX IF NOT EXISTS "financial_import_rows_import_id_row_number_key"
  ON "icecream"."financial_import_rows"("import_id", "row_number");
CREATE UNIQUE INDEX IF NOT EXISTS "label_commission_rates_label_name_active_uniq"
  ON "icecream"."label_commission_rates"("label_name", "active");
CREATE UNIQUE INDEX IF NOT EXISTS "platform_settings_key_key"
  ON "icecream"."platform_settings"("key");

CREATE INDEX IF NOT EXISTS "catalog_imports_status_created_at_idx"
  ON "icecream"."catalog_imports"("status", "created_at");
CREATE INDEX IF NOT EXISTS "catalog_imports_created_by_admin_id_created_at_idx"
  ON "icecream"."catalog_imports"("created_by_admin_id", "created_at");
CREATE INDEX IF NOT EXISTS "catalog_import_rows_action_row_number_idx"
  ON "icecream"."catalog_import_rows"("action", "row_number");
CREATE INDEX IF NOT EXISTS "catalog_import_logs_import_id_created_at_idx"
  ON "icecream"."catalog_import_logs"("import_id", "created_at");
CREATE INDEX IF NOT EXISTS "catalog_conflicts_import_id_resolution_status_idx"
  ON "icecream"."catalog_conflicts"("import_id", "resolution_status");
CREATE INDEX IF NOT EXISTS "catalog_updates_import_id_applied_at_idx"
  ON "icecream"."catalog_updates"("import_id", "applied_at");
CREATE INDEX IF NOT EXISTS "import_history_import_type_import_id_created_at_idx"
  ON "icecream"."import_history"("import_type", "import_id", "created_at");
CREATE INDEX IF NOT EXISTS "financial_imports_status_created_at_idx"
  ON "icecream"."financial_imports"("status", "created_at");
CREATE INDEX IF NOT EXISTS "financial_imports_created_by_admin_id_created_at_idx"
  ON "icecream"."financial_imports"("created_by_admin_id", "created_at");
CREATE INDEX IF NOT EXISTS "financial_import_rows_action_row_number_idx"
  ON "icecream"."financial_import_rows"("action", "row_number");
CREATE INDEX IF NOT EXISTS "royalty_transactions_user_id_created_at_idx"
  ON "icecream"."royalty_transactions"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "royalty_transactions_financial_import_id_created_at_idx"
  ON "icecream"."royalty_transactions"("financial_import_id", "created_at");
CREATE INDEX IF NOT EXISTS "royalty_matching_logs_financial_import_id_created_at_idx"
  ON "icecream"."royalty_matching_logs"("financial_import_id", "created_at");
CREATE INDEX IF NOT EXISTS "commission_calculations_financial_import_id_created_at_idx"
  ON "icecream"."commission_calculations"("financial_import_id", "created_at");
CREATE INDEX IF NOT EXISTS "balance_transactions_user_id_created_at_idx"
  ON "icecream"."balance_transactions"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "user_commission_rates_user_id_active_idx"
  ON "icecream"."user_commission_rates"("user_id", "active");
CREATE INDEX IF NOT EXISTS "label_commission_rates_label_name_idx"
  ON "icecream"."label_commission_rates"("label_name");
CREATE INDEX IF NOT EXISTS "contract_commission_rates_user_id_active_idx"
  ON "icecream"."contract_commission_rates"("user_id", "active");

INSERT INTO "icecream"."platform_settings" ("id", "key", "value_number", "created_at", "updated_at")
SELECT gen_random_uuid(), 'platform_commission_rate', 0.40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "icecream"."platform_settings" WHERE "key" = 'platform_commission_rate'
);
