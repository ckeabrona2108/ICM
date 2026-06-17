import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
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
const region = readStringEnv("S3_REGION") ?? "ru";
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

export const ALLOWED_S3_MEDIA_PREFIXES = [
  "",
  "previews/",
  "covers/",
  "uploads/",
  "contracts/previews/",
  "contracts/covers/",
  "contracts/uploads/"
] as const;
export const ALLOWED_S3_IMAGE_PREFIXES = ALLOWED_S3_MEDIA_PREFIXES.filter((prefix) => prefix.length > 0);
export const LEGACY_AUDIO_PREFIXES = ["tracks/", "audio/", "audios/", "contracts/tracks/"] as const;
export const ALLOWED_S3_AUDIO_CANDIDATE_PREFIXES = [
  "tracks/",
  "uploads/",
  "contracts/tracks/",
  "contracts/uploads/",
  "previews/",
  "covers/",
  "contracts/previews/",
  "contracts/covers/",
  "audio/",
  "audios/"
] as const;
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"] as const;
const ALLOWED_AUDIO_EXTENSIONS = [".wav"] as const;
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
const storagePrefixListCache = new Map<string, string[]>();
const reachableImageCandidateCache = new Map<string, { url: string | null; failedReason: string | null }>();
const MAX_REACHABLE_CANDIDATE_CACHE_SIZE = 500;
const MAX_STORAGE_HEAD_CACHE_SIZE = 2000;
const MAX_REACHABLE_PROBE_CANDIDATES = 40;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "jpng", "gif", "avif"]);

const ALLOWED_MEDIA_EXTENSIONS = [...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_AUDIO_EXTENSIONS] as const;

export type StorageHeadDebugResult = {
  bucket: string | null;
  endpoint: string | null;
  region: string | null;
  forcePathStyle: true;
  key: string;
  exists: boolean | null;
  errorName: string | null;
  errorCode: string | null;
  httpStatusCode: number | null;
  message: string | null;
};

type ImageCaseVariantDebug = {
  originalKey: string;
  normalizedBasename: string | null;
  caseVariantMatch: boolean;
  matchedKey: string | null;
};

export function isAllowedS3Prefix(key: string): boolean {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey) return false;
  return ALLOWED_S3_IMAGE_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix));
}

export function isAllowedImageFile(key: string): boolean {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey || !isAllowedS3Prefix(normalizedKey)) return false;
  const lowerKey = normalizedKey.toLowerCase();
  return ALLOWED_IMAGE_EXTENSIONS.some((ext) => lowerKey.endsWith(ext));
}

export function isAllowedAudioFile(key: string): boolean {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey) return false;
  const hasAllowedPrefix =
    isAllowedS3Prefix(normalizedKey) ||
    LEGACY_AUDIO_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix));
  if (!hasAllowedPrefix) return false;
  const lowerKey = normalizedKey.toLowerCase();
  return ALLOWED_AUDIO_EXTENSIONS.some((ext) => lowerKey.endsWith(ext));
}

export function isAllowedMediaFile(key: string): boolean {
  return isAllowedImageFile(key) || isAllowedAudioFile(key);
}

export function isAllowedMediaExtension(key: string): boolean {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey) return false;
  const lowerKey = normalizedKey.toLowerCase();
  return ALLOWED_MEDIA_EXTENSIONS.some((ext) => lowerKey.endsWith(ext));
}

export function getBaseNameWithoutExtension(key: string): string | null {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey) return null;
  const fileName = normalizedKey.split("/").filter(Boolean).at(-1) ?? "";
  if (!fileName) return null;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0) return fileName || null;
  return fileName.slice(0, dotIndex) || null;
}

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
const STORAGE_MEDIA_HOSTS = new Set(
  [publicStorageHost, endpointHost, "s3.icecreammusic.net"].filter((value): value is string => Boolean(value))
);

