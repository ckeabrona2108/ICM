import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client
} from "@aws-sdk/client-s3";
import { PrismaClient } from "@prisma/client";

import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { resolveExistingImageStorageKeyWithFallback } from "@/lib/s3";

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run") || !process.argv.includes("--apply");
const APPLY = process.argv.includes("--apply");
const LIMIT = readNumberArg("--limit");
const OUTPUT = readStringArg("--output");
const RELEASE_ID = readStringArg("--release-id");
const MANUAL_KEY = readStringArg("--manual-key");

const COVER_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const COVER_PREFIXES = [
  "previews/",
  "uploads/",
  "covers/",
  "contracts/previews/",
  "contracts/uploads/",
  "contracts/covers/"
] as const;

type ReleaseRow = {
  id: string;
  userId: string;
  title: string;
  preview: string;
  roles: unknown;
  date: Date;
};

type S3ObjectRow = {
  key: string;
  lastModified: string | null;
};

type CandidateRow = {
  key: string;
  lastModified: string | null;
  score: number;
  confidence: "high" | "medium" | "low";
  reason: string;
};

type ReportRow = {
  releaseId: string;
  userId: string;
  title: string;
  oldPreview: string;
  exactPreviewKey: string | null;
  exactPreviewExists: boolean;
  createdAt: null;
  updatedAt: null;
  releaseDate: string;
  possibleCandidates: CandidateRow[];
  lastModifiedCandidates: Array<{ key: string; lastModified: string | null }>;
  confidence: "high" | "medium" | "low" | "none";
  reason: string;
  recommendedKey: string | null;
  needsManualCover: boolean;
};

type S3HeadMeta = {
  contentType: string | null;
  contentLength: number | null;
};

type S3HeadResult = {
  exists: boolean;
  meta: S3HeadMeta | null;
  source: "head-object" | "public-head" | "list-case-insensitive" | "missing";
  resolvedKey?: string | null;
};

function readStringArg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberArg(flag: string): number | null {
  const value = readStringArg(flag);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function readStringEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function readBooleanEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (typeof raw !== "string") return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

function toEndpointUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) return rawValue;
  const useSsl = readBooleanEnv("S3_USE_SSL", true);
  return `${useSsl ? "https" : "http"}://${rawValue}`;
}

function getPublicS3Root(): string | null {
  const direct = readStringEnv("PUBLIC_S3_ROOT", "NEXT_PUBLIC_S3_ROOT");
  if (direct) return direct.replace(/\/+$/u, "");
  const endpoint = toEndpointUrl(readStringEnv("S3_ENDPOINT", "MINIO_ENDPOINT", "S3_HOST"));
  return endpoint ? endpoint.replace(/\/+$/u, "") : null;
}

async function loadDotEnvFile(filePath: string): Promise<void> {
  try {
    const content = await readFile(filePath, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const equalsIndex = trimmed.indexOf("=");
      if (equalsIndex < 0) continue;
      const key = trimmed.slice(0, equalsIndex).trim();
      if (!key || process.env[key] != null) continue;
      let value = trimmed.slice(equalsIndex + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ignore
  }
}

async function loadEnvironment(): Promise<void> {
  const cwd = process.cwd();
  await loadDotEnvFile(path.join(cwd, ".env"));
  await loadDotEnvFile(path.join(cwd, ".env.local"));
}

function buildS3Client(): S3Client {
  const endpoint = toEndpointUrl(readStringEnv("S3_ENDPOINT", "MINIO_ENDPOINT", "S3_HOST"));
  const region = readStringEnv("S3_REGION", "AWS_REGION") ?? "ru";
  const accessKeyId = readStringEnv(
    "S3_ACCESS_KEY_ID",
    "S3_ACCESS_KEY",
    "MINIO_ACCESS_KEY",
    "MINIO_ROOT_USER"
  );
  const secretAccessKey = readStringEnv(
    "S3_SECRET_ACCESS_KEY",
    "S3_SECRET_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_ROOT_PASSWORD"
  );

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3 credentials are missing. Check S3_HOST, S3_ACCESS_KEY and S3_SECRET_KEY.");
  }

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey }
  });
}

