// @ts-nocheck
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import {
  createPresignedDownload,
  getStorageBucketCandidates,
  getStorageBucketHint,
  uploadObjectToStorage
} from "@/lib/s3";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import {
  notifyAdminContractSigned,
  notifyAdminReleaseSubmitted
} from "@/lib/telegram-notifier";
import {
  CONTRACT_FILE_NAME,
  CONTRACT_FILE_URL,
  CONTRACT_VERSION,
  type ContractSignerFormData,
  type ContractSignerValidationIssue,
  type ContractSignatureStatus,
  type ContractStatusPayload
} from "@/lib/contract-verification-shared";

const RELEASE_STATUS_PENDING_VERIFICATION = "moderating";
const RELEASE_STATUS_MODERATION = "moderating";
const RELEASE_STATUS_CHANGES_REQUIRED = "rejected";

export interface ContractSignatureListItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  contractVersion: string;
  contractFileName: string;
  contractFileUrl: string;
  signatureImageUrl: string;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: ContractSignatureStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  approvedByAdminId: string | null;
  rejectedAt: string | null;
  rejectedByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  fullName: string;
  birthDate: string | null;
  passportNumber: string | null;
  passportIssuedBy: string | null;
  passportCode: string | null;
  passportIssueDate: string | null;
  address: string | null;
  ogrnip: string | null;
  inn: string | null;
  snils: string | null;
}

interface CreateContractSignatureParams {
  prisma: PrismaClient;
  userId: string;
  userEmail: string;
  userName: string | null;
  contractVersion: string;
  signatureImage: string;
  signerData: ContractSignerFormData;
  ipAddress?: string | null;
  userAgent?: string | null;
  notify?: (payload: { userId: string; userName: string | null; userEmail: string }) => Promise<boolean>;
  logger?: { error: (...args: unknown[]) => void };
}

interface ContractSignatureRecordLike {
  id: string;
  userId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: Date | string;
  birthPlace: string;
  tel: string;
  passSeries: string;
  passNum: string;
  getDate: Date | string;
  givenBy: string;
  subunitCode: string;
  registrationAddress: string;
  accountNumber: string;
  bankName: string;
  status: string;
  rejectReason: string | null;
  contract: string;
  user?: {
    email?: string | null;
    name?: string | null;
  } | null;
}

interface VerificationContractMeta {
  contractVersion?: string;
  contractFileName?: string;
  contractFileUrl?: string;
  signatureImageUrl?: string;
  signedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  approvedAt?: string | null;
  approvedByAdminId?: string | null;
  rejectedAt?: string | null;
  rejectedByAdminId?: string | null;
  rejectionReason?: string | null;
  fullName?: string;
  birthDate?: string | null;
  passportNumber?: string | null;
  passportIssuedBy?: string | null;
  passportCode?: string | null;
  passportIssueDate?: string | null;
  address?: string | null;
  ogrnip?: string | null;
  inn?: string | null;
  snils?: string | null;
}

type ModelLike = {
  findFirst: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<unknown[]>;
  findUnique: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
};

export interface VerificationReviewResult {
  ok: boolean;
  verificationId?: string;
  movedReleaseIds?: string[];
  error?: string;
}

export interface VerificationDownloadAsset {
  contentType: string;
  fileName: string;
  body?: Buffer;
  redirectUrl?: string;
}

interface ReleaseMutationLike {
  release: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    updateMany(args: unknown): Promise<unknown>;
  };
}

function deriveArtistNameFromSubmissionData(value: unknown): string {
  if (!value || typeof value !== "object") return "Неизвестный исполнитель";
  const maybePersons = (value as { persons?: unknown }).persons;
  if (!Array.isArray(maybePersons)) return "Неизвестный исполнитель";

  const normalized = maybePersons
    .map((person) => {
      if (!person || typeof person !== "object") return null;
      const name = typeof (person as { name?: unknown }).name === "string" ? (person as { name: string }).name.trim() : "";
      const role = typeof (person as { role?: unknown }).role === "string" ? (person as { role: string }).role.trim().toLowerCase() : "";
      if (!name) return null;
      return { name, role };
    })
    .filter((person): person is { name: string; role: string } => Boolean(person));

  const preferred =
    normalized.find((person) => person.role.includes("исполн") || person.role.includes("artist")) ??
    normalized[0];

  return preferred?.name || "Неизвестный исполнитель";
}

async function notifyMovedReleasesNowOnModeration(params: {
  prisma: PrismaClient;
  releaseIds: string[];
}): Promise<void> {
  if (params.releaseIds.length === 0) return;

  const releases = await (
    params.prisma as unknown as {
      release: {
        findMany(args: unknown): Promise<Array<{ id: string; title?: string | null; submissionData?: unknown }>>;
      };
    }
  ).release.findMany({
    where: { id: { in: params.releaseIds } },
    select: {
      id: true,
      title: true,
      submissionData: true
    }
  });

  for (const release of releases) {
    await notifyAdminReleaseSubmitted({
      releaseTitle: release.title?.trim() || "Без названия",
      artistName: deriveArtistNameFromSubmissionData(release.submissionData)
    });
  }
}

const storeDir = path.join(process.cwd(), ".tmp");
const storeFile = path.join(storeDir, "user-contract-signatures.json");
const LEGACY_SIGNATURE_PLACEHOLDER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";
const LEGACY_SIGNATURE_PLACEHOLDER_DATA_URL = `data:image/png;base64,${LEGACY_SIGNATURE_PLACEHOLDER_PNG}`;

const fullNameWordsPattern = /^\S+\s+\S+/u;
const passportNumberPattern = /^\d{4}\s\d{6}$/u;
const innPattern = /^(\d{10}|\d{12})$/u;
const snilsPattern = /^\d{3}-\d{3}-\d{3}\s\d{2}$/u;
const isProductionRuntime = process.env.NODE_ENV === "production";
const allowLocalVerificationStore = process.env.VERIFICATION_ALLOW_LOCAL_STORE === "true";

function shouldUseLocalVerificationStore(): boolean {
  return !isProductionRuntime || allowLocalVerificationStore;
}

function assertLocalVerificationStoreAvailable(): void {
  if (shouldUseLocalVerificationStore()) return;
  throw new Error(
    "Верификация подписи временно недоступна: локальное хранилище отключено в production. Настройте S3/MinIO и таблицу verification."
  );
}