function isStorageAbsoluteUrl(value: string): boolean {
  const urlHost = getUrlHost(value);
  if (!urlHost) return false;
  return STORAGE_MEDIA_HOSTS.has(urlHost);
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

export function buildLocalObjectUrl(key: string): string | null {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey) return null;
  return buildLocalObjectPath(normalizedKey);
}

function decodePathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
}

function extractRenderableStorageKey(rawValue: string): string | null {
  const raw = rawValue.trim();
  if (!raw) return null;

  if (raw.startsWith("/api/uploads/object/") || raw.startsWith("api/uploads/object/")) {
    const stripped = raw.replace(/^\/?api\/uploads\/object\/+/u, "").split("?")[0]?.split("#")[0] ?? "";
    return normalizeStorageKey(decodePathSegments(stripped).join("/"));
  }

  if (raw.startsWith("/api/storage/preview") || raw.startsWith("api/storage/preview")) {
    const query = raw.split("?")[1] ?? "";
    const key = new URLSearchParams(query).get("key");
    return normalizeStorageKey(key);
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      if (!isStorageAbsoluteUrl(raw)) return null;
      return normalizeStorageKey(decodePathSegments(parsed.pathname).join("/"));
    } catch {
      return null;
    }
  }

  return normalizeStorageKey(raw);
}

export function resolveRenderableStoredFileUrl(input: {
  url?: string | null;
  storageKey?: string | null;
}): string | null {
  const normalizedKey = normalizeStorageKey(input.storageKey ?? null);
  if (normalizedKey) return buildLocalObjectPath(normalizedKey);

  const directUrl = (input.url ?? "").trim();
  if (!directUrl) return null;
  if (directUrl.startsWith("/api/uploads/object/")) return directUrl;
  if (directUrl.startsWith("api/uploads/object/")) return `/${directUrl}`;

  const renderableStorageKey = extractRenderableStorageKey(directUrl);
  if (renderableStorageKey) return buildLocalObjectPath(renderableStorageKey);

  if (directUrl.startsWith("http://") || directUrl.startsWith("https://")) {
    if (isStorageAbsoluteUrl(directUrl)) {
      return null;
    }
    return directUrl;
  }

  if (directUrl.startsWith("/")) {
    return directUrl;
  }

  if (directUrl.includes("/")) {
    return buildLocalObjectPath(directUrl);
  }

  return resolveStoredFileUrl({ url: directUrl, storageKey: null });
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

function getStorageKeyParentPrefix(key: string): string | null {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey) return null;
  const segments = normalizedKey.split("/").filter(Boolean);
  if (segments.length <= 1) return null;
  return `${segments.slice(0, -1).join("/")}/`;
}

function logImageCaseVariantDebug(input: ImageCaseVariantDebug): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("[storage-debug:image-case-variant]", input);
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
      for (const prefix of ALLOWED_S3_MEDIA_PREFIXES) {
        addStorageKey(`${prefix}${fileName}`);
      }
    }
  }

  return entries;
}

async function checkAbsoluteUrlExists(url: string): Promise<boolean | null> {
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
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_DOMAIN?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000"
  );
}

function toAbsoluteAppRouteUrl(url: string): string {
  return new URL(url, getAppOrigin()).href;
}

