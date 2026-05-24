import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
    return rawValue;
  }
  const useSsl = readBooleanEnv("S3_USE_SSL", true);
  return `${useSsl ? "https" : "http"}://${rawValue}`;
}

const endpoint = toEndpointUrl(readStringEnv("S3_ENDPOINT", "MINIO_ENDPOINT", "S3_HOST"));
const region = readStringEnv("S3_REGION") ?? "us-east-1";
const configuredBucket = readStringEnv(
  "S3_BUCKET",
  "S3_BUCKET_NAME",
  "MINIO_BUCKET",
  "MINIO_BUCKET_NAME"
);
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
const publicStorageBaseUrl = toEndpointUrl(
  readStringEnv("NEXT_PUBLIC_S3_URL", "S3_PUBLIC_URL", "S3_ENDPOINT", "MINIO_ENDPOINT", "S3_HOST")
);

const LEGACY_IMAGE_PREFIXES = ["", "previews/", "covers/", "uploads/"] as const;
const LEGACY_IMAGE_EXTENSIONS = [
  "jpg",
  "jpeg",
  "png",
  "webp",
  "jpng",
  "JPG",
  "JPEG",
  "PNG",
  "WEBP",
  "JPNG"
] as const;
const FALLBACK_BUCKET_CANDIDATES = ["uploads", "signatures", "verification", "contracts"] as const;
let resolvedBucketPromise: Promise<string | null> | null = null;
const storageHeadCache = new Map<string, boolean | null>();
const reachableImageCandidateCache = new Map<string, { url: string | null; failedReason: string | null }>();
const MAX_REACHABLE_CANDIDATE_CACHE_SIZE = 500;
const MAX_STORAGE_HEAD_CACHE_SIZE = 2000;
const MAX_REACHABLE_PROBE_CANDIDATES = 40;

function getUrlHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

const publicStorageHost = getUrlHost(publicStorageBaseUrl);
const endpointHost = getUrlHost(endpoint);

function isStorageAbsoluteUrl(value: string): boolean {
  const urlHost = getUrlHost(value);
  if (!urlHost) return false;
  return urlHost === publicStorageHost || urlHost === endpointHost;
}

function isPlaceholderValue(value: string | undefined): boolean {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.includes("example.com") ||
    normalized === "your_access_key" ||
    normalized === "your_secret_key"
  );
}

function getClient() {
  if (
    !endpoint ||
    !region ||
    !accessKeyId ||
    !secretAccessKey ||
    isPlaceholderValue(endpoint) ||
    isPlaceholderValue(accessKeyId) ||
    isPlaceholderValue(secretAccessKey)
  ) {
    return null;
  }

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
}

function buildBucketCandidates(): string[] {
  const candidates = [configuredBucket, ...FALLBACK_BUCKET_CANDIDATES]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(candidates));
}

function getDefaultBucketName(): string {
  return buildBucketCandidates()[0] ?? "uploads";
}

export function getStorageBucketHint(): string {
  return configuredBucket?.trim() || "uploads";
}

export function getStorageBucketCandidates(): string[] {
  return buildBucketCandidates();
}

async function canUseBucket(client: S3Client, bucketName: string): Promise<boolean> {
  try {
    await client.send(
      new HeadBucketCommand({
        Bucket: bucketName
      })
    );
    return true;
  } catch (error) {
    const code =
      typeof error === "object" && error && "name" in error
        ? String((error as { name?: string }).name ?? "")
        : "";
    const message = error instanceof Error ? error.message : "";
    if (/accessdenied|forbidden|403/i.test(`${code} ${message}`)) {
      return true;
    }
    return false;
  }
}

async function createBucketIfMissing(client: S3Client, bucketName: string): Promise<boolean> {
  try {
    await client.send(
      new CreateBucketCommand({
        Bucket: bucketName
      })
    );
    return true;
  } catch {
    return false;
  }
}