function normalizeNullable(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeDate(value: string | null | undefined): string | null {
  const normalized = normalizeNullable(value);
  if (!normalized) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(normalized);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return normalized;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  return value.toISOString();
}

function normalizeSignerData(input: ContractSignerFormData): ContractSignerFormData {
  return {
    fullName: input.fullName.trim(),
    birthDate: normalizeDate(input.birthDate),
    passportNumber: normalizeNullable(input.passportNumber),
    passportIssuedBy: normalizeNullable(input.passportIssuedBy),
    passportCode: normalizeNullable(input.passportCode),
    passportIssueDate: normalizeDate(input.passportIssueDate),
    address: normalizeNullable(input.address),
    ogrnip: normalizeNullable(input.ogrnip),
    inn: normalizeNullable(input.inn),
    snils: normalizeNullable(input.snils),
    confirmationAccepted: Boolean(input.confirmationAccepted)
  };
}

function isDataUrlPng(value: string): boolean {
  return /^data:image\/png;base64,[a-zA-Z0-9+/=\s]+$/u.test(value.trim());
}

function normalizeContractStatusValue(value: string | null | undefined): ContractSignatureStatus {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "pending") return "pending";
  if (normalized === "moderating") return "pending";
  if (normalized === "approved") return "approved";
  if (normalized === "signed") return "pending";
  if (normalized === "rejected" || normalized === "revoked") return "rejected";
  if (normalized === "not_signed") return "not_signed";
  return "not_signed";
}

export function isVerificationSignatureUnavailable(rawValue: string | null | undefined): boolean {
  const value = (rawValue ?? "").trim();
  if (!value) return true;
  if (value.startsWith("local://contract-signature/")) return true;
  return value === LEGACY_SIGNATURE_PLACEHOLDER_DATA_URL;
}

function toDbStatus(value: ContractSignatureStatus): "moderating" | "approved" | "rejected" {
  if (value === "approved") return "approved";
  if (value === "rejected") return "rejected";
  return "moderating";
}

function getModel(prisma: PrismaClient): ModelLike | null {
  const model = (prisma as unknown as { verification?: ModelLike }).verification;
  return model ?? null;
}

function safeParseContractMeta(rawValue: string | null | undefined): VerificationContractMeta {
  const raw = (rawValue ?? "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    return {
      contractVersion:
        (parsed.contractVersion as string | undefined) ??
        (parsed.contract_version as string | undefined),
      contractFileName:
        (parsed.contractFileName as string | undefined) ??
        (parsed.contract_file_name as string | undefined),
      contractFileUrl:
        (parsed.contractFileUrl as string | undefined) ??
        (parsed.contract_file_url as string | undefined),
      signatureImageUrl:
        (parsed.signatureImageUrl as string | undefined) ??
        (parsed.signature_image_url as string | undefined),
      signedAt:
        (parsed.signedAt as string | undefined) ??
        (parsed.signed_at as string | undefined),
      createdAt:
        (parsed.createdAt as string | undefined) ??
        (parsed.created_at as string | undefined),
      updatedAt:
        (parsed.updatedAt as string | undefined) ??
        (parsed.updated_at as string | undefined),
      ipAddress:
        (parsed.ipAddress as string | null | undefined) ??
        (parsed.ip_address as string | null | undefined) ??
        null,
      userAgent:
        (parsed.userAgent as string | null | undefined) ??
        (parsed.user_agent as string | null | undefined) ??
        null,
      approvedAt:
        (parsed.approvedAt as string | null | undefined) ??
        (parsed.approved_at as string | null | undefined) ??
        null,
      approvedByAdminId:
        (parsed.approvedByAdminId as string | null | undefined) ??
        (parsed.approved_by_admin_id as string | null | undefined) ??
        null,
      rejectedAt:
        (parsed.rejectedAt as string | null | undefined) ??
        (parsed.rejected_at as string | null | undefined) ??
        null,
      rejectedByAdminId:
        (parsed.rejectedByAdminId as string | null | undefined) ??
        (parsed.rejected_by_admin_id as string | null | undefined) ??
        null,
      rejectionReason:
        (parsed.rejectionReason as string | null | undefined) ??
        (parsed.rejection_reason as string | null | undefined) ??
        null,
      fullName:
        (parsed.fullName as string | undefined) ??
        (parsed.full_name as string | undefined),
      birthDate:
        (parsed.birthDate as string | null | undefined) ??
        (parsed.birth_date as string | null | undefined) ??
        null,
      passportNumber:
        (parsed.passportNumber as string | null | undefined) ??
        (parsed.passport_number as string | null | undefined) ??
        null,
      passportIssuedBy:
        (parsed.passportIssuedBy as string | null | undefined) ??
        (parsed.passport_issued_by as string | null | undefined) ??
        null,
      passportCode:
        (parsed.passportCode as string | null | undefined) ??
        (parsed.passport_code as string | null | undefined) ??
        null,
      passportIssueDate:
        (parsed.passportIssueDate as string | null | undefined) ??
        (parsed.passport_issue_date as string | null | undefined) ??
        null,
      address:
        (parsed.address as string | null | undefined) ??
        null,
      ogrnip:
        (parsed.ogrnip as string | null | undefined) ??
        null,
      inn:
        (parsed.inn as string | null | undefined) ??
        null,
      snils:
        (parsed.snils as string | null | undefined) ??
        null
    };
  } catch {
    return {};
  }
}

function toVerificationContractMetaString(value: VerificationContractMeta): string {
  return JSON.stringify(value);
}

function splitFullName(fullName: string): { firstName: string; middleName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/u).filter(Boolean);
  const lastName = parts[0] ?? "Не указано";
  const firstName = parts[1] ?? parts[0] ?? "Не указано";
  const middleName = parts.slice(2).join(" ") || "—";
  return { firstName, middleName, lastName };
}

function splitPassportNumber(passportNumber: string | null | undefined): { passSeries: string; passNum: string } {
  const normalized = (passportNumber ?? "").replace(/\s+/gu, "");
  return {
    passSeries: normalized.slice(0, 4) || "0000",
    passNum: normalized.slice(4) || "000000"
  };
}

function chooseLatestVerificationRow(rows: ContractSignatureRecordLike[]): ContractSignatureRecordLike | null {
  if (rows.length === 0) return null;
  const sorted = rows
    .slice()
    .sort((a, b) => {
      const aMeta = safeParseContractMeta(a.contract);
      const bMeta = safeParseContractMeta(b.contract);
      const aTime = new Date(aMeta.signedAt ?? aMeta.updatedAt ?? aMeta.createdAt ?? 0).getTime();
      const bTime = new Date(bMeta.signedAt ?? bMeta.updatedAt ?? bMeta.createdAt ?? 0).getTime();
      return bTime - aTime;
    });
  return sorted[0] ?? null;
}