async function checkStorageKeyExists(key: string): Promise<boolean | null> {
  const client = getClient();
  const bucketName = await resolveBucketName(client);
  if (!client || !bucketName) return null;
  const cacheKey = `${bucketName}:${key}`;
  
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

export async function headStorageObjectDebug(key: string): Promise<StorageHeadDebugResult> {
  const normalizedKey = normalizeStorageKey(key) ?? key;
  const client = getClient();
  const bucketName = client ? await resolveBucketName(client) : null;
  const baseResult: StorageHeadDebugResult = {
    bucket: bucketName,
    endpoint: endpoint ?? null,
    region: region ?? null,
    forcePathStyle: true,
    key: normalizedKey,
    exists: null,
    errorName: null,
    errorCode: null,
    httpStatusCode: null,
    message: null
  };

  if (!client || !bucketName) {
    return {
      ...baseResult,
      exists: null,
      message: "S3 client or bucket is unavailable"
    };
  }

  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: normalizedKey
      })
    );
    return {
      ...baseResult,
      exists: true
    };
  } catch (error) {
    const errorName =
      error instanceof Error
        ? error.name
        : typeof error === "object" && error && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : null;
    const errorCode =
      typeof error === "object" && error && "Code" in error
        ? String((error as { Code?: unknown }).Code ?? "")
        : typeof error === "object" && error && "code" in error
          ? String((error as { code?: unknown }).code ?? "")
          : null;
    const httpStatusCode =
      typeof error === "object" &&
      error &&
      "$metadata" in error &&
      typeof (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode === "number"
        ? Number((error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode)
        : null;
    const message = error instanceof Error ? error.message : String(error);
    const exists =
      /notfound|nosuchkey|404|no such key/i.test(`${errorName ?? ""} ${errorCode ?? ""} ${message}`)
        ? false
        : /accessdenied|forbidden|403/i.test(`${errorName ?? ""} ${errorCode ?? ""} ${message}`)
          ? null
          : null;

    return {
      ...baseResult,
      exists,
      errorName,
      errorCode,
      httpStatusCode,
      message
    };
  }
}

async function probePublicStorageHeadStatus(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store"
    });
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function imageObjectExistsWithPublicFallback(key: string): Promise<boolean | null> {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey || !isAllowedImageFile(normalizedKey)) return false;

  const head = await headStorageObjectDebug(normalizedKey);
  if (head.exists === true) return true;
  if (
    head.httpStatusCode !== 404 &&
    !/NoSuchKey|NotFound/i.test(head.errorCode ?? "") &&
    !/not found/i.test(head.message ?? "")
  ) {
    return head.exists;
  }

  const publicUrl = resolvePublicStorageUrlFromKey(normalizedKey);
  if (!publicUrl) return false;
  const status = await probePublicStorageHeadStatus(publicUrl);
  return status === 200 ? true : false;
}

export async function resolveExistingImageStorageKeyWithFallback(key: string): Promise<string | null> {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey || !isAllowedImageFile(normalizedKey)) return null;
  const normalizedBasename = getBaseNameWithoutExtension(normalizedKey)?.toLowerCase() ?? null;
  const requestedExtension = splitFileNameParts(normalizedKey).extension?.toLowerCase() ?? null;

  const head = await headStorageObjectDebug(normalizedKey);
  if (head.exists === true) {
    logImageCaseVariantDebug({
      originalKey: normalizedKey,
      normalizedBasename,
      caseVariantMatch: false,
      matchedKey: normalizedKey
    });
    return normalizedKey;
  }

  const parentPrefix = getStorageKeyParentPrefix(normalizedKey);
  if (parentPrefix) {
    const siblingKeys = await listStorageKeysByPrefix(parentPrefix);
    const imageSiblingKeys = siblingKeys.filter((candidateKey) => isAllowedImageFile(candidateKey));
    const exactLowercaseMatches = Array.from(
      new Set(
        imageSiblingKeys.filter(
          (candidateKey) =>
            candidateKey.toLowerCase() === normalizedKey.toLowerCase()
        )
      )
    );
    if (exactLowercaseMatches.length === 1) {
      const matchedKey = exactLowercaseMatches[0] ?? null;
      logImageCaseVariantDebug({
        originalKey: normalizedKey,
        normalizedBasename,
        caseVariantMatch: matchedKey !== normalizedKey,
        matchedKey
      });
      return matchedKey;
    }

    const sameBasenameMatches = Array.from(
      new Set(
        imageSiblingKeys.filter((candidateKey) => {
          const candidateBasename = getBaseNameWithoutExtension(candidateKey)?.toLowerCase() ?? null;
          return Boolean(normalizedBasename && candidateBasename === normalizedBasename);
        })
      )
    );
    const sameExtensionMatches = sameBasenameMatches.filter((candidateKey) => {
      const candidateExtension = splitFileNameParts(candidateKey).extension?.toLowerCase() ?? null;
      return candidateExtension === requestedExtension;
    });

    if (sameExtensionMatches.length === 1) {
      const matchedKey = sameExtensionMatches[0] ?? null;
      logImageCaseVariantDebug({
        originalKey: normalizedKey,
        normalizedBasename,
        caseVariantMatch: matchedKey !== normalizedKey,
        matchedKey
      });
      return matchedKey;
    }

    if (sameBasenameMatches.length === 1) {
      const matchedKey = sameBasenameMatches[0] ?? null;
      logImageCaseVariantDebug({
        originalKey: normalizedKey,
        normalizedBasename,
        caseVariantMatch: matchedKey !== normalizedKey,
        matchedKey
      });
      return matchedKey;
    }
  }

  if (
    head.httpStatusCode !== 404 &&
    !/NoSuchKey|NotFound/i.test(head.errorCode ?? "") &&
    !/not found/i.test(head.message ?? "")
  ) {
    return null;
  }

  const publicUrl = resolvePublicStorageUrlFromKey(normalizedKey);
  if (!publicUrl) return null;
  const status = await probePublicStorageHeadStatus(publicUrl);
  const matchedKey = status === 200 ? normalizedKey : null;
  logImageCaseVariantDebug({
    originalKey: normalizedKey,
    normalizedBasename,
    caseVariantMatch: false,
    matchedKey
  });
  return matchedKey;
}

