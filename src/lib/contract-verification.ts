import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ReleaseStatus, type PrismaClient } from "@prisma/client";

import { createPresignedDownload, createPresignedUpload } from "@/lib/s3";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import {
  notifyAdminContractSigned,
  notifyAdminReleaseSubmitted
} from "@/lib/telegram-notifier";
import {
  CONTRACT_FILE_NAME,
  CONTRACT_FILE_URL,
  type ContractSignerFormData,
  type ContractSignerValidationIssue,
  type ContractSignatureStatus,
  type ContractStatusPayload
} from "@/lib/contract-verification-shared";

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
  userEmail: string;
  userName: string | null;
  contractVersion: string;
  contractFileName: string;
  contractFileUrl: string;
  signatureImageUrl: string;
  signedAt: Date | string;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  rejectionReason: string | null;
  approvedAt: Date | string | null;
  approvedByAdminId: string | null;
  rejectedAt: Date | string | null;
  rejectedByAdminId: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
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

function toDbStatus(value: ContractSignatureStatus): "NOT_SIGNED" | "PENDING" | "APPROVED" | "REJECTED" {
  if (value === "pending") return "PENDING";
  if (value === "approved") return "APPROVED";
  if (value === "rejected") return "REJECTED";
  return "NOT_SIGNED";
}

function getModel(prisma: PrismaClient): ModelLike | null {
  const model = (prisma as unknown as { userContractSignature?: ModelLike }).userContractSignature;
  return model ?? null;
}

async function readStore(): Promise<ContractSignatureListItem[]> {
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

  const signed = await createPresignedUpload({ key, contentType: "image/png" });

  if (signed.mock || signed.url.startsWith("/")) {
    return { signatureImageUrl: dataUrl };
  }

  const uploadResponse = await fetch(signed.url, {
    method: signed.method ?? "PUT",
    headers: { "Content-Type": "image/png" },
    body: bytes
  });

  if (!uploadResponse.ok) {
    throw new Error("Не удалось загрузить подпись в хранилище.");
  }

  return { signatureImageUrl: (signed.url.split("?")[0] ?? signed.url).trim() };
}