async function readStore(): Promise<ContractSignatureListItem[]> {
  assertLocalVerificationStoreAvailable();
  try {
    const raw = await readFile(storeFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ContractSignatureListItem[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeStore(records: ContractSignatureListItem[]): Promise<void> {
  assertLocalVerificationStoreAvailable();
  await mkdir(storeDir, { recursive: true });
  await writeFile(storeFile, JSON.stringify(records, null, 2), "utf8");
}

async function uploadSignaturePng(params: {
  userId: string;
  signatureDataUrl: string;
}): Promise<{ signatureImageUrl: string }> {
  const dataUrl = params.signatureDataUrl.trim();
  if (!isDataUrlPng(dataUrl)) {
    throw new Error("Некорректный формат подписи. Ожидается PNG.");
  }

  const base64Part = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Buffer.from(base64Part, "base64");
  if (bytes.length < 250) {
    throw new Error("Пустая подпись. Поставьте подпись и повторите отправку.");
  }

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
  const key = `contracts/signatures/${params.userId}/${Date.now()}-${hash}.png`;
  const uploaded = await uploadObjectToStorage({
    key,
    contentType: "image/png",
    body: bytes
  });
  return { signatureImageUrl: uploaded.url.trim() };
}

function toListItem(row: ContractSignatureRecordLike): ContractSignatureListItem {
  const contractMeta = safeParseContractMeta(row.contract);
  const fallbackBirthDate = toIsoString(row.birthDate);
  const fallbackPassportNumber = `${row.passSeries ?? ""} ${row.passNum ?? ""}`.trim();
  const fullName =
    contractMeta.fullName?.trim() ||
    [row.lastName, row.firstName, row.middleName].filter(Boolean).join(" ").trim() ||
    "—";
  const signatureImageUrl =
    contractMeta.signatureImageUrl?.trim() || LEGACY_SIGNATURE_PLACEHOLDER_DATA_URL;
  const signedAt =
    contractMeta.signedAt ??
    contractMeta.updatedAt ??
    contractMeta.createdAt ??
    toIsoString(row.getDate) ??
    new Date(0).toISOString();
  const status = normalizeContractStatusValue(row.status);
  const rejectionReason = normalizeNullable(row.rejectReason ?? contractMeta.rejectionReason);

  return {
    id: row.id,
    userId: row.userId,
    userEmail: row.user?.email ?? "",
    userName: row.user?.name ?? null,
    contractVersion: contractMeta.contractVersion ?? CONTRACT_VERSION,
    contractFileName: contractMeta.contractFileName ?? CONTRACT_FILE_NAME,
    contractFileUrl: contractMeta.contractFileUrl ?? CONTRACT_FILE_URL,
    signatureImageUrl,
    signedAt,
    ipAddress: normalizeNullable(contractMeta.ipAddress),
    userAgent: normalizeNullable(contractMeta.userAgent),
    status,
    rejectionReason,
    approvedAt: normalizeNullable(contractMeta.approvedAt),
    approvedByAdminId: normalizeNullable(contractMeta.approvedByAdminId),
    rejectedAt: normalizeNullable(contractMeta.rejectedAt),
    rejectedByAdminId: normalizeNullable(contractMeta.rejectedByAdminId),
    createdAt: contractMeta.createdAt ?? signedAt,
    updatedAt: contractMeta.updatedAt ?? signedAt,
    fullName,
    birthDate: contractMeta.birthDate ?? fallbackBirthDate,
    passportNumber: contractMeta.passportNumber ?? fallbackPassportNumber,
    passportIssuedBy: contractMeta.passportIssuedBy ?? normalizeNullable(row.givenBy),
    passportCode: contractMeta.passportCode ?? normalizeNullable(row.subunitCode),
    passportIssueDate: contractMeta.passportIssueDate ?? toIsoString(row.getDate),
    address: contractMeta.address ?? normalizeNullable(row.registrationAddress),
    ogrnip: contractMeta.ogrnip ?? null,
    inn: contractMeta.inn ?? null,
    snils: contractMeta.snils ?? null
  };
}

function findLatestUserVerification(
  records: ContractSignatureListItem[],
  userId: string
): ContractSignatureListItem | null {
  const items = records
    .filter((item) => item.userId === userId)
    .slice()
    .sort((a, b) => {
      const timeA = new Date(a.signedAt || a.createdAt).getTime();
      const timeB = new Date(b.signedAt || b.createdAt).getTime();
      return timeB - timeA;
    });
  return items[0] ?? null;
}

function buildVerificationReason(
  status: ContractSignatureStatus,
  item: ContractSignatureListItem | null
): string {
  if (status === "approved") return "Вы можете выпускать релизы.";
  if (status === "pending") {
    return "Договор подписан и ожидает проверки администратором.";
  }
  if (status === "rejected") {
    const rejectionKind =
      item?.approvedAt || item?.approvedByAdminId ? "cancelled" : "rejected";
    if (rejectionKind === "cancelled") {
      return item?.rejectionReason?.trim()
        ? `Договор отменён администратором: ${item.rejectionReason.trim()}`
        : "Договор отменён администратором. Пройдите верификацию заново.";
    }
    return item?.rejectionReason?.trim()
      ? `Верификация отклонена: ${item.rejectionReason.trim()}`
      : "Верификация отклонена. Пройдите её заново.";
  }
  if (status === "invalid_signature") {
    return "После переноса данных подпись не найдена. Подпишите договор заново.";
  }
  return "Для выпуска релизов необходимо пройти верификацию и подписать договор.";
}

function getEffectiveVerificationStatus(item: ContractSignatureListItem | null): ContractSignatureStatus {
  if (!item) return "not_signed";
  if (item.status === "rejected") return "rejected";
  if (item.status === "approved" || item.status === "pending") {
    return isVerificationSignatureUnavailable(item.signatureImageUrl)
      ? "invalid_signature"
      : item.status;
  }
  return "not_signed";
}

function toContractStatusPayload(item: ContractSignatureListItem | null): ContractStatusPayload {
  const status = getEffectiveVerificationStatus(item);
  const rejectionKind =
    status === "rejected"
      ? item?.approvedAt || item?.approvedByAdminId
        ? "cancelled"
        : "rejected"
      : null;
  if (!item) {
    return {
      status,
      signed: false,
      isVerified: false,
      canSubmitReleases: false,
      canCreateRelease: false,
      signedAt: null,
      contractVersion: null,
      reason: buildVerificationReason(status, item),
      rejectionReason: null,
      rejectionKind,
      verificationId: null
    };
  }

  const signed = status === "pending" || status === "approved";
  return {
    status,
    signed,
    isVerified: status === "approved",
    canSubmitReleases: status === "approved",
    canCreateRelease: status === "approved",
    signedAt: item.signedAt,
    contractVersion: item.contractVersion,
    reason: buildVerificationReason(status, item),
    rejectionReason: item.rejectionReason,
    rejectionKind,
    verificationId: item.id
  };
}

function isSchemaUnavailableError(error: unknown): boolean {
  return (
    isPrismaTableMissingError(error, "verification") ||
    (error instanceof Error &&
      /verification|cannot read properties of undefined/i.test(
        error.message
      ))
  );
}

function buildVerificationRejectedMessage(reason: string): string {
  return `Верификация отклонена: ${reason}`;
}

function buildSignatureFileName(item: ContractSignatureListItem): string {
  const date = item.signedAt.slice(0, 10) || "unknown-date";
  return `signature-${item.userId}-${date}.png`;
}

function buildContractFileName(item: ContractSignatureListItem): string {
  const safe = item.contractFileName?.trim();
  return safe || `contract-${item.userId}.pdf`;
}

function decodeDataUrlImage(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([a-zA-Z0-9+/=\s]+)$/u.exec(dataUrl.trim());
  if (!match?.[1]) return null;
  return Buffer.from(match[1], "base64");
}

function decodeLegacyLocalSignatureUrl(rawValue: string): Buffer | null {
  if (!rawValue.startsWith("local://contract-signature/")) return null;
  return Buffer.from(LEGACY_SIGNATURE_PLACEHOLDER_PNG, "base64");
}

function extractStorageLocationFromUrl(rawUrl: string): { bucket: string | null; key: string | null } {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.replace(/^\/+/u, "");
    const bucketCandidates = Array.from(
      new Set([getStorageBucketHint(), ...getStorageBucketCandidates()].filter(Boolean))
    );
    for (const bucket of bucketCandidates) {
      if (pathname.startsWith(`${bucket}/`)) {
        return {
          bucket,
          key: pathname.slice(bucket.length + 1) || null
        };
      }
    }
    for (const bucket of bucketCandidates) {
      if (url.hostname.startsWith(`${bucket}.`)) {
        return {
          bucket,
          key: pathname || null
        };
      }
    }
    return { bucket: null, key: pathname || null };
  } catch {
    return { bucket: null, key: null };
  }
}

export function validateContractSignerData(input: ContractSignerFormData): ContractSignerValidationIssue[] {
  const data = normalizeSignerData(input);
  const issues: ContractSignerValidationIssue[] = [];

  if (!data.fullName || !fullNameWordsPattern.test(data.fullName)) {
    issues.push({ field: "fullName", message: "Укажите ФИО (минимум имя и фамилия)." });
  }

  if (!data.birthDate) {
    issues.push({ field: "birthDate", message: "Укажите дату рождения." });
  }

  if (!data.passportNumber) {
    issues.push({ field: "passportNumber", message: "Укажите паспорт." });
  } else if (!passportNumberPattern.test(data.passportNumber)) {
    issues.push({ field: "passportNumber", message: "Паспорт должен быть в формате XXXX XXXXXX." });
  }

  if (!data.passportIssuedBy) {
    issues.push({ field: "passportIssuedBy", message: "Укажите, кем выдан паспорт." });
  }

  if (!data.passportCode) {
    issues.push({ field: "passportCode", message: "Укажите код подразделения." });
  }

  if (!data.passportIssueDate) {
    issues.push({ field: "passportIssueDate", message: "Укажите дату выдачи паспорта." });
  }

  if (!data.address) {
    issues.push({ field: "address", message: "Укажите адрес регистрации." });
  }

  if (data.inn && !innPattern.test(data.inn)) {
    issues.push({ field: "inn", message: "ИНН должен содержать 10 или 12 цифр." });
  }

  if (data.snils && !snilsPattern.test(data.snils)) {
    issues.push({ field: "snils", message: "СНИЛС должен быть в формате XXX-XXX-XXX XX." });
  }

  if (!data.confirmationAccepted) {
    issues.push({
      field: "confirmationAccepted",
      message: "Подтвердите согласие с условиями договора."
    });
  }

  return issues;
}

export async function getUserContractStatus(params: {
  prisma: PrismaClient;
  userId: string;
}): Promise<ContractStatusPayload> {
  const model = getModel(params.prisma);
  if (!model) {
    const records = await readStore();
    return toContractStatusPayload(findLatestUserVerification(records, params.userId));
  }

  try {
    const rows = (await model.findMany({
      where: { userId: params.userId },
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        }
      }
    })) as ContractSignatureRecordLike[];

    const row = chooseLatestVerificationRow(rows);

    return toContractStatusPayload(row ? toListItem(row) : null);
  } catch (error) {
    if (isSchemaUnavailableError(error)) {
      const records = await readStore();
      return toContractStatusPayload(findLatestUserVerification(records, params.userId));
    }
    throw error;
  }
}

export async function hasSignedContract(params: {
  prisma: PrismaClient;
  userId: string;
}): Promise<boolean> {
  const status = await getUserContractStatus(params);
  return status.signed;
}

export async function createContractSignature(
  params: CreateContractSignatureParams
): Promise<ContractStatusPayload> {
  const notify = params.notify ?? notifyAdminContractSigned;
  const logger = params.logger ?? console;
  const signerData = normalizeSignerData(params.signerData);
  const issues = validateContractSignerData(signerData);
  if (issues.length > 0) {
    throw new Error(issues[0]?.message ?? "Проверьте корректность заполнения данных договора.");
  }

  const current = await getUserContractStatus({
    prisma: params.prisma,
    userId: params.userId
  });
  if (current.status === "approved" || current.status === "pending") {
    return current;
  }

  const { signatureImageUrl } = await uploadSignaturePng({
    userId: params.userId,
    signatureDataUrl: params.signatureImage
  });

  const now = new Date();
  const nowIso = now.toISOString();
  const normalizedIp = normalizeNullable(params.ipAddress);
  const normalizedUserAgent = normalizeNullable(params.userAgent);
  const fullNameParts = splitFullName(signerData.fullName);
  const passportParts = splitPassportNumber(signerData.passportNumber);
  const contractMeta: VerificationContractMeta = {
    contractVersion: params.contractVersion,
    contractFileName: CONTRACT_FILE_NAME,
    contractFileUrl: CONTRACT_FILE_URL,
    signatureImageUrl,
    signedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
    ipAddress: normalizedIp,
    userAgent: normalizedUserAgent,
    approvedAt: null,
    approvedByAdminId: null,
    rejectedAt: null,
    rejectedByAdminId: null,
    rejectionReason: null,
    fullName: signerData.fullName,
    birthDate: signerData.birthDate ?? null,
    passportNumber: signerData.passportNumber ?? null,
    passportIssuedBy: signerData.passportIssuedBy ?? null,
    passportCode: signerData.passportCode ?? null,
    passportIssueDate: signerData.passportIssueDate ?? null,
    address: signerData.address ?? null,
    ogrnip: signerData.ogrnip ?? null,
    inn: signerData.inn ?? null,
    snils: signerData.snils ?? null
  };

  const listItemBase = {
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    contractVersion: params.contractVersion,
    contractFileName: CONTRACT_FILE_NAME,
    contractFileUrl: CONTRACT_FILE_URL,
    signatureImageUrl,
    signedAt: now,
    ipAddress: normalizedIp,
    userAgent: normalizedUserAgent,
    status: "PENDING" as const,
    rejectionReason: null,
    approvedAt: null,
    approvedByAdminId: null,
    rejectedAt: null,
    rejectedByAdminId: null,
    fullName: signerData.fullName,
    birthDate: signerData.birthDate ?? null,
    passportNumber: signerData.passportNumber ?? null,
    passportIssuedBy: signerData.passportIssuedBy ?? null,
    passportCode: signerData.passportCode ?? null,
    passportIssueDate: signerData.passportIssueDate ?? null,
    address: signerData.address ?? null,
    ogrnip: signerData.ogrnip ?? null,
    inn: signerData.inn ?? null,
    snils: signerData.snils ?? null
  };
  const dbRecordBase = {
    userId: params.userId,
    firstName: fullNameParts.firstName,
    middleName: fullNameParts.middleName,
    lastName: fullNameParts.lastName,
    birthDate: signerData.birthDate ? new Date(signerData.birthDate) : now,
    birthPlace: "Не указано",
    tel: "Не указано",
    passSeries: passportParts.passSeries,
    passNum: passportParts.passNum,
    getDate: signerData.passportIssueDate ? new Date(signerData.passportIssueDate) : now,
    givenBy: signerData.passportIssuedBy ?? "Не указано",
    subunitCode: signerData.passportCode ?? "Не указано",
    registrationAddress: signerData.address ?? "Не указано",
    accountNumber: "Не указано",
    bankName: "Не указано",
    status: toDbStatus("pending"),
    rejectReason: null,
    contract: toVerificationContractMetaString(contractMeta)
  };

  const model = getModel(params.prisma);
  if (!model) {
    const records = await readStore();
    const record: ContractSignatureListItem = {
      id: `contract_${Date.now()}`,
      ...listItemBase,
      signedAt: nowIso,
      status: "pending",
      createdAt: nowIso,
      updatedAt: nowIso
    };
    records.unshift(record);
    await writeStore(records);
    try {
      await notify({
        userId: params.userId,
        userName: params.userName,
        userEmail: params.userEmail
      });
    } catch (error) {
      logger.error("[verification] telegram notification failed", error);
    }
    return toContractStatusPayload(record);
  }

  try {
    const existingRows = (await model.findMany({
      where: { userId: params.userId },
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        }
      }
    })) as ContractSignatureRecordLike[];
    const existing = chooseLatestVerificationRow(existingRows);

    const created = (existing
      ? await model.update({
          where: { id: existing.id },
          data: dbRecordBase,
          include: {
            user: {
              select: {
                email: true,
                name: true
              }
            }
          }
        })
      : await model.create({
          data: dbRecordBase,
          include: {
            user: {
              select: {
                email: true,
                name: true
              }
            }
          }
        })) as ContractSignatureRecordLike;
    try {
      await notify({
        userId: params.userId,
        userName: params.userName,
        userEmail: params.userEmail
      });
    } catch (error) {
      logger.error("[verification] telegram notification failed", error);
    }
    return toContractStatusPayload(toListItem(created));
  } catch (error) {
    if (!isSchemaUnavailableError(error)) throw error;

    const records = await readStore();
    const nowIso = now.toISOString();
    const record: ContractSignatureListItem = {
      id: `contract_${Date.now()}`,
      ...listItemBase,
      signedAt: nowIso,
      status: "pending",
      createdAt: nowIso,
      updatedAt: nowIso
    };
    records.unshift(record);
    await writeStore(records);
    try {
      await notify({
        userId: params.userId,
        userName: params.userName,
        userEmail: params.userEmail
      });
    } catch (notifyError) {
      logger.error("[verification] telegram notification failed", notifyError);
    }
    return toContractStatusPayload(record);
  }
}