export async function objectExists(key: string): Promise<boolean | null> {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey) return false;
  return checkStorageKeyExists(normalizedKey);
}

export async function findExistingS3ObjectKeyFallback(requestedKey: string): Promise<string | null> {
  const normalizedRequestedKey = normalizeStorageKey(requestedKey);
  if (!normalizedRequestedKey) return null;

  const requestedBaseName = getBaseNameWithoutExtension(normalizedRequestedKey)?.toLowerCase();
  if (!requestedBaseName) return null;

  const requestedParts = normalizedRequestedKey.split("/").filter(Boolean);
  const requestedFileName = requestedParts.at(-1)?.toLowerCase() ?? "";
  const requestedRelativePath = ALLOWED_S3_IMAGE_PREFIXES.find((prefix) => normalizedRequestedKey.startsWith(prefix))
    ? normalizedRequestedKey.slice(ALLOWED_S3_IMAGE_PREFIXES.find((prefix) => normalizedRequestedKey.startsWith(prefix))!.length)
    : null;
  const requestedRelativeDir = requestedRelativePath?.split("/").slice(0, -1).join("/") ?? null;
  const allCandidateKeys = Array.from(
    new Set((await Promise.all(ALLOWED_S3_IMAGE_PREFIXES.map((prefix) => listStorageKeysByPrefix(prefix)))).flat())
  ).filter((candidateKey) => isAllowedS3Prefix(candidateKey) && isAllowedMediaExtension(candidateKey));

  const uniqueOrNull = (matches: string[]): string | null => {
    const uniqueMatches = Array.from(new Set(matches));
    return uniqueMatches.length === 1 ? (uniqueMatches[0] ?? null) : null;
  };

  if (requestedRelativePath) {
    const exactRelativeMatches = allCandidateKeys.filter((candidateKey) => {
      const candidatePrefix = ALLOWED_S3_IMAGE_PREFIXES.find((prefix) => candidateKey.startsWith(prefix));
      if (!candidatePrefix) return false;
      const candidateRelativePath = candidateKey.slice(candidatePrefix.length);
      return candidateRelativePath.toLowerCase() === requestedRelativePath.toLowerCase();
    });
    const exactRelativeMatch = uniqueOrNull(exactRelativeMatches);
    if (exactRelativeMatch) return exactRelativeMatch;

    const sameFolderBaseNameMatches = allCandidateKeys.filter((candidateKey) => {
      const candidatePrefix = ALLOWED_S3_IMAGE_PREFIXES.find((prefix) => candidateKey.startsWith(prefix));
      if (!candidatePrefix) return false;
      const candidateRelativePath = candidateKey.slice(candidatePrefix.length);
      const candidateRelativeDir = candidateRelativePath.split("/").slice(0, -1).join("/");
      const candidateBaseName = getBaseNameWithoutExtension(candidateKey)?.toLowerCase();
      return candidateRelativeDir === (requestedRelativeDir ?? "") && candidateBaseName === requestedBaseName;
    });
    const sameFolderBaseNameMatch = uniqueOrNull(sameFolderBaseNameMatches);
    if (sameFolderBaseNameMatch) return sameFolderBaseNameMatch;
  }

  const exactFileNameMatches = allCandidateKeys.filter((candidateKey) => {
    const candidateFileName = candidateKey.split("/").filter(Boolean).at(-1)?.toLowerCase() ?? "";
    return candidateFileName === requestedFileName;
  });
  const exactFileNameMatch = uniqueOrNull(exactFileNameMatches);
  if (exactFileNameMatch) return exactFileNameMatch;

  const baseNameMatches = allCandidateKeys.filter((candidateKey) => {
    const candidateBaseName = getBaseNameWithoutExtension(candidateKey)?.toLowerCase();
    return candidateBaseName === requestedBaseName;
  });
  const baseNameMatch = uniqueOrNull(baseNameMatches);
  if (baseNameMatch) return baseNameMatch;

  return null;
}