function toListItem(row: ContractSignatureRecordLike): ContractSignatureListItem {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: row.userEmail,
    userName: row.userName,
    contractVersion: row.contractVersion,
    contractFileName: row.contractFileName,
    contractFileUrl: row.contractFileUrl,
    signatureImageUrl: row.signatureImageUrl,
    signedAt: toIsoString(row.signedAt) ?? new Date(0).toISOString(),
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    status: normalizeContractStatusValue(row.status),
    rejectionReason: normalizeNullable(row.rejectionReason),
    approvedAt: toIsoString(row.approvedAt),
    approvedByAdminId: normalizeNullable(row.approvedByAdminId),
    rejectedAt: toIsoString(row.rejectedAt),
    rejectedByAdminId: normalizeNullable(row.rejectedByAdminId),
    createdAt: toIsoString(row.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIsoString(row.updatedAt) ?? new Date(0).toISOString(),
    fullName: row.fullName,
    birthDate: row.birthDate,
    passportNumber: row.passportNumber,
    passportIssuedBy: row.passportIssuedBy,
    passportCode: row.passportCode,
    passportIssueDate: row.passportIssueDate,
    address: row.address,
    ogrnip: row.ogrnip,
    inn: row.inn,
    snils: row.snils
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
    isPrismaTableMissingError(error, "user_contract_signatures") ||
    (error instanceof Error &&
      /userContractSignature|cannot read properties of undefined|can't reach database server|econnrefused|timed out|connection refused/i.test(
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

function extractStorageKeyFromUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.replace(/^\/+/u, "");
    const bucket = process.env.S3_BUCKET?.trim();
    if (bucket && pathname.startsWith(`${bucket}/`)) {
      return pathname.slice(bucket.length + 1);
    }
    if (bucket && url.hostname.startsWith(`${bucket}.`)) {
      return pathname;
    }
    return pathname || null;
  } catch {
    return null;
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
    const row = (await model.findFirst({
      where: { userId: params.userId },
      orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }]
    })) as ContractSignatureRecordLike | null;

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
  const recordBase = {
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    contractVersion: params.contractVersion,
    contractFileName: CONTRACT_FILE_NAME,
    contractFileUrl: CONTRACT_FILE_URL,
    signatureImageUrl,
    signedAt: now,
    ipAddress: normalizeNullable(params.ipAddress),
    userAgent: normalizeNullable(params.userAgent),
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

  const model = getModel(params.prisma);
  if (!model) {
    const records = await readStore();
    const nowIso = now.toISOString();
    const record: ContractSignatureListItem = {
      id: `contract_${Date.now()}`,
      ...recordBase,
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
    const created = (await model.create({
      data: recordBase
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
      ...recordBase,
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
      orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }]
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
      where: { id: params.id }
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
      status: ReleaseStatus.PENDING_VERIFICATION
    },
    select: { id: true }
  });

  const ids = pending.map((item: { id: string }) => item.id);
  if (ids.length === 0) return [];

  await releaseModel.updateMany({
    where: { id: { in: ids } },
    data: {
      status: ReleaseStatus.MODERATION,
      moderationStartedAt: params.now,
      moderationCancelledAt: null,
      moderationReturnedAt: null,
      moderationComment: null,
      rejectionReason: null,
      rejectedAt: null,
      rejectedBy: null
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
      status: ReleaseStatus.PENDING_VERIFICATION
    },
    select: { id: true }
  });

  const ids = pending.map((item: { id: string }) => item.id);
  if (ids.length === 0) return [];

  const rejectionMessage = buildVerificationRejectedMessage(params.reason);
  await releaseModel.updateMany({
    where: { id: { in: ids } },
    data: {
      status: ReleaseStatus.CHANGES_REQUIRED,
      moderationComment: rejectionMessage,
      rejectionReason: rejectionMessage,
      moderationReturnedAt: params.now,
      rejectedAt: params.now,
      rejectedBy: params.adminId
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

export async function approveContractSignatureByAdmin(params: {
  prisma: PrismaClient;
  verificationId: string;
  adminId: string;
}): Promise<VerificationReviewResult> {
  const now = new Date();
  const model = getModel(params.prisma);

  if (!model) {
    return approveContractSignatureWithStoreFallback({
      ...params,
      now
    });
  }

  try {
    const result = await params.prisma.$transaction(async (tx) => {
      const current = (await tx.userContractSignature.findUnique({
        where: { id: params.verificationId }
      })) as ContractSignatureRecordLike | null;

      if (!current) {
        return { ok: false, error: "Verification not found" } as VerificationReviewResult;
      }
      if (normalizeContractStatusValue(current.status) !== "pending") {
        return { ok: false, error: "STATUS_TRANSITION_NOT_ALLOWED" } as VerificationReviewResult;
      }

      await tx.userContractSignature.update({
        where: { id: params.verificationId },
        data: {
          status: toDbStatus("approved"),
          rejectionReason: null,
          approvedAt: now,
          approvedByAdminId: params.adminId,
          rejectedAt: null,
          rejectedByAdminId: null
        }
      });

      const movedReleaseIds = await movePendingVerificationReleasesToModeration({
        prismaLike: tx as unknown as PrismaClient,
        userId: current.userId,
        now
      });

      await tx.adminLog.create({
        data: {
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
      return approveContractSignatureWithStoreFallback({
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
    return rejectContractSignatureWithStoreFallback({
      ...params,
      reason,
      now
    });
  }

  try {
    return await params.prisma.$transaction(async (tx) => {
      const current = (await tx.userContractSignature.findUnique({
        where: { id: params.verificationId }
      })) as ContractSignatureRecordLike | null;

      if (!current) {
        return { ok: false, error: "Verification not found" } as VerificationReviewResult;
      }
      const currentStatus = normalizeContractStatusValue(current.status);
      if (currentStatus !== "pending" && currentStatus !== "approved") {
        return { ok: false, error: "STATUS_TRANSITION_NOT_ALLOWED" } as VerificationReviewResult;
      }

      await tx.userContractSignature.update({
        where: { id: params.verificationId },
        data: {
          status: toDbStatus("rejected"),
          rejectionReason: reason,
          approvedAt:
            currentStatus === "approved" ? current.approvedAt ?? now : null,
          approvedByAdminId:
            currentStatus === "approved" ? current.approvedByAdminId : null,
          rejectedAt: now,
          rejectedByAdminId: params.adminId
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
      return rejectContractSignatureWithStoreFallback({
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

  const storageKey = extractStorageKeyFromUrl(item.signatureImageUrl);
  if (storageKey) {
    const disposition = `${params.inline ? "inline" : "attachment"}; filename="${buildSignatureFileName(item)}"`;
    const signed = await createPresignedDownload({
      key: storageKey,
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
        where: { status: ReleaseStatus.MODERATION }
      }),
      params.prisma.release.count({
        where: { status: ReleaseStatus.PENDING_VERIFICATION }
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
      params.prisma.userContractSignature.count({
        where: { status: toDbStatus("pending") }
      }),
      params.prisma.release.count({
        where: { status: ReleaseStatus.MODERATION }
      }),
      params.prisma.release.count({
        where: { status: ReleaseStatus.PENDING_VERIFICATION }
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
        where: { status: ReleaseStatus.MODERATION }
      }),
      params.prisma.release.count({
        where: { status: ReleaseStatus.PENDING_VERIFICATION }
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