export async function listContractSignaturesForAdmin(params: {
  prisma: PrismaClient;
}): Promise<ContractSignatureListItem[]> {
  const dedupeLatestPerUser = (items: ContractSignatureListItem[]) => {
    const latestByUser = new Map<string, ContractSignatureListItem>();

    for (const item of items) {
      const current = latestByUser.get(item.userId);
      if (!current) {
        latestByUser.set(item.userId, item);
        continue;
      }

      const currentTime = new Date(current.signedAt || current.createdAt).getTime();
      const nextTime = new Date(item.signedAt || item.createdAt).getTime();
      if (nextTime > currentTime) {
        latestByUser.set(item.userId, item);
      }
    }

    return [...latestByUser.values()].sort(
      (a, b) => new Date(b.signedAt || b.createdAt).getTime() - new Date(a.signedAt || a.createdAt).getTime()
    );
  };

  const model = getModel(params.prisma);
  if (!model) {
    const records = await readStore();
    return dedupeLatestPerUser(records);
  }

  try {
    const rows = (await model.findMany({
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        }
      }
    })) as ContractSignatureRecordLike[];
    return dedupeLatestPerUser(rows.map(toListItem));
  } catch (error) {
    if (isSchemaUnavailableError(error)) {
      const records = await readStore();
      return dedupeLatestPerUser(records);
    }
    throw error;
  }
}