type RootFilenameDiscoveryResult = {
  key: string | null;
  ambiguous: boolean;
  candidates: string[];
};

export async function discoverStorageKeyByRootFilename(input: {
  kind: "cover" | "audio";
  filenames: Array<unknown>;
}): Promise<RootFilenameDiscoveryResult> {
  const fileNames = Array.from(
    new Set(
      input.filenames
        .map((value) => {
          if (typeof value !== "string") return null;
          const fileName = extractFileNameLikeValue(value);
          return fileName?.trim() || null;
        })
        .filter((value): value is string => Boolean(value))
    )
  );

  if (fileNames.length === 0) {
    return { key: null, ambiguous: false, candidates: [] };
  }

  const prefixes =
    input.kind === "cover"
      ? [...ALLOWED_S3_IMAGE_PREFIXES]
      : [...ALLOWED_S3_AUDIO_CANDIDATE_PREFIXES];
  const candidates = Array.from(new Set(fileNames.flatMap((fileName) => prefixes.map((prefix) => `${prefix}${fileName}`))));

  const matches: string[] = [];
  for (const candidate of candidates) {
    const exists = await checkStorageKeyExists(candidate);
    if (exists === true) {
      matches.push(candidate);
    }
  }

  const uniqueMatches = Array.from(new Set(matches)).sort((left, right) => left.localeCompare(right));
  if (uniqueMatches.length === 0) return { key: null, ambiguous: false, candidates };
  if (uniqueMatches.length > 1) return { key: null, ambiguous: true, candidates: uniqueMatches };
  return { key: uniqueMatches[0] ?? null, ambiguous: false, candidates: uniqueMatches };
}


type SiblingFolderDiscoveryResult = {
  key: string | null;
  ambiguous: boolean;
  candidates: string[];
};