function getBucketCandidates(): string[] {
  return Array.from(
    new Set(
      [
        readStringEnv("S3_BUCKET", "S3_BUCKET_NAME", "MINIO_BUCKET", "MINIO_BUCKET_NAME"),
        "uploads",
        "contracts",
        "signatures",
        "verification"
      ]
        .map((value) => (value ?? "").trim())
        .filter(Boolean)
    )
  );
}

async function canUseBucket(client: S3Client, bucket: string): Promise<boolean> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return /accessdenied|forbidden|403/i.test(message);
  }
}

async function resolveBucketName(client: S3Client): Promise<string> {
  for (const bucket of getBucketCandidates()) {
    if (await canUseBucket(client, bucket)) {
      return bucket;
    }
  }
  throw new Error(`No accessible S3 bucket found among: ${getBucketCandidates().join(", ")}`);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isEmptyRoles(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return true;
  return Object.keys(record).length === 0;
}

function hasCoverMetadata(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const submission = asRecord(record.submissionData);
  const buckets = [record, submission, asRecord(record.assets), asRecord(record.files), asRecord(record.uploads)];
  return buckets.some((bucket) => {
    if (!bucket) return false;
    return ["coverUpload", "cover", "coverUrl", "artwork", "artworkUrl", "image", "imageUrl", "files", "uploads", "assets"].some(
      (key) => bucket[key] != null
    );
  });
}

function isAllowedCoverKey(key: string): boolean {
  const extension = key.split(".").at(-1)?.toLowerCase() ?? "";
  return COVER_EXTENSIONS.has(extension);
}

function getBaseNameWithoutExtension(key: string): string {
  const fileName = key.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) return fileName;
  return fileName.slice(0, dotIndex);
}

function getPrefixWithoutFileName(key: string): string | null {
  const segments = key.split("/").filter(Boolean);
  if (segments.length <= 1) return null;
  return `${segments.slice(0, -1).join("/")}/`;
}

function logCaseVariantDebug(input: {
  originalKey: string;
  normalizedBasename: string | null;
  caseVariantMatch: boolean;
  matchedKey: string | null;
}): void {
  console.log(input);
}

function isAllowedCoverPrefix(key: string): boolean {
  return COVER_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function extractPreviewStorageKey(preview: string): string | null {
  const trimmed = preview.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/api/uploads/object/") && !trimmed.startsWith("api/uploads/object/")) {
    return null;
  }
  const key = trimmed.replace(/^\/?api\/uploads\/object\/+/u, "").split("?")[0]?.split("#")[0] ?? "";
  return key || null;
}

function isUserUploadsKey(key: string, userId: string): boolean {
  return key.startsWith(`uploads/${userId}/`);
}

