ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';

ALTER TYPE "ContractSignatureStatus" RENAME TO "ContractSignatureStatus_old";

CREATE TYPE "ContractSignatureStatus" AS ENUM (
  'NOT_SIGNED',
  'PENDING',
  'APPROVED',
  'REJECTED'
);

ALTER TABLE "user_contract_signatures"
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approved_by_admin_id" TEXT,
  ADD COLUMN IF NOT EXISTS "rejected_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejected_by_admin_id" TEXT;

ALTER TABLE "user_contract_signatures"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "user_contract_signatures"
  ALTER COLUMN "status" TYPE "ContractSignatureStatus"
  USING (
    CASE
      WHEN "status"::text = 'SIGNED' THEN 'PENDING'
      WHEN "status"::text = 'REVOKED' THEN 'REJECTED'
      ELSE 'PENDING'
    END
  )::"ContractSignatureStatus";

ALTER TABLE "user_contract_signatures"
  ALTER COLUMN "status" SET DEFAULT 'PENDING';

DROP TYPE "ContractSignatureStatus_old";