export async function discoverStorageKeyBySiblingFolder(input: {
  kind: "cover" | "audio";
  candidates: Array<unknown>;
}): Promise<SiblingFolderDiscoveryResult> {
  const normalizedKeys = Array.from(
    new Set(
      input.candidates
        .map((value) => (typeof value === "string" ? normalizeStorageKey(value) : null))
        .filter((value): value is string => Boolean(value))
    )
  );


  const siblingCandidates: string[] = [];
  const seen = new Set<string>();

  const pushCandidate = (candidateKey: string) => {
    const normalized = normalizeStorageKey(candidateKey);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    siblingCandidates.push(normalized);
  };

  for (const key of normalizedKeys) {
    const parts = key.split("/").filter(Boolean);
    if (parts.length < 3) continue;

    const prefix = parts[0];
    const baseName = parts.at(-1) ?? "";

    if (input.kind === "cover") {
      const isContractPath = prefix === "contracts";
      const coverPrefix = isContractPath ? (parts[1] ?? "") : prefix;
      if (isContractPath ? !["previews", "uploads", "covers"].includes(coverPrefix) : !["previews", "uploads", "covers"].includes(coverPrefix)) {
        continue;
      }
      const folder = isContractPath ? parts.slice(2, -1).join("/") : parts.slice(1, -1).join("/");
      if (!folder || !baseName) continue;
      const siblingPrefixes = isContractPath
        ? ["contracts/previews", "contracts/uploads", "contracts/covers"]
        : ["previews", "uploads", "covers"];
      for (const siblingPrefix of siblingPrefixes) {
        if (siblingPrefix === prefix) continue;
        pushCandidate(`${siblingPrefix}/${folder}/${baseName}`);
      }
      continue;
    }

    const isContractPath = prefix === "contracts";
    const trackPrefix = isContractPath ? (parts[1] ?? "") : prefix;
    if (trackPrefix !== "tracks") continue;
    const folder = isContractPath ? parts.slice(2, -1).join("/") : parts.slice(1, -1).join("/");
    if (!folder || !baseName) continue;
    pushCandidate(`${isContractPath ? "contracts/uploads" : "uploads"}/${folder}/${baseName}`);
  }

  if (siblingCandidates.length === 0) {
    return { key: null, ambiguous: false, candidates: [] };
  }

  const matches: string[] = [];
  for (const candidate of siblingCandidates) {
    const exists = await checkStorageKeyExists(candidate);
    if (exists === true) {
      matches.push(candidate);
    }
  }

  const uniqueMatches = Array.from(new Set(matches)).sort((left, right) => left.localeCompare(right));
  if (uniqueMatches.length === 0) return { key: null, ambiguous: false, candidates: siblingCandidates };
  if (uniqueMatches.length > 1) return { key: null, ambiguous: true, candidates: uniqueMatches };
  return { key: uniqueMatches[0] ?? null, ambiguous: false, candidates: uniqueMatches };
}

export type StorageProbeDiagnosis = "ok" | "missing_file" | "broken_db_path" | "access_denied" | "no_preview";

export type StorageProbeResult = {
  storageKey: string;
  publicUrl: string | null;
  publicHttpStatus: number | null;
  sdkHeadExists: boolean | null;
  appRouteUrl: string;
  appRouteHttpStatus: number | null;
  finalDiagnosis: StorageProbeDiagnosis;
};

async function probeHttpStatus(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store"
    });
    return response.status;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function classifyStorageProbe(input: {
  publicHttpStatus: number | null;
  sdkHeadExists: boolean | null;
  appRouteHttpStatus: number | null;
  hasStorageKey: boolean;
}): StorageProbeDiagnosis {
  if (!input.hasStorageKey) return "broken_db_path";
  if (input.sdkHeadExists === true || input.appRouteHttpStatus === 200 || input.appRouteHttpStatus === 206) {
    return "ok";
  }
  if (input.sdkHeadExists === false || input.appRouteHttpStatus === 404 || input.appRouteHttpStatus === 410) {
    return "missing_file";
  }
  if (input.publicHttpStatus === 403 || input.appRouteHttpStatus === 403) {
    return "access_denied";
  }
  if (
    input.publicHttpStatus == null &&
    input.sdkHeadExists == null &&
    input.appRouteHttpStatus == null
  ) {
    return "broken_db_path";
  }
  if (
    input.publicHttpStatus === 400 ||
    input.publicHttpStatus === 401 ||
    input.publicHttpStatus === 405 ||
    input.publicHttpStatus === 422 ||
    (input.publicHttpStatus != null && input.publicHttpStatus >= 500) ||
    input.appRouteHttpStatus === 400 ||
    input.appRouteHttpStatus === 401 ||
    input.appRouteHttpStatus === 405 ||
    input.appRouteHttpStatus === 422 ||
    (input.appRouteHttpStatus != null && input.appRouteHttpStatus >= 500)
  ) {
    return "broken_db_path";
  }
  return "access_denied";
}