export async function getContractSignatureById(params: {
  prisma: PrismaClient;
  id: string;
}): Promise<ContractSignatureListItem | null> {
  const model = getModel(params.prisma);
  if (!model) {
    const records = await readStore();
    return records.find((item) => item.id === params.id) ?? null;
  }

  try {
    const row = (await model.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            email: true,
            name: true
          }
        }
      }
    })) as ContractSignatureRecordLike | null;
    return row ? toListItem(row) : null;
  } catch (error) {
    if (isSchemaUnavailableError(error)) {
      const records = await readStore();
      return records.find((item) => item.id === params.id) ?? null;
    }
    throw error;
  }
}

async function movePendingVerificationReleasesToModeration(params: {
  prismaLike: ReleaseMutationLike;
  userId: string;
  now: Date;
}): Promise<string[]> {
  const releaseModel = params.prismaLike.release;
  const pending = await releaseModel.findMany({
    where: {
      userId: params.userId,
      status: RELEASE_STATUS_PENDING_VERIFICATION
    },
    select: { id: true }
  });

  const ids = pending.map((item: { id: string }) => item.id);
  if (ids.length === 0) return [];

  await releaseModel.updateMany({
    where: { id: { in: ids } },
    data: {
      status: RELEASE_STATUS_MODERATION,
      moderatorComment: null,
      rejectReason: null
    }
  });

  return ids;
}