async function resolveBucketName(client: S3Client | null): Promise<string | null> {
  if (!client) return null;
  if (!resolvedBucketPromise) {
    resolvedBucketPromise = (async () => {
      const candidates = buildBucketCandidates();
      for (const bucketName of candidates) {
        if (await canUseBucket(client, bucketName)) {
          return bucketName;
        }
      }

      const createTarget = candidates[0] ?? "uploads";
      const created = await createBucketIfMissing(client, createTarget);
      if (created && (await canUseBucket(client, createTarget))) {
        return createTarget;
      }

      return null;
    })();
  }
  return resolvedBucketPromise;
}

function buildLocalObjectPath(key: string): string {
  return `/api/uploads/object/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function normalizeStorageKey(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;

  let normalized = raw;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      const parsed = new URL(normalized);
      normalized = parsed.pathname;
    } catch {
      // Keep as-is and fallback to regular sanitization below.
    }
  }

  normalized = normalized.replace(/^\/+/u, "");
  normalized = normalized.replace(/^api\/uploads\/object\/+/u, "");
  normalized = normalized.replace(/^uploads\/object\/+/u, "");
  normalized = normalized.replace(/^object\/+/u, "");

  if (!normalized) return null;
  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.includes("\\") ||
        segment.includes("/")
    )
  ) {
    return null;
  }
  return segments.join("/");
}

function splitFileNameParts(value: string): { baseName: string; extension: string | null } {
  const trimmed = value.trim();
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  const fileName = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";
  if (!fileName) return { baseName: "", extension: null };
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return { baseName: fileName, extension: null };
  }
  return {
    baseName: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex + 1)
  };
}

function extractFileNameLikeValue(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    try {
      const parsed = new URL(value);
      const fileName = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
      return fileName || null;
    } catch {
      return null;
    }
  }
  if (value.startsWith("/")) {
    const fileName = value.split("/").filter(Boolean).at(-1) ?? "";
    return fileName || null;
  }
  return value;
}

function isLikelyFilename(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return true;
  if (trimmed.startsWith("/")) return true;
  const normalized = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  if (normalized.includes("/")) return true;
  return /\.[a-z0-9]{2,8}$/iu.test(normalized);
}

function buildPublicUrlFromStorageKey(key: string): string {
  return resolvePublicStorageUrlFromKey(key) ?? buildLocalObjectPath(key);
}

interface LegacyImageCandidateEntry {
  key: string | null;
  url: string;
}

function buildLegacyImageCandidateEntries(input: {
  url?: string | null;
  storageKey?: string | null;
  extraStorageKeys?: string[] | null;
}): LegacyImageCandidateEntry[] {
  const entries: LegacyImageCandidateEntry[] = [];
  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();

  const pushEntry = (entry: LegacyImageCandidateEntry) => {
    const normalizedUrl = entry.url.trim();
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;
    seenUrls.add(normalizedUrl);
    if (entry.key) seenKeys.add(entry.key);
    entries.push({ key: entry.key, url: normalizedUrl });
  };

  const addStorageKey = (storageKey: string | null | undefined) => {
    const normalizedKey = normalizeStorageKey(storageKey ?? null);
    if (!normalizedKey || seenKeys.has(normalizedKey)) return;
    pushEntry({
      key: normalizedKey,
      url: buildPublicUrlFromStorageKey(normalizedKey)
    });
  };

  const directUrl = (input.url ?? "").trim();
  if (directUrl) {
    const resolvedDirect = resolveStoredFileUrl({ url: directUrl, storageKey: null });
    if (resolvedDirect) pushEntry({ key: null, url: resolvedDirect });
    if (
      directUrl.startsWith("http://") ||
      directUrl.startsWith("https://") ||
      directUrl.startsWith("/")
    ) {
      pushEntry({ key: null, url: directUrl });
    }
  }

  const directStorageKey = normalizeStorageKey(input.storageKey ?? null);
  if (directStorageKey) addStorageKey(directStorageKey);

  for (const extraKey of input.extraStorageKeys ?? []) {
    addStorageKey(extraKey);
  }

  const rawCandidates = [input.storageKey, input.url]
    .map((value) => (value ?? "").trim())
    .filter(Boolean);

  for (const rawCandidate of rawCandidates) {
    const normalizedFileNameValue = extractFileNameLikeValue(rawCandidate);
    if (!normalizedFileNameValue || !isLikelyFilename(normalizedFileNameValue)) continue;
    const { baseName, extension } = splitFileNameParts(normalizedFileNameValue);
    if (!baseName) continue;

    const extCandidates = new Set<string>();
    if (extension) extCandidates.add(extension);
    for (const ext of LEGACY_IMAGE_EXTENSIONS) extCandidates.add(ext);

    const fileNames = Array.from(extCandidates).map((ext) => `${baseName}.${ext}`);
    for (const fileName of fileNames) {
      for (const prefix of LEGACY_IMAGE_PREFIXES) {
        addStorageKey(`${prefix}${fileName}`);
      }
    }
  }

  return entries;
}

async function checkAbsoluteUrlExists(url: string): Promise<boolean> {
  if (!/^https?:\/\//u.test(url)) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store"
    });
    if (headResponse.ok) return true;
    if (headResponse.status !== 405) return false;
    const getResponse = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store"
    });
    return getResponse.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkStorageKeyExists(key: string): Promise<boolean | null> {
  const client = getClient();
  const bucketName = await resolveBucketName(client);
  if (!client || !bucketName) return null;
  const cacheKey = `${bucketName}:${key}`;
  if (storageHeadCache.has(cacheKey)) {
    return storageHeadCache.get(cacheKey) ?? null;
  }
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key
      })
    );
    if (storageHeadCache.size >= MAX_STORAGE_HEAD_CACHE_SIZE) {
      const firstKey = storageHeadCache.keys().next().value;
      if (firstKey) storageHeadCache.delete(firstKey);
    }
    storageHeadCache.set(cacheKey, true);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = typeof error === "object" && error && "name" in error ? String((error as { name?: string }).name ?? "") : "";
    if (/notfound|nosuchkey|404|no such key/i.test(`${code} ${message}`)) {
      if (storageHeadCache.size >= MAX_STORAGE_HEAD_CACHE_SIZE) {
        const firstKey = storageHeadCache.keys().next().value;
        if (firstKey) storageHeadCache.delete(firstKey);
      }
      storageHeadCache.set(cacheKey, false);
      return false;
    }
    if (/accessdenied|forbidden|403/i.test(`${code} ${message}`)) {
      if (storageHeadCache.size >= MAX_STORAGE_HEAD_CACHE_SIZE) {
        const firstKey = storageHeadCache.keys().next().value;
        if (firstKey) storageHeadCache.delete(firstKey);
      }
      storageHeadCache.set(cacheKey, null);
      return null;
    }
    if (storageHeadCache.size >= MAX_STORAGE_HEAD_CACHE_SIZE) {
      const firstKey = storageHeadCache.keys().next().value;
      if (firstKey) storageHeadCache.delete(firstKey);
    }
    storageHeadCache.set(cacheKey, null);
    return null;
  }
}

export function buildLegacyImageCandidateUrls(input: {
  url?: string | null;
  storageKey?: string | null;
  extraStorageKeys?: string[] | null;
}): string[] {
  return buildLegacyImageCandidateEntries(input).map((entry) => entry.url);
}

export async function resolveLegacyImageUrl(input: {
  url?: string | null;
  storageKey?: string | null;
  extraStorageKeys?: string[] | null;
}): Promise<{ url: string | null; candidateUrls: string[] }> {
  const entries = buildLegacyImageCandidateEntries(input);
  if (entries.length === 0) return { url: null, candidateUrls: [] };

  for (const entry of entries) {
    if (entry.key) {
      const exists = await checkStorageKeyExists(entry.key);
      if (exists === true) {
        return { url: entry.url, candidateUrls: entries.map((item) => item.url) };
      }
      if (exists === false && !/^https?:\/\//u.test(entry.url)) continue;
    }

    if (/^https?:\/\//u.test(entry.url)) {
      const exists = await checkAbsoluteUrlExists(entry.url);
      if (exists) {
        return { url: entry.url, candidateUrls: entries.map((item) => item.url) };
      }
    }
  }

  return {
    url: entries[0]?.url ?? null,
    candidateUrls: entries.map((entry) => entry.url)
  };
}

export async function resolveFirstReachableImageUrlFromCandidates(
  candidateUrls: string[]
): Promise<string | null> {
  const resolved = await resolveFirstReachableImageCandidateFromCandidates(candidateUrls);
  return resolved.url;
}

export async function resolveFirstReachableImageCandidateFromCandidates(
  candidateUrls: string[]
): Promise<{ url: string | null; failedReason: string | null }> {
  const urls = Array.from(new Set(candidateUrls.map((item) => item.trim()).filter(Boolean)));
  if (urls.length === 0) {
    return { url: null, failedReason: "no-candidates" };
  }
  const cacheKey = urls.join("\n");
  const cached = reachableImageCandidateCache.get(cacheKey);
  if (cached) return cached;

  const errors: string[] = [];

  const probeUrls = urls.slice(0, MAX_REACHABLE_PROBE_CANDIDATES);
  for (const url of probeUrls) {
    if (/^https?:\/\//u.test(url)) {
      if (isStorageAbsoluteUrl(url)) {
        const exists = await checkAbsoluteUrlExists(url);
        if (exists) {
          const result = { url, failedReason: null };
          if (reachableImageCandidateCache.size >= MAX_REACHABLE_CANDIDATE_CACHE_SIZE) {
            const firstKey = reachableImageCandidateCache.keys().next().value;
            if (firstKey) reachableImageCandidateCache.delete(firstKey);
          }
          reachableImageCandidateCache.set(cacheKey, result);
          return result;
        }
        errors.push(`not-reachable:${url}`);
        continue;
      }
      // External absolute URLs are treated as authoritative read targets.
      const result = { url, failedReason: null };
      if (reachableImageCandidateCache.size >= MAX_REACHABLE_CANDIDATE_CACHE_SIZE) {
        const firstKey = reachableImageCandidateCache.keys().next().value;
        if (firstKey) reachableImageCandidateCache.delete(firstKey);
      }
      reachableImageCandidateCache.set(cacheKey, result);
      return result;
    }

    const key = normalizeStorageKey(url);
    if (!key) {
      errors.push(`invalid-key:${url}`);
      continue;
    }

    const exists = await checkStorageKeyExists(key);
    if (exists === true) {
      const result = { url, failedReason: null };
      if (reachableImageCandidateCache.size >= MAX_REACHABLE_CANDIDATE_CACHE_SIZE) {
        const firstKey = reachableImageCandidateCache.keys().next().value;
        if (firstKey) reachableImageCandidateCache.delete(firstKey);
      }
      reachableImageCandidateCache.set(cacheKey, result);
      return result;
    }
    if (exists === false) {
      errors.push(`not-found:${key}`);
      continue;
    }

    // HeadObject unavailable/forbidden: keep URL usable for frontend fallback.
    const result = { url, failedReason: null };
    if (reachableImageCandidateCache.size >= MAX_REACHABLE_CANDIDATE_CACHE_SIZE) {
      const firstKey = reachableImageCandidateCache.keys().next().value;
      if (firstKey) reachableImageCandidateCache.delete(firstKey);
    }
    reachableImageCandidateCache.set(cacheKey, result);
    return result;
  }

  const result = {
    url: null,
    failedReason: errors.length > 0 ? errors.join("; ") : "no-reachable-candidates"
  };
  if (reachableImageCandidateCache.size >= MAX_REACHABLE_CANDIDATE_CACHE_SIZE) {
    const firstKey = reachableImageCandidateCache.keys().next().value;
    if (firstKey) reachableImageCandidateCache.delete(firstKey);
  }
  reachableImageCandidateCache.set(cacheKey, result);
  return result;
}

export function resolvePublicStorageUrlFromKey(key: string): string | null {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey || !publicStorageBaseUrl) return null;
  return resolvePublicStorageUrlFromBucketKey(undefined, normalizedKey);
}

export function resolvePublicStorageUrlFromBucketKey(
  bucketName: string | null | undefined,
  key: string
): string | null {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey || !publicStorageBaseUrl) return null;
  const encodedKey = normalizedKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  try {
    const parsedBase = new URL(publicStorageBaseUrl);
    const pathSegments = parsedBase.pathname.split("/").filter(Boolean);
    const normalizedBucket = (bucketName ?? "").trim();
    if (normalizedBucket) {
      const lastSegment = pathSegments[pathSegments.length - 1];
      if (lastSegment !== normalizedBucket) {
        pathSegments.push(normalizedBucket);
      }
    }
    const prefix = pathSegments.join("/");
    const base = `${parsedBase.origin}/${prefix}`.replace(/\/+$/u, "");
    return `${base}/${encodedKey}`;
  } catch {
    const base = publicStorageBaseUrl.replace(/\/+$/u, "");
    return `${base}/${encodedKey}`;
  }
}

export function resolveStoredFileUrl(input: {
  url?: string | null;
  storageKey?: string | null;
}): string | null {
  const directUrl = (input.url ?? "").trim();
  if (directUrl) {
    if (
      directUrl.startsWith("/") ||
      directUrl.startsWith("http://") ||
      directUrl.startsWith("https://")
    ) {
      return directUrl;
    }
    if (directUrl.includes("/")) {
      return resolvePublicStorageUrlFromKey(directUrl) ?? buildLocalObjectPath(directUrl);
    }
  }

  const key = normalizeStorageKey(input.storageKey ?? null);
  if (!key) return null;
  return resolvePublicStorageUrlFromKey(key) ?? buildLocalObjectPath(key);
}

function buildLocalDownloadUrl(input: {
  key: string;
  responseContentDisposition?: string;
  responseContentType?: string;
}): string {
  const url = new URL(buildLocalObjectPath(input.key), "http://localhost");
  if (input.responseContentDisposition) {
    url.searchParams.set("contentDisposition", input.responseContentDisposition);
  }
  if (input.responseContentType) {
    url.searchParams.set("contentType", input.responseContentType);
  }
  return `${url.pathname}${url.search}`;
}

function buildPathStyleStorageUrl(bucketName: string, key: string): string | null {
  if (!endpoint) return null;
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const base = endpoint.replace(/\/+$/u, "");
  return `${base}/${bucketName}/${encodedKey}`;
}

function logS3UploadConfigDebug(bucketValue?: string | null): void {
  const accessKey = readStringEnv(
    "S3_ACCESS_KEY_ID",
    "S3_ACCESS_KEY",
    "MINIO_ACCESS_KEY",
    "MINIO_ROOT_USER"
  );
  const secretKey = readStringEnv(
    "S3_SECRET_ACCESS_KEY",
    "S3_SECRET_KEY",
    "MINIO_SECRET_KEY",
    "MINIO_ROOT_PASSWORD"
  );
  console.log("[s3-upload-config-debug]", {
    endpoint,
    publicBaseUrl: publicStorageBaseUrl,
    accessKeyPresent: !!accessKey,
    secretKeyPresent: !!secretKey,
    bucket: bucketValue ?? configuredBucket ?? getDefaultBucketName(),
    rawS3Host: process.env.S3_HOST,
    rawS3Endpoint: process.env.S3_ENDPOINT,
    rawMinioEndpoint: process.env.MINIO_ENDPOINT,
    rawPublicS3: process.env.NEXT_PUBLIC_S3_URL
  });
}

export async function uploadObjectToStorage(input: {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}): Promise<{ bucket: string; key: string; url: string }> {
  const client = getClient();
  const bucketName = await resolveBucketName(client);
  const normalizedKey = normalizeStorageKey(input.key);
  if (!normalizedKey) {
    throw new Error("Invalid storage key");
  }

  const bucketForUpload = bucketName ?? (client ? getDefaultBucketName() : null);
  if (!client || !bucketForUpload) {
    logS3UploadConfigDebug(bucketForUpload);
    throw new Error(
      "S3/MinIO upload is not configured. Required env: S3_HOST, S3_ACCESS_KEY (or MINIO_ROOT_USER), S3_SECRET_KEY (or MINIO_ROOT_PASSWORD)."
    );
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucketForUpload,
      Key: normalizedKey,
      Body: input.body,
      ContentType: input.contentType
    })
  );

  const url =
    resolvePublicStorageUrlFromBucketKey(bucketForUpload, normalizedKey) ??
    buildPathStyleStorageUrl(bucketForUpload, normalizedKey) ??
    "";
  if (!url) {
    throw new Error("S3 object uploaded, but public URL could not be resolved.");
  }

  console.log("[signature-upload-success]", {
    bucket: bucketForUpload,
    key: normalizedKey,
    publicUrl: url
  });

  return {
    bucket: bucketForUpload,
    key: normalizedKey,
    url
  };
}

export async function createPresignedUpload(input: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  const client = getClient();
  const bucketName = await resolveBucketName(client);
  const normalizedKey = normalizeStorageKey(input.key);
  if (!normalizedKey) {
    throw new Error("Invalid storage key");
  }

  const bucketForSigning = bucketName ?? (client ? getDefaultBucketName() : null);

  if (!client || !bucketForSigning) {
    logS3UploadConfigDebug(bucketForSigning);
    throw new Error(
      "S3/MinIO upload is not configured. Required env: S3_HOST, S3_ACCESS_KEY (or MINIO_ROOT_USER), S3_SECRET_KEY (or MINIO_ROOT_PASSWORD)."
    );
  }

  const command = new PutObjectCommand({
    Bucket: bucketForSigning,
    Key: normalizedKey,
    ContentType: input.contentType
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: input.expiresIn ?? 600
  });

  return {
    url,
    method: "PUT",
    fields: {},
    mock: false
  };
}

export async function createPresignedDownload(input: {
  key: string;
  bucket?: string;
  expiresIn?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
}): Promise<{ url: string; mock: boolean }> {
  const client = getClient();
  const requestedBucket = (input.bucket ?? "").trim();
  const bucketName = requestedBucket || (await resolveBucketName(client));
  const normalizedKey = normalizeStorageKey(input.key);
  if (!normalizedKey) {
    throw new Error("Invalid storage key");
  }

  const bucketForDownload = bucketName || (client ? getDefaultBucketName() : null);

  if (!client || !bucketForDownload) {
    const publicUrl = resolvePublicStorageUrlFromBucketKey(
      bucketForDownload ?? requestedBucket ?? undefined,
      normalizedKey
    );
    return {
      url:
        publicUrl ??
        buildLocalDownloadUrl({
          ...input,
          key: normalizedKey
        }),
      mock: false
    };
  }

  const command = new GetObjectCommand({
    Bucket: bucketForDownload,
    Key: normalizedKey,
    ResponseContentDisposition: input.responseContentDisposition,
    ResponseContentType: input.responseContentType
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: input.expiresIn ?? 600
  });

  return {
    url,
    mock: false
  };
}