export async function probeStorageKeyDiagnostics(input: {
  storageKey: string | null | undefined;
  publicUrl?: string | null;
}): Promise<StorageProbeResult> {
  const normalizedKey = normalizeStorageKey(input.storageKey ?? null);
  const appRouteUrl = normalizedKey
    ? new URL(buildLocalObjectPath(normalizedKey), "http://localhost:3000").href
    : new URL("/api/uploads/object/", "http://localhost:3000").href;
  const publicUrl = (input.publicUrl ?? "").trim() || null;
  const [publicHttpStatus, sdkHeadExists, appRouteHttpStatus] = await Promise.all([
    publicUrl ? probeHttpStatus(publicUrl) : Promise.resolve(null),
    normalizedKey ? checkStorageKeyExists(normalizedKey) : Promise.resolve(null),
    normalizedKey ? probeHttpStatus(appRouteUrl) : Promise.resolve(null)
  ]);

  return {
    storageKey: normalizedKey ?? "",
    publicUrl,
    publicHttpStatus,
    sdkHeadExists,
    appRouteUrl,
    appRouteHttpStatus,
    finalDiagnosis: classifyStorageProbe({
      publicHttpStatus,
      sdkHeadExists,
      appRouteHttpStatus,
      hasStorageKey: Boolean(normalizedKey)
    })
  };
}

function slugifyLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-+/gu, "-");
}

async function listStorageKeysByPrefix(prefix: string): Promise<string[]> {
  const client = getClient();
  const bucketName = await resolveBucketName(client);
  const normalizedPrefix = normalizeStorageKey(prefix);
  if (!client || !bucketName || !normalizedPrefix) return [];

  const cacheKey = `${bucketName}:${normalizedPrefix}`;
  const cached = storagePrefixListCache.get(cacheKey);
  if (cached) return cached;

  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: normalizedPrefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000
      })
    );
    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key);
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  if (storagePrefixListCache.size >= MAX_STORAGE_HEAD_CACHE_SIZE) {
    const firstKey = storagePrefixListCache.keys().next().value;
    if (firstKey) storagePrefixListCache.delete(firstKey);
  }
  storagePrefixListCache.set(cacheKey, keys);
  return keys;
}

async function listStorageKeysByPrefixes(prefixes: string[]): Promise<string[]> {
  const keys = await Promise.all(prefixes.map((prefix) => listStorageKeysByPrefix(prefix)));
  return Array.from(new Set(keys.flat()));
}