async function movePendingVerificationReleasesToChangesRequired(params: {
  prismaLike: ReleaseMutationLike;
  userId: string;
  adminId: string;
  reason: string;
  now: Date;
}): Promise<string[]> {
  const releaseModel = params.prismaLike.release;
  const pending = await releaseModel.findMany({
    where: {
      userId: params.userId,
      status: RELEASE_STATUS_PENDING_VERIFICATION
    },
    select: { id: true }
  });

  const ids = pending.map((item: { id: string }) => item.id);
  if (ids.length === 0) return [];

  const rejectionMessage = buildVerificationRejectedMessage(params.reason);
  await releaseModel.updateMany({
    where: { id: { in: ids } },
    data: {
      status: RELEASE_STATUS_CHANGES_REQUIRED,
      moderatorComment: rejectionMessage,
      rejectReason: rejectionMessage
    }
  });

  return ids;
}

async function approveContractSignatureWithStoreFallback(params: {
  prisma: PrismaClient;
  verificationId: string;
  adminId: string;
  now: Date;
}): Promise<VerificationReviewResult> {
  const records = await readStore();
  const index = records.findIndex((item) => item.id === params.verificationId);
  if (index < 0) {
    return { ok: false, error: "Verification not found" };
  }

  const current = records[index]!;
  if (current.status !== "pending") {
    return { ok: false, error: "STATUS_TRANSITION_NOT_ALLOWED" };
  }

  const movedReleaseIds = await movePendingVerificationReleasesToModeration({
    prismaLike: params.prisma,
    userId: current.userId,
    now: params.now
  });

  records[index] = {
    ...current,
    status: "approved",
    rejectionReason: null,
    approvedAt: params.now.toISOString(),
    approvedByAdminId: params.adminId,
    rejectedAt: null,
    rejectedByAdminId: null,
    updatedAt: params.now.toISOString()
  };
  await writeStore(records);

  try {
    await notifyMovedReleasesNowOnModeration({
      prisma: params.prisma,
      releaseIds: movedReleaseIds
    });
  } catch (error) {
    console.error("[verification] telegram notification failed", error);
  }

  return {
    ok: true,
    verificationId: current.id,
    movedReleaseIds
  };
}

interface VerificationAdminRow {
  id: string;
  userId: string;
  status: string;
  contract: string;
  rejectReason: string | null;
}

async function getVerificationRowByIdRaw(params: {
  prisma: PrismaClient;
  verificationId: string;
}): Promise<VerificationAdminRow | null> {
  const rows = (await params.prisma.$queryRawUnsafe(
    `SELECT id, "userId", status::text AS status, contract, "rejectReason"
       FROM icecream.verification
      WHERE id = $1
      LIMIT 1`,
    params.verificationId
  )) as VerificationAdminRow[];
  return rows[0] ?? null;
}

async function approveContractSignatureWithVerificationTableFallback(params: {
  prisma: PrismaClient;
  verificationId: string;
  adminId: string;
  now: Date;
}): Promise<VerificationReviewResult> {
  return params.prisma.$transaction(async (tx) => {
    const current = await getVerificationRowByIdRaw({
      prisma: tx as unknown as PrismaClient,
      verificationId: params.verificationId
    });
    if (!current) {
      return { ok: false, error: "Verification not found" } as VerificationReviewResult;
    }

    if (normalizeContractStatusValue(current.status) !== "pending") {
      return { ok: false, error: "STATUS_TRANSITION_NOT_ALLOWED" } as VerificationReviewResult;
    }

    const currentMeta = safeParseContractMeta(current.contract);
    const nextContract = toVerificationContractMetaString({
      ...currentMeta,
      updatedAt: params.now.toISOString(),
      approvedAt: params.now.toISOString(),
      approvedByAdminId: params.adminId,
      rejectedAt: null,
      rejectedByAdminId: null,
      rejectionReason: null
    });

    await (tx as unknown as PrismaClient).$executeRawUnsafe(
      `UPDATE icecream.verification
          SET status = $1::icecream.verification_status,
              "rejectReason" = NULL,
              contract = $2
        WHERE id = $3`,
      toDbStatus("approved"),
      nextContract,
      params.verificationId
    );

    const movedReleaseIds = await movePendingVerificationReleasesToModeration({
      prismaLike: tx as unknown as PrismaClient,
      userId: current.userId,
      now: params.now
    });

    await tx.adminLog.create({
      data: {
        id: randomUUID(),
        adminId: params.adminId,
        action: "CONTRACT_VERIFICATION_APPROVED",
        targetType: "UserContractSignature",
        targetId: params.verificationId,
        payload: {
          userId: current.userId,
          movedReleaseIds
        }
      }
    });

    return {
      ok: true,
      verificationId: params.verificationId,
      movedReleaseIds
    } satisfies VerificationReviewResult;
  });
}

