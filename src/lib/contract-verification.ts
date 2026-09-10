// @ts-nocheck
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { PrismaClient } from "@prisma/client";

import {
  createPresignedDownload,
  getStorageBucketCandidates,
  getStorageBucketHint,
  streamStoredObject,
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
import { sendVerificationDecisionEmail } from "@/lib/user-event-email";

const RELEASE_STATUS_PENDING_VERIFICATION = "pending_verification";
const RELEASE_STATUS_MODERATION = "moderating";
const RELEASE_STATUS_CHANGES_REQUIRED = "changes_required";

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isReleaseActuallyOnModeration(status: string, confirmed: boolean, roles: unknown): boolean {
  if (status != RELEASE_STATUS_MODERATION) return false;
  if (confirmed) return true;
  return isRecordLike(roles) && roles.submittedToModeration === true;
}

export interface ContractSignatureListItem {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  contractVersion: string;
  contractFileName: string;
  contractFileUrl: string;
  contractContentType: string;
  signedDocumentHash: string | null;
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
  contractContentType?: string;
  signedDocumentHash?: string;
  sourceContractFileName?: string;
  sourceContractFileUrl?: string;
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
  count?: (args: unknown) => Promise<number>;
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

async function createAdminVerificationLogSafe(params: {
  tx: unknown;
  adminId: string;
  action: string;
  verificationId: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const txObj = params.tx as {
    adminLog?: {
      create?: (args: unknown) => Promise<unknown>;
    };
  };
  const createFn = txObj.adminLog?.create;

  if (typeof createFn !== "function") {
    console.warn("[verification-admin-log-skip]", {
      verificationId: params.verificationId,
      action: params.action,
      reason: "adminLog delegate is unavailable"
    });
    return;
  }

  await createFn({
    data: {
      id: randomUUID(),
      adminId: params.adminId,
      action: params.action,
      targetType: "UserContractSignature",
      targetId: params.verificationId,
      payload: params.payload
    }
  });
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

const LEGACY_SIGNATURE_PLACEHOLDER_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";
const LEGACY_SIGNATURE_PLACEHOLDER_DATA_URL = `data:image/png;base64,${LEGACY_SIGNATURE_PLACEHOLDER_PNG}`;

const fullNameWordsPattern = /^\S+\s+\S+/u;
const passportNumberPattern = /^\d{4}\s\d{6}$/u;
const innPattern = /^(\d{10}|\d{12})$/u;
const snilsPattern = /^\d{3}-\d{3}-\d{3}\s\d{2}$/u;
function verificationStorageUnavailable(): Error {
  return new Error(
    "Верификация подписи временно недоступна. Настройте S3/MinIO и таблицу verification."
  );
}

function isVerificationStorageUnavailableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /Верификация подписи временно недоступна|S3\/MinIO|таблицу verification|upload is not configured/iu.test(
      error.message
    )
  );
}

function shouldBypassContractStorage(): boolean {
  return process.env.ICM_DISABLE_CONTRACT_STORAGE === "1";
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
  const delegates = prisma as unknown as {
    verification?: ModelLike;
    userContractSignature?: ModelLike;
  };
  return delegates.verification ?? delegates.userContractSignature ?? null;
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
      contractContentType:
        (parsed.contractContentType as string | undefined) ??
        (parsed.contract_content_type as string | undefined),
      signedDocumentHash:
        (parsed.signedDocumentHash as string | undefined) ??
        (parsed.signed_document_hash as string | undefined),
      sourceContractFileName:
        (parsed.sourceContractFileName as string | undefined) ??
        (parsed.source_contract_file_name as string | undefined),
      sourceContractFileUrl:
        (parsed.sourceContractFileUrl as string | undefined) ??
        (parsed.source_contract_file_url as string | undefined),
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
  throw verificationStorageUnavailable();
}

async function writeStore(_records: ContractSignatureListItem[]): Promise<void> {
  throw verificationStorageUnavailable();
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
  if (shouldBypassContractStorage()) {
    return { signatureImageUrl: dataUrl };
  }

  const key = `contracts/signatures/${params.userId}/${Date.now()}-${hash}.png`;
  try {
    const uploaded = await uploadObjectToStorage({
      key,
      contentType: "image/png",
      body: bytes
    });
    return { signatureImageUrl: uploaded.url.trim() };
  } catch (error) {
    if (isVerificationStorageUnavailableError(error)) {
      return { signatureImageUrl: dataUrl };
    }
    throw error;
  }
}

function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#039;");
}

function formatContractDate(value: string | null | undefined): string {
  const normalized = normalizeDate(value);
  if (!normalized) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(normalized);
  if (!iso) return normalized;
  return `${iso[3]}.${iso[2]}.${iso[1]}`;
}

function buildSignedContractHtml(params: {
  userId: string;
  userEmail: string;
  userName: string | null;
  contractVersion: string;
  signerData: ContractSignerFormData;
  signatureDataUrl: string;
  signatureFallbackUrl?: string | null;
  sourceContractDataUrl?: string | null;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}): string {
  const rows: Array<[string, string | null | undefined]> = [
    ["ФИО", params.signerData.fullName],
    ["Дата рождения", formatContractDate(params.signerData.birthDate)],
    ["Паспорт", params.signerData.passportNumber],
    ["Кем выдан", params.signerData.passportIssuedBy],
    ["Код подразделения", params.signerData.passportCode],
    ["Дата выдачи паспорта", formatContractDate(params.signerData.passportIssueDate)],
    ["Адрес регистрации", params.signerData.address],
    ["ОГРНИП", params.signerData.ogrnip],
    ["ИНН", params.signerData.inn],
    ["СНИЛС", params.signerData.snils],
    ["Email аккаунта", params.userEmail],
    ["Имя в кабинете", params.userName],
    ["ID пользователя", params.userId],
    ["IP", params.ipAddress],
    ["User-Agent", params.userAgent]
  ];

  const details = rows
    .map(([label, value]) => {
      const normalized = normalizeNullable(value) ?? "—";
      return `<div class="row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(normalized)}</dd></div>`;
    })
    .join("");
  const sourceContractFrame = params.sourceContractDataUrl
    ? `<section class="box contract-source">
      <h2>Договор</h2>
      <p class="muted">Исходный договор с условиями ICECREAMMUSIC.</p>
      <iframe title="Договор ICECREAMMUSIC" src="${escapeHtml(params.sourceContractDataUrl)}"></iframe>
    </section>`
    : `<section class="box contract-source">
      <h2>Договор</h2>
      <p class="muted">
        Исходный шаблон договора: ${escapeHtml(CONTRACT_FILE_NAME)}.
      </p>
    </section>`;
  const signatureSrc = params.signatureDataUrl.startsWith("data:image/")
    ? params.signatureDataUrl
    : params.signatureFallbackUrl ?? params.signatureDataUrl;

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>Подписанный договор ICECREAMMUSIC</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      background: #f5f5f7;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 14px;
      line-height: 1.55;
    }
    main {
      box-sizing: border-box;
      width: 860px;
      max-width: calc(100% - 32px);
      margin: 32px auto;
      padding: 40px;
      background: #ffffff;
      border: 1px solid #d7dbe3;
      border-radius: 18px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
    }
    h1 {
      margin: 0 0 8px;
      font-size: 28px;
      line-height: 1.2;
      letter-spacing: -0.02em;
    }
    h2 {
      margin: 30px 0 14px;
      font-size: 18px;
    }
    .muted { color: #667085; }
    .box {
      margin-top: 20px;
      padding: 18px;
      border: 1px solid #e4e7ec;
      border-radius: 14px;
      background: #f9fafb;
    }
    dl { margin: 0; }
    .row {
      display: grid;
      grid-template-columns: 220px 1fr;
      gap: 18px;
      padding: 10px 0;
      border-bottom: 1px solid #eaecf0;
    }
    .row:last-child { border-bottom: 0; }
    dt {
      margin: 0;
      color: #667085;
      font-weight: 700;
    }
    dd {
      margin: 0;
      color: #101828;
      word-break: break-word;
    }
    .signature {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 320px;
      min-height: 140px;
      padding: 16px;
      border: 1px dashed #98a2b3;
      border-radius: 14px;
      background: #ffffff;
    }
    .signature img {
      max-width: 300px;
      max-height: 120px;
      object-fit: contain;
    }
    .legal {
      font-size: 12px;
      color: #475467;
    }
    .contract-source iframe {
      display: block;
      width: 100%;
      height: 920px;
      margin-top: 14px;
      border: 1px solid #e4e7ec;
      border-radius: 12px;
      background: #ffffff;
    }
  </style>
</head>
<body>
  <main>
    <h1>Подписанный договор ICECREAMMUSIC</h1>
    <p class="muted">
      Финальная версия создана после электронной подписи пользователем.
      Версия договора: ${escapeHtml(params.contractVersion)}.
    </p>

    ${sourceContractFrame}

    <section class="box">
      <h2>Данные подписанта</h2>
      <dl>${details}</dl>
    </section>

    <section class="box">
      <h2>Подпись</h2>
      <p>
        Подписано: <strong>${escapeHtml(new Date(params.signedAt).toLocaleString("ru-RU"))}</strong>
      </p>
      <div class="signature">
        <img src="${escapeHtml(signatureSrc)}" alt="Подпись пользователя" />
      </div>
    </section>

    <section class="box legal">
      <p>
        Подписант подтвердил, что ознакомился с договором ICECREAMMUSIC, принимает его условия
        и подтверждает корректность внесённых данных. Исходный шаблон договора:
        ${escapeHtml(CONTRACT_FILE_NAME)}.
      </p>
    </section>
  </main>
</body>
</html>`;
}

async function readSourceContractDataUrl(): Promise<string | null> {
  try {
    const filePath = path.join(process.cwd(), "public", "docs", CONTRACT_FILE_NAME);
    const body = await readFile(filePath);
    return `data:application/pdf;base64,${body.toString("base64")}`;
  } catch {
    return null;
  }
}

async function createSignedContractDocument(params: {
  userId: string;
  userEmail: string;
  userName: string | null;
  contractVersion: string;
  signerData: ContractSignerFormData;
  signatureDataUrl: string;
  signatureFallbackUrl?: string | null;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<{
  contractFileName: string;
  contractFileUrl: string;
  contractContentType: string;
  signedDocumentHash: string;
}> {
  const sourceContractDataUrl = await readSourceContractDataUrl();
  const html = buildSignedContractHtml({
    ...params,
    signatureFallbackUrl: "/api/verification/contract/signature?inline=1",
    sourceContractDataUrl
  });
  const body = Buffer.from(html, "utf8");
  const hash = createHash("sha256").update(body).digest("hex");
  const shortHash = hash.slice(0, 16);
  const date = params.signedAt.slice(0, 10) || "unknown-date";
  const fileName = `signed-contract-${params.userId}-${date}-${shortHash}.html`;
  const contentType = "text/html; charset=utf-8";
  const key = `contracts/documents/${params.userId}/${fileName}`;

  if (shouldBypassContractStorage()) {
    return {
      contractFileName: fileName,
      contractFileUrl: `data:${contentType.replace(/;\s+/u, ";")};base64,${body.toString("base64")}`,
      contractContentType: contentType,
      signedDocumentHash: hash
    };
  }

  try {
    const uploaded = await uploadObjectToStorage({
      key,
      contentType,
      body
    });
    return {
      contractFileName: fileName,
      contractFileUrl: uploaded.url.trim(),
      contractContentType: contentType,
      signedDocumentHash: hash
    };
  } catch (error) {
    if (!isVerificationStorageUnavailableError(error)) throw error;
    return {
      contractFileName: fileName,
      contractFileUrl: `data:${contentType.replace(/;\s+/u, ";")};base64,${body.toString("base64")}`,
      contractContentType: contentType,
      signedDocumentHash: hash
    };
  }
}

function toListItem(row: ContractSignatureRecordLike): ContractSignatureListItem {
  const contractMeta = safeParseContractMeta(row.contract);
  const legacy = row as unknown as Record<string, unknown>;
  const legacyString = (key: string): string | null =>
    typeof legacy[key] === "string" && legacy[key].trim() ? legacy[key].trim() : null;
  const legacyDate = (key: string): string | null => {
    const value = legacy[key];
    return value instanceof Date ? value.toISOString() : legacyString(key);
  };
  const fallbackBirthDate = toIsoString(row.birthDate);
  const fallbackPassportNumber = `${row.passSeries ?? ""} ${row.passNum ?? ""}`.trim();
  const fullName =
    contractMeta.fullName?.trim() ||
    [row.lastName, row.firstName, row.middleName].filter(Boolean).join(" ").trim() ||
    "—";
  const signatureImageUrl =
    contractMeta.signatureImageUrl?.trim() || legacyString("signatureImageUrl") || LEGACY_SIGNATURE_PLACEHOLDER_DATA_URL;
  const signedAt =
    contractMeta.signedAt ??
    contractMeta.updatedAt ??
    contractMeta.createdAt ??
    legacyDate("signedAt") ?? toIsoString(row.getDate) ??
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
    contractContentType: contractMeta.contractContentType ?? "application/pdf",
    signedDocumentHash: contractMeta.signedDocumentHash ?? null,
    signatureImageUrl,
    signedAt,
    ipAddress: normalizeNullable(contractMeta.ipAddress),
    userAgent: normalizeNullable(contractMeta.userAgent),
    status,
    rejectionReason,
    approvedAt: normalizeNullable(contractMeta.approvedAt ?? legacyDate("approvedAt")),
    approvedByAdminId: normalizeNullable(contractMeta.approvedByAdminId ?? legacyString("approvedByAdminId")),
    rejectedAt: normalizeNullable(contractMeta.rejectedAt ?? legacyDate("rejectedAt")),
    rejectedByAdminId: normalizeNullable(contractMeta.rejectedByAdminId ?? legacyString("rejectedByAdminId")),
    createdAt: contractMeta.createdAt ?? legacyDate("createdAt") ?? signedAt,
    updatedAt: contractMeta.updatedAt ?? legacyDate("updatedAt") ?? signedAt,
    fullName: fullName === "—" ? legacyString("fullName") ?? fullName : fullName,
    birthDate: contractMeta.birthDate ?? legacyString("birthDate") ?? fallbackBirthDate,
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

export function buildVerificationUnavailableStatus(): ContractStatusPayload {
  return {
    status: "unavailable",
    signed: false,
    isVerified: false,
    canSubmitReleases: false,
    canCreateRelease: false,
    signedAt: null,
    contractVersion: null,
    reason: "Верификация подписи временно недоступна. Попробуйте позже.",
    rejectionReason: null,
    rejectionKind: null,
    verificationId: null
  };
}

async function listVerificationStoreItemsOrEmpty(): Promise<ContractSignatureListItem[]> {
  try {
    return await readStore();
  } catch (error) {
    if (
      error instanceof Error &&
      /Верификация подписи временно недоступна|S3\/MinIO|таблицу verification/iu.test(error.message)
    ) {
      return [];
    }
    throw error;
  }
}

async function updateVerificationStoreOrUnavailable(
  updater: (records: ContractSignatureListItem[]) => Promise<ContractSignatureListItem[]>
): Promise<{ ok: true; records: ContractSignatureListItem[] } | { ok: false; error: string }> {
  try {
    const records = await readStore();
    const next = await updater(records);
    await writeStore(next);
    return { ok: true, records: next };
  } catch (error) {
    if (isVerificationStorageUnavailableError(error)) {
      return {
        ok: false,
        error: "Верификация подписи временно недоступна. Попробуйте позже."
      };
    }
    throw error;
  }
}

function canUseRawVerificationQueries(prisma: PrismaClient): boolean {
  const candidate = prisma as unknown as {
    $queryRawUnsafe?: unknown;
    $executeRawUnsafe?: unknown;
  };
  return (
    typeof candidate.$queryRawUnsafe === "function" &&
    typeof candidate.$executeRawUnsafe === "function"
  );
}

function isSchemaUnavailableError(error: unknown): boolean {
  return (
    isPrismaTableMissingError(error, "verification") ||
    isPrismaTableMissingError(error, "icecream.verification") ||
    isPrismaTableMissingError(error, "Verification") ||
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

function buildGeneratedSignedContractFileName(item: ContractSignatureListItem): string {
  const date = item.signedAt.slice(0, 10) || "unknown-date";
  return `signed-contract-${item.userId}-${date}.html`;
}

async function resolveSignatureDataUrlForContract(item: ContractSignatureListItem): Promise<string | null> {
  if (isVerificationSignatureUnavailable(item.signatureImageUrl)) return null;
  if (item.signatureImageUrl.startsWith("data:image/png;base64,")) return item.signatureImageUrl;

  const legacyBody = decodeLegacyLocalSignatureUrl(item.signatureImageUrl);
  if (legacyBody) {
    return `data:image/png;base64,${legacyBody.toString("base64")}`;
  }

  const storageLocation = extractStorageLocationFromUrl(item.signatureImageUrl);
  if (storageLocation.key) {
    try {
      const stored = await streamStoredObject({ key: storageLocation.key });
      if (stored?.body) {
        const body = Buffer.from(await new Response(stored.body).arrayBuffer());
        if (body.byteLength > 0) {
          return `data:image/png;base64,${body.toString("base64")}`;
        }
      }
    } catch {
      // Fall through to remote fetch fallback below.
    }
  }

  if (/^https?:\/\//u.test(item.signatureImageUrl)) {
    try {
      const response = await fetch(item.signatureImageUrl);
      if (response.ok) {
        const body = Buffer.from(await response.arrayBuffer());
        if (body.byteLength > 0) {
          return `data:image/png;base64,${body.toString("base64")}`;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

async function buildGeneratedSignedContractAsset(
  item: ContractSignatureListItem,
  options: { signatureFallbackUrl?: string | null } = {}
): Promise<VerificationDownloadAsset | null> {
  const signatureDataUrl = await resolveSignatureDataUrlForContract(item);
  if (!signatureDataUrl) return null;
  const sourceContractDataUrl = await readSourceContractDataUrl();

  const html = buildSignedContractHtml({
    userId: item.userId,
    userEmail: item.userEmail,
    userName: item.userName,
    contractVersion: item.contractVersion,
    signerData: {
      fullName: item.fullName,
      birthDate: item.birthDate,
      passportNumber: item.passportNumber,
      passportIssuedBy: item.passportIssuedBy,
      passportCode: item.passportCode,
      passportIssueDate: item.passportIssueDate,
      address: item.address,
      ogrnip: item.ogrnip,
      inn: item.inn,
      snils: item.snils,
      confirmationAccepted: true
    },
    signatureDataUrl,
    signatureFallbackUrl: options.signatureFallbackUrl ?? `/api/admin/verification/${encodeURIComponent(item.id)}/signature/download?inline=1`,
    sourceContractDataUrl,
    signedAt: item.signedAt,
    ipAddress: item.ipAddress,
    userAgent: item.userAgent
  });

  return {
    contentType: "text/html; charset=utf-8",
    fileName: buildGeneratedSignedContractFileName(item),
    body: Buffer.from(html, "utf8")
  };
}

function decodeDataUrlImage(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([a-zA-Z0-9+/=\s]+)$/u.exec(dataUrl.trim());
  if (!match?.[1]) return null;
  return Buffer.from(match[1], "base64");
}

function decodeDataUrlDocument(dataUrl: string): { contentType: string; body: Buffer } | null {
  const match = /^data:([^,]+);base64,([a-zA-Z0-9+/=\s]+)$/iu.exec(dataUrl.trim());
  if (!match?.[1] || !match?.[2]) return null;
  return {
    contentType: match[1].replace(/;\s*charset=/iu, "; charset="),
    body: Buffer.from(match[2], "base64")
  };
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
    return buildVerificationUnavailableStatus();
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
    if (isVerificationStorageUnavailableError(error)) {
      return buildVerificationUnavailableStatus();
    }
    if (isSchemaUnavailableError(error)) {
      return buildVerificationUnavailableStatus();
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
  if (current.status === "unavailable") {
    throw new Error(current.reason);
  }
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
  const signedDocument = await createSignedContractDocument({
    userId: params.userId,
    userEmail: params.userEmail,
    userName: params.userName,
    contractVersion: params.contractVersion,
    signerData,
    signatureDataUrl: params.signatureImage.trim(),
    signedAt: nowIso,
    ipAddress: normalizedIp,
    userAgent: normalizedUserAgent
  });
  const contractMeta: VerificationContractMeta = {
    contractVersion: params.contractVersion,
    contractFileName: signedDocument.contractFileName,
    contractFileUrl: signedDocument.contractFileUrl,
    contractContentType: signedDocument.contractContentType,
    signedDocumentHash: signedDocument.signedDocumentHash,
    sourceContractFileName: CONTRACT_FILE_NAME,
    sourceContractFileUrl: CONTRACT_FILE_URL,
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
    contractFileName: signedDocument.contractFileName,
    contractFileUrl: signedDocument.contractFileUrl,
    contractContentType: signedDocument.contractContentType,
    signedDocumentHash: signedDocument.signedDocumentHash,
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
    const records = await listVerificationStoreItemsOrEmpty();
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
      const records = await listVerificationStoreItemsOrEmpty();
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
    const records = await listVerificationStoreItemsOrEmpty();
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
      const records = await listVerificationStoreItemsOrEmpty();
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
      moderationStartedAt: params.now,
      moderationCancelledAt: null,
      moderationReturnedAt: null,
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
  let current: ContractSignatureListItem | null = null;
  let movedReleaseIds: string[] = [];
  const update = await updateVerificationStoreOrUnavailable(async (records) => {
    const index = records.findIndex((item) => item.id === params.verificationId);
    if (index < 0) {
      throw new Error("VERIFICATION_NOT_FOUND");
    }

    current = records[index]!;
    if (current.status !== "pending") {
      throw new Error("STATUS_TRANSITION_NOT_ALLOWED");
    }

    movedReleaseIds = await movePendingVerificationReleasesToModeration({
      prismaLike: params.prisma,
      userId: current.userId,
      now: params.now
    });

    const next = [...records];
    next[index] = {
      ...current,
      status: "approved",
      rejectionReason: null,
      approvedAt: params.now.toISOString(),
      approvedByAdminId: params.adminId,
      rejectedAt: null,
      rejectedByAdminId: null,
      updatedAt: params.now.toISOString()
    };
    return next;
  });
  if (!update.ok) return { ok: false, error: update.error };
  if (!current) return { ok: false, error: "Verification not found" };

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
  if (!canUseRawVerificationQueries(params.prisma)) {
    return null;
  }
  const rows = (await params.prisma.$queryRawUnsafe(
    `SELECT id, "userId", status::text AS status, contract, "rejectReason"
       FROM icecream.verification
      WHERE id = $1::uuid
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
  if (!canUseRawVerificationQueries(params.prisma)) {
    return approveContractSignatureWithStoreFallback(params);
  }
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
        WHERE id = $3::uuid`,
      toDbStatus("approved"),
      nextContract,
      params.verificationId
    );

    const movedReleaseIds = await movePendingVerificationReleasesToModeration({
      prismaLike: tx as unknown as PrismaClient,
      userId: current.userId,
      now: params.now
    });

    await createAdminVerificationLogSafe({
      tx,
      adminId: params.adminId,
      action: "CONTRACT_VERIFICATION_APPROVED",
      verificationId: params.verificationId,
      payload: {
        userId: current.userId,
        movedReleaseIds
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
  console.log("[verification-admin-action]", {
    action: "approve",
    verificationId: params.verificationId
  });
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
      const verificationModel = getModel(tx as PrismaClient);
      if (!verificationModel) return { ok: false, error: "Verification storage unavailable" } as VerificationReviewResult;
      const current = (await verificationModel.findUnique({
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
      await verificationModel.update({
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

      await createAdminVerificationLogSafe({
        tx,
        adminId: params.adminId,
        action: "CONTRACT_VERIFICATION_APPROVED",
        verificationId: params.verificationId,
        payload: {
          userId: current.userId,
          movedReleaseIds
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

      const verification = await getContractSignatureById({
        prisma: params.prisma,
        id: params.verificationId
      });
      try {
        await sendVerificationDecisionEmail({
          to: verification?.userEmail,
          userName: verification?.userName,
          approved: true
        });
      } catch (error) {
        console.error("[verification-email] approve notification failed", error);
      }
    }

    return result;
  } catch (error) {
    console.error("[verification-admin-action-failed]", {
      action: "approve",
      verificationId: params.verificationId,
      error: error instanceof Error ? error.message : String(error)
    });
    if (isSchemaUnavailableError(error)) {
      return canUseRawVerificationQueries(params.prisma)
        ? approveContractSignatureWithVerificationTableFallback({
            ...params,
            now
          })
        : approveContractSignatureWithStoreFallback({
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
  let current: ContractSignatureListItem | null = null;
  let movedReleaseIds: string[] = [];
  const update = await updateVerificationStoreOrUnavailable(async (records) => {
    const index = records.findIndex((item) => item.id === params.verificationId);
    if (index < 0) {
      throw new Error("VERIFICATION_NOT_FOUND");
    }

    current = records[index]!;
    if (current.status !== "pending" && current.status !== "approved") {
      throw new Error("STATUS_TRANSITION_NOT_ALLOWED");
    }

    movedReleaseIds = await movePendingVerificationReleasesToChangesRequired({
      prismaLike: params.prisma,
      userId: current.userId,
      adminId: params.adminId,
      reason: params.reason,
      now: params.now
    });

    const next = [...records];
    next[index] = {
      ...current,
      status: "rejected",
      rejectionReason: params.reason,
      approvedAt: current.approvedAt,
      approvedByAdminId: current.approvedByAdminId,
      rejectedAt: params.now.toISOString(),
      rejectedByAdminId: params.adminId,
      updatedAt: params.now.toISOString()
    };
    return next;
  });
  if (!update.ok) return { ok: false, error: update.error };
  if (!current) return { ok: false, error: "Verification not found" };

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
  if (!canUseRawVerificationQueries(params.prisma)) {
    return rejectContractSignatureWithStoreFallback(params);
  }
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
        WHERE id = $4::uuid`,
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

    await createAdminVerificationLogSafe({
      tx,
      adminId: params.adminId,
      action:
        currentStatus === "approved"
          ? "CONTRACT_VERIFICATION_CANCELLED"
          : "CONTRACT_VERIFICATION_REJECTED",
      verificationId: params.verificationId,
      payload: {
        userId: current.userId,
        reason: params.reason,
        movedReleaseIds
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
  console.log("[verification-admin-action]", {
    action: "reject",
    verificationId: params.verificationId
  });
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
    const result = await params.prisma.$transaction(async (tx) => {
      const verificationModel = getModel(tx as PrismaClient);
      if (!verificationModel) return { ok: false, error: "Verification storage unavailable" } as VerificationReviewResult;
      const current = (await verificationModel.findUnique({
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
      await verificationModel.update({
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

      await createAdminVerificationLogSafe({
        tx,
        adminId: params.adminId,
        action:
          currentStatus === "approved"
            ? "CONTRACT_VERIFICATION_CANCELLED"
            : "CONTRACT_VERIFICATION_REJECTED",
        verificationId: params.verificationId,
        payload: {
          userId: current.userId,
          reason,
          movedReleaseIds
        }
      });

      return {
        ok: true,
        verificationId: params.verificationId,
        movedReleaseIds
      } satisfies VerificationReviewResult;
    });

    if (result.ok) {
      const verification = await getContractSignatureById({
        prisma: params.prisma,
        id: params.verificationId
      });
      try {
        await sendVerificationDecisionEmail({
          to: verification?.userEmail,
          userName: verification?.userName,
          approved: false,
          reason
        });
      } catch (error) {
        console.error("[verification-email] reject notification failed", error);
      }
    }

    return result;
  } catch (error) {
    console.error("[verification-admin-action-failed]", {
      action: "reject",
      verificationId: params.verificationId,
      error: error instanceof Error ? error.message : String(error)
    });
    if (isSchemaUnavailableError(error)) {
      return canUseRawVerificationQueries(params.prisma)
        ? rejectContractSignatureWithVerificationTableFallback({
            ...params,
            reason,
            now
          })
        : rejectContractSignatureWithStoreFallback({
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
    try {
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
    } catch (error) {
      if (!isVerificationStorageUnavailableError(error)) throw error;
    }
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
  inline?: boolean;
  signatureFallbackUrl?: string | null;
}): Promise<VerificationDownloadAsset | null> {
  const item = await getContractSignatureById(params);
  if (!item) return null;

  const fallbackUrl = item.contractFileUrl?.trim() || CONTRACT_FILE_URL;
  const contentType = item.contractContentType?.trim() || "application/pdf";
  const isSignedHtmlContract = contentType.toLowerCase().startsWith("text/html");

  if (fallbackUrl.startsWith("data:")) {
    const decoded = decodeDataUrlDocument(fallbackUrl);
    if (!decoded) return null;
    if (decoded.contentType.toLowerCase().startsWith("text/html")) {
      const html = decoded.body.toString("utf8");
      if (
        !html.includes("contract-source") ||
        !html.includes("data:application/pdf;base64,") ||
        (params.signatureFallbackUrl && html.includes("/api/verification/contract/signature"))
      ) {
        const generatedSignedAsset = await buildGeneratedSignedContractAsset(item, {
          signatureFallbackUrl: params.signatureFallbackUrl
        });
        if (generatedSignedAsset) return generatedSignedAsset;
      }
    }
    return {
      contentType: decoded.contentType,
      fileName: buildContractFileName(item),
      body: decoded.body
    };
  }

  if (isSignedHtmlContract && fallbackUrl !== CONTRACT_FILE_URL) {
    const generatedSignedAsset = await buildGeneratedSignedContractAsset(item, {
      signatureFallbackUrl: params.signatureFallbackUrl
    });
    if (generatedSignedAsset) return generatedSignedAsset;
  }

  const storageLocation = extractStorageLocationFromUrl(fallbackUrl);
  if (storageLocation.key) {
    const disposition = `${params.inline ? "inline" : "attachment"}; filename="${buildContractFileName(item)}"`;
    try {
      const signed = await createPresignedDownload({
        key: storageLocation.key,
        bucket: storageLocation.bucket ?? undefined,
        expiresIn: 600,
        responseContentDisposition: disposition,
        responseContentType: contentType
      });
      return {
        contentType,
        fileName: buildContractFileName(item),
        redirectUrl: signed.url
      };
    } catch (error) {
      if (!isVerificationStorageUnavailableError(error)) throw error;
    }
  }

  if (/^https?:\/\//u.test(fallbackUrl) && fallbackUrl !== CONTRACT_FILE_URL) {
    return {
      contentType,
      fileName: buildContractFileName(item),
      redirectUrl: fallbackUrl
    };
  }

  const generatedSignedAsset = await buildGeneratedSignedContractAsset(item, {
    signatureFallbackUrl: params.signatureFallbackUrl
  });
  if (generatedSignedAsset) {
    return generatedSignedAsset;
  }

  try {
    const filePath = path.join(process.cwd(), "public", "docs", path.basename(item.contractFileName));
    const body = await readFile(filePath);
    return {
      contentType: "application/pdf",
      fileName: buildContractFileName(item),
      body
    };
  } catch {
    if (/^https?:\/\//u.test(fallbackUrl)) {
      return {
        contentType,
        fileName: buildContractFileName(item),
        redirectUrl: fallbackUrl
      };
    }
    return null;
  }
}

export async function getAdminVerificationCounts(params: {
  prisma: PrismaClient;
}): Promise<{
  verification_pending: number;
  releases_moderation: number;
  releases_pending_verification: number;
}> {
  const countReleaseStates = async () => {
    const releases = await params.prisma.release.findMany({
      where: {},
      select: {
        status: true,
        confirmed: true,
        roles: true
      }
    });

    let releasesModeration = 0;
    let releasesPendingVerification = 0;

    for (const release of releases) {
      if (release.status === "pending_verification") {
        releasesPendingVerification += 1;
        continue;
      }

      if (isReleaseActuallyOnModeration(release.status, release.confirmed, release.roles)) {
        releasesModeration += 1;
      }
    }

    return {
      releasesModeration,
      releasesPendingVerification
    };
  };

  const model = getModel(params.prisma);
  if (!model) {
    const records = await listVerificationStoreItemsOrEmpty();
    const verificationPending = records.filter((item) => item.status === "pending").length;
    const { releasesModeration, releasesPendingVerification } = await countReleaseStates();
    return {
      verification_pending: verificationPending,
      releases_moderation: releasesModeration,
      releases_pending_verification: releasesPendingVerification
    };
  }

  try {
    const [verificationPending, releaseStateCounts] = await Promise.all([
      model.findMany({}).then((rows) =>
        rows
          .map((row) => toListItem(row as ContractSignatureRecordLike))
          .filter((item) => item.status === "pending").length
      ),
      countReleaseStates()
    ]);

    return {
      verification_pending: verificationPending,
      releases_moderation: releaseStateCounts.releasesModeration,
      releases_pending_verification: releaseStateCounts.releasesPendingVerification
    };
  } catch (error) {
    if (!isSchemaUnavailableError(error)) throw error;

    const records = await listVerificationStoreItemsOrEmpty();
    const verificationPending = records.filter((item) => item.status === "pending").length;
    const { releasesModeration, releasesPendingVerification } = await countReleaseStates();
    return {
      verification_pending: verificationPending,
      releases_moderation: releasesModeration,
      releases_pending_verification: releasesPendingVerification
    };
  }
}

export { buildVerificationRejectedMessage };