export async function discoverStorageKeyByUserPrefix(input: {
  userId: string;
  kind: "cover" | "audio";
  releaseId?: string | null;
  releaseTitle?: string | null;
  trackTitle?: string | null;
  extensionHint?: string | null;
}): Promise<string | null> {
  const userId = normalizeStorageKey(input.userId);
  if (!userId) return null;

  const keys = await listStorageKeysByPrefixes(
    ALLOWED_S3_IMAGE_PREFIXES.map((prefix) => `${prefix}${userId}/`)
  );
  if (keys.length === 0) return null;

  const releaseSlug = input.releaseTitle ? slugifyLookup(input.releaseTitle) : "";
  const trackSlug = input.trackTitle ? slugifyLookup(input.trackTitle) : "";
  const releaseId = input.releaseId ? normalizeStorageKey(input.releaseId) : null;
  const extensionHint = (input.extensionHint ?? "").trim().replace(/^\./u, "").toLowerCase();
  let bestKey: string | null = null;
  let bestScore = -Infinity;

  for (const key of keys) {
    const baseName = key.split("/").filter(Boolean).at(-1) ?? "";
    if (!baseName) continue;
    const extMatch = baseName.match(/\.([a-z0-9]{2,8})$/iu);
    const ext = extMatch?.[1]?.toLowerCase() ?? "";
    const isAllowed = input.kind === "cover" ? isAllowedImageFile(key) : isAllowedAudioFile(key);
    if (!isAllowed) continue;
    if (extensionHint && ext !== extensionHint) continue;

    const normalizedBase = slugifyLookup(baseName);
    let score = 0;
    if (input.kind === "cover") {
      if (normalizedBase.includes("release-cover")) score += 100;
      if (normalizedBase.includes("cover")) score += 50;
      if (releaseSlug && normalizedBase.includes(releaseSlug)) score += 30;
      if (releaseId && normalizedBase.includes(releaseId)) score += 20;
    } else {
      if (trackSlug && normalizedBase.includes(trackSlug)) score += 80;
      if (releaseSlug && normalizedBase.includes(releaseSlug)) score += 25;
      if (releaseId && normalizedBase.includes(releaseId)) score += 20;
      if (normalizedBase.includes("audio")) score += 15;
      if (normalizedBase.includes("track")) score += 10;
    }

    const timestampMatch = baseName.match(/^(\d{10,13})[-_]/u);
    if (timestampMatch?.[1]) {
      score += Math.min(Number(timestampMatch[1].slice(-6)) || 0, 50) / 50;
    }

    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }

  return bestKey;
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

export async function resolveFirstReachableStoredFileCandidateFromCandidates(
  candidateUrls: string[]
): Promise<{ url: string | null; failedReason: string | null }> {
  const urls = Array.from(new Set(candidateUrls.map((item) => item.trim()).filter(Boolean)));
  if (urls.length === 0) {
    return { url: null, failedReason: "no-candidates" };
  }

  const cacheKey = `stored-file:\n${urls.join("\n")}`;
  const cached = reachableImageCandidateCache.get(cacheKey);
  if (cached) return cached;

  const errors: string[] = [];

  const probeUrls = urls.slice(0, MAX_REACHABLE_PROBE_CANDIDATES);
  for (const url of probeUrls) {
    if (/^https?:\/\//u.test(url)) {
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
      if (exists === null) {
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

    const key = normalizeStorageKey(url);
    if (!key) {
      errors.push(`invalid-key:${url}`);
      continue;
    }

    if (url.startsWith("/api/uploads/object/") || url.startsWith("api/uploads/object/")) {
      const exists = await checkAbsoluteUrlExists(toAbsoluteAppRouteUrl(url.startsWith("api/uploads/object/") ? `/${url}` : url));
      if (exists) {
        const result = { url, failedReason: null };
        if (reachableImageCandidateCache.size >= MAX_REACHABLE_CANDIDATE_CACHE_SIZE) {
          const firstKey = reachableImageCandidateCache.keys().next().value;
          if (firstKey) reachableImageCandidateCache.delete(firstKey);
        }
        reachableImageCandidateCache.set(cacheKey, result);
        return result;
      }
      if (exists === null) {
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
        if (exists === null) {
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

  const fallbackImageLikeUrl =
    urls.find((candidate) => {
      const fileLike = extractFileNameLikeValue(candidate);
      if (!fileLike) return false;
      const { baseName, extension } = splitFileNameParts(fileLike);
      if (!baseName || !extension) return false;
      return IMAGE_EXTENSIONS.has(extension.toLowerCase());
    }) ?? null;

  if (fallbackImageLikeUrl) {
    const result = {
      url: fallbackImageLikeUrl,
      failedReason: errors.length > 0 ? `probe-fallback:${errors.join("; ")}` : "probe-fallback"
    };
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
  return resolveRenderableStoredFileUrl(input);
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