export async function approveContractSignatureByAdmin(params: {
  prisma: PrismaClient;
  verificationId: string;
  adminId: string;
}): Promise<VerificationReviewResult> {
  const now = new Date();
  const model = getModel(params.prisma);

  if (!model) {
    return approveContractSignatureWithVerificationTableFallback({
      ...params,
      now
    });
  }

  try {
    const result = await params.prisma.$transaction(async (tx) => {
      const current = (await tx.verification.findUnique({
        where: { id: params.verificationId },
        include: {
          user: {
            select: {
              email: true,
              name: true
            }
          }
        }
      })) as ContractSignatureRecordLike | null;

      if (!current) {
        return { ok: false, error: "Verification not found" } as VerificationReviewResult;
      }
      if (normalizeContractStatusValue(current.status) !== "pending") {
        return { ok: false, error: "STATUS_TRANSITION_NOT_ALLOWED" } as VerificationReviewResult;
      }

      const currentMeta = safeParseContractMeta(current.contract);
      await tx.verification.update({
        where: { id: params.verificationId },
        data: {
          status: toDbStatus("approved"),
          rejectReason: null,
          contract: toVerificationContractMetaString({
            ...currentMeta,
            updatedAt: now.toISOString(),
            approvedAt: now.toISOString(),
            approvedByAdminId: params.adminId,
            rejectedAt: null,
            rejectedByAdminId: null,
            rejectionReason: null
          })
        }
      });

      const movedReleaseIds = await movePendingVerificationReleasesToModeration({
        prismaLike: tx as unknown as PrismaClient,
        userId: current.userId,
        now
      });

      await tx.adminLog.create({
        data: {
          id: randomUUID(),
          adminId: params.adminId,
          action: "CONTRACT_VERIFICATION_APPROVED",
          targetType: "UserContractSignature",
          targetId: params.verificationId,
          payload: {
            userId: current.userId,
            movedReleaseIds
          }
        }
      });

      return {
        ok: true,
        verificationId: params.verificationId,
        movedReleaseIds
      } satisfies VerificationReviewResult;
    });

    if (result.ok) {
      try {
        await notifyMovedReleasesNowOnModeration({
          prisma: params.prisma,
          releaseIds: result.movedReleaseIds ?? []
        });
      } catch (error) {
        console.error("[verification] telegram notification failed", error);
      }
    }

    return result;
  } catch (error) {
    if (isSchemaUnavailableError(error)) {
      return approveContractSignatureWithVerificationTableFallback({
        ...params,
        now
      });
    }
    throw error;
  }
}

async function rejectContractSignatureWithStoreFallback(params: {
  prisma: PrismaClient;
  verificationId: string;
  adminId: string;
  reason: string;
  now: Date;
}): Promise<VerificationReviewResult> {
  const records = await readStore();
  const index = records.findIndex((item) => item.id === params.verificationId);
  if (index < 0) {
    return { ok: false, error: "Verification not found" };
  }

  const current = records[index]!;
  if (current.status !== "pending" && current.status !== "approved") {
    return { ok: false, error: "STATUS_TRANSITION_NOT_ALLOWED" };
  }

  const movedReleaseIds = await movePendingVerificationReleasesToChangesRequired({
    prismaLike: params.prisma,
    userId: current.userId,
    adminId: params.adminId,
    reason: params.reason,
    now: params.now
  });

  records[index] = {
    ...current,
    status: "rejected",
    rejectionReason: params.reason,
    approvedAt: current.approvedAt,
    approvedByAdminId: current.approvedByAdminId,
    rejectedAt: params.now.toISOString(),
    rejectedByAdminId: params.adminId,
    updatedAt: params.now.toISOString()
  };
  await writeStore(records);

  return {
    ok: true,
    verificationId: current.id,
    movedReleaseIds
  };
}

async function rejectContractSignatureWithVerificationTableFallback(params: {
  prisma: PrismaClient;
  verificationId: string;
  adminId: string;
  reason: string;
  now: Date;
}): Promise<VerificationReviewResult> {
  return params.prisma.$transaction(async (tx) => {
    const current = await getVerificationRowByIdRaw({
      prisma: tx as unknown as PrismaClient,
      verificationId: params.verificationId
    });
    if (!current) {
      return { ok: false, error: "Verification not found" } as VerificationReviewResult;
    }

    const currentStatus = normalizeContractStatusValue(current.status);
    if (currentStatus !== "pending" && currentStatus !== "approved") {
      return { ok: false, error: "STATUS_TRANSITION_NOT_ALLOWED" } as VerificationReviewResult;
    }

    const currentMeta = safeParseContractMeta(current.contract);
    const nextContract = toVerificationContractMetaString({
      ...currentMeta,
      updatedAt: params.now.toISOString(),
      rejectionReason: params.reason,
      approvedAt:
        currentStatus === "approved"
          ? currentMeta.approvedAt ?? params.now.toISOString()
          : null,
      approvedByAdminId:
        currentStatus === "approved"
          ? currentMeta.approvedByAdminId ?? params.adminId
          : null,
      rejectedAt: params.now.toISOString(),
      rejectedByAdminId: params.adminId
    });

    await (tx as unknown as PrismaClient).$executeRawUnsafe(
      `UPDATE icecream.verification
          SET status = $1::icecream.verification_status,
              "rejectReason" = $2,
              contract = $3
        WHERE id = $4`,
      toDbStatus("rejected"),
      params.reason,
      nextContract,
      params.verificationId
    );

    const movedReleaseIds = await movePendingVerificationReleasesToChangesRequired({
      prismaLike: tx as unknown as PrismaClient,
      userId: current.userId,
      adminId: params.adminId,
      reason: params.reason,
      now: params.now
    });

    await tx.adminLog.create({
      data: {
        id: randomUUID(),
        adminId: params.adminId,
        action:
          currentStatus === "approved"
            ? "CONTRACT_VERIFICATION_CANCELLED"
            : "CONTRACT_VERIFICATION_REJECTED",
        targetType: "UserContractSignature",
        targetId: params.verificationId,
        payload: {
          userId: current.userId,
          reason: params.reason,
          movedReleaseIds
        }
      }
    });

    return {
      ok: true,
      verificationId: params.verificationId,
      movedReleaseIds
    } satisfies VerificationReviewResult;
  });
}

