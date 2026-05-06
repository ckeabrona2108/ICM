DO $$ BEGIN
  CREATE TYPE "ContractSignatureStatus" AS ENUM ('SIGNED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "user_contract_signatures" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "user_email" TEXT NOT NULL,
  "user_name" TEXT,
  "contract_version" TEXT NOT NULL,
  "contract_file_name" TEXT NOT NULL,
  "contract_file_url" TEXT NOT NULL,
  "signature_image_url" TEXT NOT NULL,
  "signed_at" TIMESTAMP(3) NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "status" "ContractSignatureStatus" NOT NULL DEFAULT 'SIGNED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  "full_name" TEXT NOT NULL,
  "birth_date" TEXT,
  "passport_number" TEXT,
  "passport_issued_by" TEXT,
  "passport_code" TEXT,
  "passport_issue_date" TEXT,
  "address" TEXT,
  "ogrnip" TEXT,
  "inn" TEXT,
  "snils" TEXT,

  CONSTRAINT "user_contract_signatures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_contract_signatures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "user_contract_signatures_user_id_status_idx"
ON "user_contract_signatures"("user_id", "status");

CREATE INDEX IF NOT EXISTS "user_contract_signatures_signed_at_idx"
ON "user_contract_signatures"("signed_at");