function isReleaseIdPreview(preview: string, releaseId: string): boolean {
  const escapedId = releaseId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^/api/uploads/object/previews/${escapedId}\\.(jpg|jpeg|png|webp)$`, "iu").test(preview.trim());
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-+/gu, "-");
}

function daysBetween(left: Date, rightIso: string | null): number | null {
  if (!rightIso) return null;
  const right = new Date(rightIso);
  const time = right.getTime();
  if (!Number.isFinite(time)) return null;
  return Math.abs(time - left.getTime()) / (1000 * 60 * 60 * 24);
}

function scoreCandidate(release: ReleaseRow, key: string, lastModified: string | null): CandidateRow {
  const basename = key.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
  const baseNameWithoutExtension = getBaseNameWithoutExtension(key).toLowerCase();
  const titleSlug = slugify(release.title);
  const deltaDays = daysBetween(release.date, lastModified);
  const segments = key.split("/").filter(Boolean);
  const scopedUserId =
    segments[0] === "contracts"
      ? (segments.length >= 3 ? segments[2] ?? null : null)
      : (segments.length >= 2 ? segments[1] ?? null : null);

  if (
    scopedUserId &&
    /^[0-9a-f-]{36}$/iu.test(scopedUserId) &&
    scopedUserId !== release.userId
  ) {
    return {
      key,
      lastModified,
      score: 0,
      confidence: "low",
      reason: "foreign-user-prefix"
    };
  }

  let score = 0;
  const reasons: string[] = [];

  if (baseNameWithoutExtension === release.id.toLowerCase()) {
    score += 220;
    reasons.push("releaseId-basename-match");
    const oldPrefix = getPrefixWithoutFileName(
      release.preview.replace(/^\/?api\/uploads\/object\/+/u, "").split("?")[0]?.split("#")[0] ?? ""
    );
    const candidatePrefix = getPrefixWithoutFileName(key);
    if (oldPrefix && candidatePrefix === oldPrefix) {
      score += 120;
      reasons.push("same-prefix-as-old-preview");
    } else if (candidatePrefix && COVER_PREFIXES.includes(candidatePrefix as (typeof COVER_PREFIXES)[number])) {
      score += 70;
      reasons.push("other-allowed-prefix-same-basename");
    }
  }

  if (key.startsWith(`uploads/${release.userId}/`)) {
    score += 100;
    reasons.push("user-upload-prefix");
  }
  if (basename.includes("release-cover")) {
    score += 80;
    reasons.push("release-cover-name");
  }
  if (titleSlug && basename.includes(titleSlug)) {
    score += 40;
    reasons.push("title-match");
  }
  if (deltaDays != null && deltaDays <= 14) {
    score += 60;
    reasons.push("time<=14d");
  } else if (deltaDays != null && deltaDays <= 45) {
    score += 35;
    reasons.push("time<=45d");
  } else if (deltaDays != null && deltaDays <= 120) {
    score += 10;
    reasons.push("time<=120d");
  }
  if (COVER_PREFIXES.some((prefix) => key.startsWith(prefix) && prefix.startsWith("contracts/"))) {
    score += 10;
    reasons.push("contracts-prefix");
  }
  if (key.startsWith(`previews/${release.userId}/`) || key.startsWith(`covers/${release.userId}/`)) {
    score += 90;
    reasons.push("user-media-prefix");
  }
  if (
    key.startsWith(`contracts/previews/${release.userId}/`) ||
    key.startsWith(`contracts/uploads/${release.userId}/`) ||
    key.startsWith(`contracts/covers/${release.userId}/`)
  ) {
    score += 95;
    reasons.push("contract-user-prefix");
  }

  const confidence: "high" | "medium" | "low" =
    score >= 200 ? "high" : score >= 120 ? "medium" : "low";

  return {
    key,
    lastModified,
    score,
    confidence,
    reason: reasons.join(",") || "weak-match"
  };
}

async function listPrefix(client: S3Client, bucket: string, prefix: string): Promise<S3ObjectRow[]> {
  const rows: S3ObjectRow[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      })
    );
    for (const item of response.Contents ?? []) {
      if (!item.Key || !isAllowedCoverKey(item.Key)) continue;
      rows.push({
        key: item.Key,
        lastModified: item.LastModified ? item.LastModified.toISOString() : null
      });
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);
  return rows;
}

function stableUrl(storageKey: string): string {
  return buildStoredFileRouteUrl(storageKey) ?? `/api/uploads/object/${storageKey}`;
}

async function headObject(
  client: S3Client,
  bucket: string,
  key: string
): Promise<S3HeadResult> {
  const normalizedBasename = getBaseNameWithoutExtension(key).toLowerCase() || null;
  const requestedExtension = key.split(".").at(-1)?.toLowerCase() ?? null;
  try {
    const response = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      })
    );
    return {
      exists: true,
      source: "head-object",
      resolvedKey: key,
      meta: {
        contentType: response.ContentType ?? null,
        contentLength: typeof response.ContentLength === "number" ? response.ContentLength : null
      }
    };
  } catch (error) {
    const s3Endpoint = toEndpointUrl(readStringEnv("S3_ENDPOINT", "MINIO_ENDPOINT", "S3_HOST")) ?? null;
    const s3Region = readStringEnv("S3_REGION", "AWS_REGION") ?? "ru";
    const publicRoot = getPublicS3Root();
    const statusCode =
      typeof (error as { $metadata?: { httpStatusCode?: unknown } })?.$metadata?.httpStatusCode === "number"
        ? Number((error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode)
        : null;
    const errorCode =
      typeof (error as { Code?: unknown; code?: unknown })?.Code === "string"
        ? String((error as { Code?: unknown }).Code)
        : typeof (error as { code?: unknown })?.code === "string"
          ? String((error as { code?: unknown }).code)
          : null;

    if (process.env.NODE_ENV !== "production") {
      console.log("[repair-release-covers:head-object]", {
        bucket,
        endpoint: s3Endpoint,
        region: s3Region,
        forcePathStyle: true,
        key,
        errorName: error instanceof Error ? error.name : null,
        errorCode,
        httpStatusCode: statusCode,
        message: error instanceof Error ? error.message : String(error)
      });
    }

    const parentPrefix = getPrefixWithoutFileName(key);
    if (parentPrefix) {
      const siblingRows = await listPrefix(client, bucket, parentPrefix);
      const imageSiblingKeys = siblingRows.map((row) => row.key).filter((candidateKey) => isAllowedCoverKey(candidateKey));
      const exactLowercaseMatches = Array.from(
        new Set(
          imageSiblingKeys
            .filter((candidateKey) => candidateKey.toLowerCase() === key.toLowerCase())
        )
      );
      if (exactLowercaseMatches.length === 1) {
        const resolvedKey = exactLowercaseMatches[0] ?? null;
        if (resolvedKey && resolvedKey !== key) {
          const resolvedExact = await headObject(client, bucket, resolvedKey);
          if (resolvedExact.exists) {
            logCaseVariantDebug({
              originalKey: key,
              normalizedBasename,
              caseVariantMatch: true,
              matchedKey: resolvedKey
            });
            return {
              exists: true,
              source: "list-case-insensitive",
              resolvedKey,
              meta: resolvedExact.meta
            };
          }
        }
      }

      const sameBasenameMatches = Array.from(
        new Set(
          imageSiblingKeys.filter((candidateKey) => {
            const candidateBasename = getBaseNameWithoutExtension(candidateKey).toLowerCase();
            return Boolean(normalizedBasename && candidateBasename === normalizedBasename);
          })
        )
      );
      const sameExtensionMatches = sameBasenameMatches.filter((candidateKey) => {
        const candidateExtension = candidateKey.split(".").at(-1)?.toLowerCase() ?? null;
        return candidateExtension === requestedExtension;
      });

      const preferredMatch =
        (sameExtensionMatches.length === 1 ? sameExtensionMatches[0] : null) ??
        (sameBasenameMatches.length === 1 ? sameBasenameMatches[0] : null);

      if (preferredMatch && preferredMatch !== key) {
        const resolvedExact = await headObject(client, bucket, preferredMatch);
        if (resolvedExact.exists) {
          logCaseVariantDebug({
            originalKey: key,
            normalizedBasename,
            caseVariantMatch: true,
            matchedKey: preferredMatch
          });
          return {
            exists: true,
            source: "list-case-insensitive",
            resolvedKey: preferredMatch,
            meta: resolvedExact.meta
          };
        }
      }
    }

    const shouldTryPublicHead =
      (statusCode === 404 || /NoSuchKey|NotFound/i.test(errorCode ?? "") || /not found/i.test(error instanceof Error ? error.message : String(error))) &&
      isAllowedCoverPrefix(key) &&
      isAllowedCoverKey(key) &&
      publicRoot;

    if (shouldTryPublicHead) {
      try {
        const publicUrl = `${publicRoot}/${key}`;
        const response = await fetch(publicUrl, { method: "HEAD" });
        if (process.env.NODE_ENV !== "production") {
          console.log("[repair-release-covers:public-head]", {
            key,
            publicUrl,
            status: response.status,
            ok: response.ok
          });
        }
        if (response.ok) {
          logCaseVariantDebug({
            originalKey: key,
            normalizedBasename,
            caseVariantMatch: false,
            matchedKey: key
          });
          return {
            exists: true,
            source: "public-head",
            resolvedKey: key,
            meta: {
              contentType: response.headers.get("content-type"),
              contentLength: (() => {
                const raw = response.headers.get("content-length");
                if (!raw) return null;
                const parsed = Number(raw);
                return Number.isFinite(parsed) ? parsed : null;
              })()
            }
          };
        }
      } catch (publicHeadError) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[repair-release-covers:public-head-error]", {
            key,
            publicRoot,
            errorName: publicHeadError instanceof Error ? publicHeadError.name : null,
            message: publicHeadError instanceof Error ? publicHeadError.message : String(publicHeadError)
          });
        }
      }
    }

    return {
      exists: false,
      source: "missing",
      resolvedKey: null,
      meta: null
    };
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function applyManualKey(
  client: S3Client,
  bucket: string,
  releaseId: string,
  manualKey: string
): Promise<void> {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: {
      id: true,
      userId: true,
      preview: true,
      roles: true
    }
  });

  if (!release) {
    throw new Error(`Release not found: ${releaseId}`);
  }

  if (!APPLY) {
    throw new Error("Manual mode requires --apply.");
  }

  if (!isAllowedCoverPrefix(manualKey)) {
    throw new Error(`manual-key must use an allowed cover prefix: ${manualKey}`);
  }

  if (!isAllowedCoverKey(manualKey)) {
    throw new Error(`manual-key must be an allowed image (.jpg/.jpeg/.png/.webp): ${manualKey}`);
  }

  if (manualKey.startsWith("uploads/") && !isUserUploadsKey(manualKey, release.userId)) {
    throw new Error(
      `manual-key in uploads/ must belong to release.userId (${release.userId}): ${manualKey}`
    );
  }

  const headResult = await headObject(client, bucket, manualKey);
  if (!headResult.exists || !headResult.meta) {
    throw new Error(`manual-key does not exist in S3: ${manualKey}`);
  }

  const oldPreview = release.preview ?? "";
  const newPreview = stableUrl(manualKey);
  const nextRoles = cloneJson(asRecord(release.roles) ?? {});
  const nextSubmission = cloneJson(asRecord(nextRoles.submissionData) ?? {});
  const filename = manualKey.split("/").filter(Boolean).at(-1) ?? manualKey;

  const coverUploadPayload = {
    storageKey: manualKey,
    url: newPreview,
    path: manualKey,
    name: filename,
    mimeType: headResult.meta.contentType,
    size: headResult.meta.contentLength
  };

  nextRoles.coverUpload = coverUploadPayload;
  nextSubmission.coverUpload = coverUploadPayload;
  nextSubmission.cover = newPreview;
  nextRoles.submissionData = nextSubmission;

  await prisma.release.update({
    where: { id: release.id },
    data: {
      preview: newPreview,
      roles: nextRoles as never
    }
  });

  const result = {
    mode: "manual-apply",
    releaseId: release.id,
    oldPreview,
    newPreview,
    manualKey,
    existsInS3: true
  };

  if (OUTPUT) {
    await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...result, output: OUTPUT }, null, 2));
    return;
  }

  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  await loadEnvironment();

  const client = buildS3Client();
  const bucket = await resolveBucketName(client);

  if (MANUAL_KEY) {
    if (!RELEASE_ID) {
      throw new Error("manual-key mode requires --release-id.");
    }
    await applyManualKey(client, bucket, RELEASE_ID, MANUAL_KEY);
    await prisma.$disconnect();
    return;
  }

  const releases = await prisma.release.findMany({
    select: {
      id: true,
      userId: true,
      title: true,
      preview: true,
      roles: true,
      date: true
    },
    orderBy: { date: "desc" }
  });

  const uploadCache = new Map<string, S3ObjectRow[]>();
  const sharedPrefixCache = new Map<string, S3ObjectRow[]>();
  for (const prefix of COVER_PREFIXES) {
    sharedPrefixCache.set(prefix, await listPrefix(client, bucket, prefix));
  }

  const narrowed = RELEASE_ID ? releases.filter((release) => release.id === RELEASE_ID) : releases;
  const filtered = LIMIT ? narrowed.slice(0, LIMIT) : narrowed;
  const reportRows: ReportRow[] = [];
  let applyCount = 0;

  for (const release of filtered as ReleaseRow[]) {
    if (!isReleaseIdPreview(release.preview ?? "", release.id)) continue;
    if (!isEmptyRoles(release.roles)) continue;
    if (hasCoverMetadata(release.roles)) continue;

    const exactPreviewKey = extractPreviewStorageKey(release.preview ?? "");
    const exactPreviewResolvedKey =
      exactPreviewKey && isAllowedCoverPrefix(exactPreviewKey) && isAllowedCoverKey(exactPreviewKey)
        ? await resolveExistingImageStorageKeyWithFallback(exactPreviewKey)
        : null;
    const exactPreviewHead = exactPreviewResolvedKey
      ? await headObject(client, bucket, exactPreviewResolvedKey)
      : { exists: false, source: "missing", resolvedKey: null, meta: null };
    const exactPreviewExists = Boolean(exactPreviewResolvedKey && exactPreviewHead.exists);

    if (exactPreviewKey && exactPreviewExists) {
      const row: ReportRow = {
        releaseId: release.id,
        userId: release.userId,
        title: release.title,
        oldPreview: release.preview,
        exactPreviewKey: exactPreviewResolvedKey,
        exactPreviewExists: true,
        createdAt: null,
        updatedAt: null,
        releaseDate: release.date.toISOString(),
        possibleCandidates: [],
        lastModifiedCandidates: [],
        confidence: "high",
        reason:
          exactPreviewResolvedKey !== exactPreviewKey
            ? "exact preview recovered via shared image resolver"
            : exactPreviewHead.source === "list-case-insensitive"
            ? "same basename + same extension found case-insensitively in S3"
            : "exact preview key exists in S3",
        recommendedKey: exactPreviewResolvedKey,
        needsManualCover: false
      };

      reportRows.push(row);

      if (APPLY) {
        const nextRoles = cloneJson(asRecord(release.roles) ?? {});
        const nextSubmission = cloneJson(asRecord(nextRoles.submissionData) ?? {});
        const url = stableUrl(exactPreviewResolvedKey ?? exactPreviewKey);
        const filename =
          (exactPreviewResolvedKey ?? exactPreviewKey).split("/").filter(Boolean).at(-1) ??
          (exactPreviewResolvedKey ?? exactPreviewKey);
        nextRoles.coverUpload = {
          storageKey: exactPreviewResolvedKey ?? exactPreviewKey,
          url,
          path: exactPreviewResolvedKey ?? exactPreviewKey,
          name: filename,
          mimeType: exactPreviewHead.meta?.contentType ?? null,
          size: exactPreviewHead.meta?.contentLength ?? null
        };
        nextSubmission.coverUpload = {
          storageKey: exactPreviewResolvedKey ?? exactPreviewKey,
          url,
          path: exactPreviewResolvedKey ?? exactPreviewKey,
          name: filename,
          mimeType: exactPreviewHead.meta?.contentType ?? null,
          size: exactPreviewHead.meta?.contentLength ?? null
        };
        nextSubmission.cover = url;
        nextRoles.submissionData = nextSubmission;

        await prisma.release.update({
          where: { id: release.id },
          data: {
            preview: url,
            roles: nextRoles as never
          }
        });
        applyCount += 1;
      }

      continue;
    }

    const userScopedPrefixes = [
      `previews/${release.userId}/`,
      `uploads/${release.userId}/`,
      `covers/${release.userId}/`,
      `contracts/previews/${release.userId}/`,
      `contracts/uploads/${release.userId}/`,
      `contracts/covers/${release.userId}/`
    ];

    const userScopedCandidates: S3ObjectRow[] = [];
    for (const userPrefix of userScopedPrefixes) {
      let rows = uploadCache.get(userPrefix);
      if (!rows) {
        rows = await listPrefix(client, bucket, userPrefix);
        uploadCache.set(userPrefix, rows);
      }
      userScopedCandidates.push(...rows);
    }

    const sharedCandidates = Array.from(sharedPrefixCache.values()).flat();
    const uniqueCandidates = Array.from(
      new Map(
        [...userScopedCandidates, ...sharedCandidates].map((candidate) => [candidate.key, candidate])
      ).values()
    );
    const scored = uniqueCandidates
      .map((candidate) => scoreCandidate(release, candidate.key, candidate.lastModified))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return (right.lastModified ?? "").localeCompare(left.lastModified ?? "");
      });

    const top = scored[0] ?? null;
    const second = scored[1] ?? null;
    const highConfidence =
      top &&
      top.confidence === "high" &&
      ((getBaseNameWithoutExtension(top.key).toLowerCase() === release.id.toLowerCase() &&
        COVER_PREFIXES.some((prefix) => top.key.startsWith(prefix))) ||
        (top.key.startsWith(`uploads/${release.userId}/`) &&
          top.key.toLowerCase().includes("release-cover"))) &&
      (!second || second.score <= top.score - 60);

    const row: ReportRow = {
      releaseId: release.id,
      userId: release.userId,
      title: release.title,
      oldPreview: release.preview,
      exactPreviewKey,
      exactPreviewExists,
      createdAt: null,
      updatedAt: null,
      releaseDate: release.date.toISOString(),
      possibleCandidates: scored.slice(0, 12),
      lastModifiedCandidates: scored.slice(0, 12).map((candidate) => ({
        key: candidate.key,
        lastModified: candidate.lastModified
      })),
      confidence: highConfidence ? "high" : top?.confidence ?? "none",
      reason:
        highConfidence
          ? "single user upload release-cover candidate with strong time proximity"
          : top
            ? `candidate ambiguity or weak relation: ${top.reason}`
            : "no plausible S3 cover candidates found",
      recommendedKey: highConfidence ? top.key : null,
      needsManualCover: !highConfidence
    };

    reportRows.push(row);

    if (APPLY && row.recommendedKey) {
      const nextRoles = cloneJson(asRecord(release.roles) ?? {});
      const nextSubmission = cloneJson(asRecord(nextRoles.submissionData) ?? {});
      const url = stableUrl(row.recommendedKey);
      nextRoles.coverUpload = {
        storageKey: row.recommendedKey,
        url
      };
      nextSubmission.coverUpload = {
        storageKey: row.recommendedKey,
        url
      };
      nextSubmission.cover = url;
      nextRoles.submissionData = nextSubmission;

      await prisma.release.update({
        where: { id: release.id },
        data: {
          preview: url,
          roles: nextRoles as never
        }
      });
      applyCount += 1;
    }
  }

  const result = {
    mode: APPLY ? "apply" : "dry-run",
    scanned: filtered.length,
    matched: reportRows.length,
    highConfidence: reportRows.filter((row) => row.confidence === "high").length,
    needsManualCover: reportRows.filter((row) => row.needsManualCover).length,
    applied: applyCount,
    note: "release.createdAt/updatedAt columns do not exist in the current schema; release.date is used as the time anchor.",
    rows: reportRows
  };

  if (OUTPUT) {
    await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(JSON.stringify({ ...result, output: OUTPUT }, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