export async function rejectContractSignatureByAdmin(params: {
  prisma: PrismaClient;
  verificationId: string;
  adminId: string;
  reason: string;
}): Promise<VerificationReviewResult> {
  const reason = params.reason.trim();
  if (reason.length < 3) {
    return { ok: false, error: "Причина отклонения обязательна." };
  }

  const now = new Date();
  const model = getModel(params.prisma);

  if (!model) {
    return rejectContractSignatureWithVerificationTableFallback({
      ...params,
      reason,
      now
    });
  }

  try {
    return await params.prisma.$transaction(async (tx) => {
      const current = (await tx.verification.findUnique({
        where: { id: params.verificationId },
        include: {
          user: {
            select: {
              email: true,
              name: true
            }
          }
        }
      })) as ContractSignatureRecordLike | null;

      if (!current) {
        return { ok: false, error: "Verification not found" } as VerificationReviewResult;
      }
      const currentStatus = normalizeContractStatusValue(current.status);
      if (currentStatus !== "pending" && currentStatus !== "approved") {
        return { ok: false, error: "STATUS_TRANSITION_NOT_ALLOWED" } as VerificationReviewResult;
      }

      const currentMeta = safeParseContractMeta(current.contract);
      await tx.verification.update({
        where: { id: params.verificationId },
        data: {
          status: toDbStatus("rejected"),
          rejectReason: reason,
          contract: toVerificationContractMetaString({
            ...currentMeta,
            updatedAt: now.toISOString(),
            rejectionReason: reason,
            approvedAt:
              currentStatus === "approved"
                ? currentMeta.approvedAt ?? now.toISOString()
                : null,
            approvedByAdminId:
              currentStatus === "approved"
                ? currentMeta.approvedByAdminId ?? params.adminId
                : null,
            rejectedAt: now.toISOString(),
            rejectedByAdminId: params.adminId
          })
        }
      });

      const movedReleaseIds = await movePendingVerificationReleasesToChangesRequired({
        prismaLike: tx as unknown as PrismaClient,
        userId: current.userId,
        adminId: params.adminId,
        reason,
        now
      });

      await tx.adminLog.create({
        data: {
          id: randomUUID(),
          adminId: params.adminId,
          action:
            currentStatus === "approved"
              ? "CONTRACT_VERIFICATION_CANCELLED"
              : "CONTRACT_VERIFICATION_REJECTED",
          targetType: "UserContractSignature",
          targetId: params.verificationId,
          payload: {
            userId: current.userId,
            reason,
            movedReleaseIds
          }
        }
      });

      return {
        ok: true,
        verificationId: params.verificationId,
        movedReleaseIds
      } satisfies VerificationReviewResult;
    });
  } catch (error) {
    if (isSchemaUnavailableError(error)) {
      return rejectContractSignatureWithVerificationTableFallback({
        ...params,
        reason,
        now
      });
    }
    throw error;
  }
}

export async function getContractSignatureDownloadAsset(params: {
  prisma: PrismaClient;
  id: string;
  inline?: boolean;
}): Promise<VerificationDownloadAsset | null> {
  const item = await getContractSignatureById(params);
  if (!item) return null;

  if (item.signatureImageUrl.startsWith("data:image/png;base64,")) {
    const body = decodeDataUrlImage(item.signatureImageUrl);
    if (!body) return null;
    return {
      contentType: "image/png",
      fileName: buildSignatureFileName(item),
      body
    };
  }

  const legacyBody = decodeLegacyLocalSignatureUrl(item.signatureImageUrl);
  if (legacyBody) return null;

  const storageLocation = extractStorageLocationFromUrl(item.signatureImageUrl);
  if (storageLocation.key) {
    const disposition = `${params.inline ? "inline" : "attachment"}; filename="${buildSignatureFileName(item)}"`;
    const signed = await createPresignedDownload({
      key: storageLocation.key,
      bucket: storageLocation.bucket ?? undefined,
      expiresIn: 600,
      responseContentDisposition: disposition,
      responseContentType: "image/png"
    });
    return {
      contentType: "image/png",
      fileName: buildSignatureFileName(item),
      redirectUrl: signed.url
    };
  }

  if (/^https?:\/\//u.test(item.signatureImageUrl)) {
    return {
      contentType: "image/png",
      fileName: buildSignatureFileName(item),
      redirectUrl: item.signatureImageUrl
    };
  }

  return null;
}

export async function getContractDocumentDownloadAsset(params: {
  prisma: PrismaClient;
  id: string;
}): Promise<VerificationDownloadAsset | null> {
  const item = await getContractSignatureById(params);
  if (!item) return null;

  const filePath = path.join(process.cwd(), "public", "docs", path.basename(item.contractFileName));
  const body = await readFile(filePath);
  return {
    contentType: "application/pdf",
    fileName: buildContractFileName(item),
    body
  };
}

export async function getAdminVerificationCounts(params: {
  prisma: PrismaClient;
}): Promise<{
  verification_pending: number;
  releases_moderation: number;
  releases_pending_verification: number;
}> {
  const model = getModel(params.prisma);
  if (!model) {
    const records = await readStore();
    const verificationPending = records.filter((item) => item.status === "pending").length;
    const [releasesModeration, releasesPendingVerification] = await Promise.all([
      params.prisma.release.count({
        where: { status: RELEASE_STATUS_MODERATION }
      }),
      params.prisma.release.count({
        where: { status: RELEASE_STATUS_PENDING_VERIFICATION }
      })
    ]);
    return {
      verification_pending: verificationPending,
      releases_moderation: releasesModeration,
      releases_pending_verification: releasesPendingVerification
    };
  }

  try {
    const [verificationPending, releasesModeration, releasesPendingVerification] = await Promise.all([
      params.prisma.verification.count({
        where: { status: toDbStatus("pending") }
      }),
      params.prisma.release.count({
        where: { status: RELEASE_STATUS_MODERATION }
      }),
      params.prisma.release.count({
        where: { status: RELEASE_STATUS_PENDING_VERIFICATION }
      })
    ]);

    return {
      verification_pending: verificationPending,
      releases_moderation: releasesModeration,
      releases_pending_verification: releasesPendingVerification
    };
  } catch (error) {
    if (!isSchemaUnavailableError(error)) throw error;

    const records = await readStore();
    const verificationPending = records.filter((item) => item.status === "pending").length;
    const [releasesModeration, releasesPendingVerification] = await Promise.all([
      params.prisma.release.count({
        where: { status: RELEASE_STATUS_MODERATION }
      }),
      params.prisma.release.count({
        where: { status: RELEASE_STATUS_PENDING_VERIFICATION }
      })
    ]);
    return {
      verification_pending: verificationPending,
      releases_moderation: releasesModeration,
      releases_pending_verification: releasesPendingVerification
    };
  }
}

export { buildVerificationRejectedMessage };
