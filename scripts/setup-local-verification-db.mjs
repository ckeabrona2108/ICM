import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const storeFile = path.join(process.cwd(), ".tmp", "user-contract-signatures.json");
const legacyPlaceholderDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";

function normalizeStatus(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "pending") return "PENDING";
  if (normalized === "approved") return "APPROVED";
  if (normalized === "signed") return "PENDING";
  if (normalized === "rejected" || normalized === "revoked") return "REJECTED";
  return "NOT_SIGNED";
}

function normalizeSignatureImageUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return legacyPlaceholderDataUrl;
  if (raw.startsWith("local://contract-signature/")) return legacyPlaceholderDataUrl;
  return raw;
}

async function ensureVerificationSchema() {
  await prisma.$executeRawUnsafe(`
    ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';
  `);

  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'ContractSignatureStatus'
      ) THEN
        CREATE TYPE "ContractSignatureStatus" AS ENUM ('NOT_SIGNED', 'PENDING', 'APPROVED', 'REJECTED');
      END IF;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
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
      "status" "ContractSignatureStatus" NOT NULL DEFAULT 'PENDING',
      "rejection_reason" TEXT,
      "approved_at" TIMESTAMP(3),
      "approved_by_admin_id" TEXT,
      "rejected_at" TIMESTAMP(3),
      "rejected_by_admin_id" TEXT,
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
      CONSTRAINT "user_contract_signatures_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_contract_signatures_user_id_status_idx"
    ON "user_contract_signatures"("user_id", "status");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "user_contract_signatures_signed_at_idx"
    ON "user_contract_signatures"("signed_at");
  `);
}

async function convertLegacyAutoApprovedToPending() {
  await prisma.$executeRawUnsafe(`
    UPDATE "user_contract_signatures"
    SET
      "status" = 'PENDING',
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "status" = 'APPROVED'
      AND "approved_at" IS NULL
      AND ("approved_by_admin_id" IS NULL OR "approved_by_admin_id" = '');
  `);
}

async function readStoreRecords() {
  try {
    const raw = await readFile(storeFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function syncStoreToDb() {
  const records = await readStoreRecords();
  let synced = 0;

  for (const item of records) {
    const user = await prisma.user.findUnique({
      where: { id: item.userId },
      select: { id: true }
    });
    if (!user) continue;

    await prisma.userContractSignature.upsert({
      where: { id: item.id },
      update: {
        userEmail: item.userEmail,
        userName: item.userName ?? null,
        contractVersion: item.contractVersion,
        contractFileName: item.contractFileName,
        contractFileUrl: item.contractFileUrl,
        signatureImageUrl: normalizeSignatureImageUrl(item.signatureImageUrl),
        signedAt: new Date(item.signedAt),
        ipAddress: item.ipAddress ?? null,
        userAgent: item.userAgent ?? null,
        status: normalizeStatus(item.status),
        rejectionReason: item.rejectionReason ?? null,
        approvedAt: item.approvedAt ? new Date(item.approvedAt) : null,
        approvedByAdminId: item.approvedByAdminId ?? null,
        rejectedAt: item.rejectedAt ? new Date(item.rejectedAt) : null,
        rejectedByAdminId: item.rejectedByAdminId ?? null,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(item.signedAt),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(item.signedAt),
        fullName: item.fullName,
        birthDate: item.birthDate ?? null,
        passportNumber: item.passportNumber ?? null,
        passportIssuedBy: item.passportIssuedBy ?? null,
        passportCode: item.passportCode ?? null,
        passportIssueDate: item.passportIssueDate ?? null,
        address: item.address ?? null,
        ogrnip: item.ogrnip ?? null,
        inn: item.inn ?? null,
        snils: item.snils ?? null
      },
      create: {
        id: item.id,
        userId: item.userId,
        userEmail: item.userEmail,
        userName: item.userName ?? null,
        contractVersion: item.contractVersion,
        contractFileName: item.contractFileName,
        contractFileUrl: item.contractFileUrl,
        signatureImageUrl: normalizeSignatureImageUrl(item.signatureImageUrl),
        signedAt: new Date(item.signedAt),
        ipAddress: item.ipAddress ?? null,
        userAgent: item.userAgent ?? null,
        status: normalizeStatus(item.status),
        rejectionReason: item.rejectionReason ?? null,
        approvedAt: item.approvedAt ? new Date(item.approvedAt) : null,
        approvedByAdminId: item.approvedByAdminId ?? null,
        rejectedAt: item.rejectedAt ? new Date(item.rejectedAt) : null,
        rejectedByAdminId: item.rejectedByAdminId ?? null,
        createdAt: item.createdAt ? new Date(item.createdAt) : new Date(item.signedAt),
        updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(item.signedAt),
        fullName: item.fullName,
        birthDate: item.birthDate ?? null,
        passportNumber: item.passportNumber ?? null,
        passportIssuedBy: item.passportIssuedBy ?? null,
        passportCode: item.passportCode ?? null,
        passportIssueDate: item.passportIssueDate ?? null,
        address: item.address ?? null,
        ogrnip: item.ogrnip ?? null,
        inn: item.inn ?? null,
        snils: item.snils ?? null
      }
    });
    synced += 1;
  }

  return synced;
}

const run = async () => {
  await ensureVerificationSchema();
  const synced = await syncStoreToDb();
  await convertLegacyAutoApprovedToPending();
  const count = await prisma.userContractSignature.count();
  console.log(`Verification schema ready. Synced ${synced} store records. Total DB records: ${count}.`);
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
