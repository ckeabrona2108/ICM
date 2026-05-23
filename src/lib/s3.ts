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

function toEndpointUrl(rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
    return rawValue;
  }
  const useSsl = (process.env.S3_USE_SSL ?? "true").trim().toLowerCase() !== "false";
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
const LEGACY_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP"] as const;
const FALLBACK_BUCKET_CANDIDATES = ["uploads", "signatures", "verification", "contracts"] as const;
let resolvedBucketPromise: Promise<string | null> | null = null;

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
  } catch {
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
    if (!isLikelyFilename(rawCandidate)) continue;
    const { baseName, extension } = splitFileNameParts(rawCandidate);
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
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key
      })
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = typeof error === "object" && error && "name" in error ? String((error as { name?: string }).name ?? "") : "";
    if (/notfound|nosuchkey|404|no such key/i.test(`${code} ${message}`)) {
      return false;
    }
    if (/accessdenied|forbidden|403/i.test(`${code} ${message}`)) {
      return false;
    }
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
      if (exists === false) continue;
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
  const urls = Array.from(new Set(candidateUrls.map((item) => item.trim()).filter(Boolean)));
  if (urls.length === 0) return null;

  for (const url of urls) {
    const key = normalizeStorageKey(url);
    if (key) {
      const exists = await checkStorageKeyExists(key);
      if (exists === true) return url;
      if (exists === false) continue;
    }
    if (/^https?:\/\//u.test(url)) {
      const exists = await checkAbsoluteUrlExists(url);
      if (exists) return url;
    }
  }

  return urls[0] ?? null;
}

export function resolvePublicStorageUrlFromKey(key: string): string | null {
  const normalizedKey = normalizeStorageKey(key);
  if (!normalizedKey || !publicStorageBaseUrl) return null;
  const encodedKey = normalizedKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const base = publicStorageBaseUrl.replace(/\/+$/u, "");
  return `${base}/${encodedKey}`;
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

  if (!client || !bucketName) {
    return {
      url: buildLocalObjectPath(normalizedKey),
      method: "PUT",
      fields: {},
      mock: false
    };
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
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
  expiresIn?: number;
  responseContentDisposition?: string;
  responseContentType?: string;
}): Promise<{ url: string; mock: boolean }> {
  const client = getClient();
  const bucketName = await resolveBucketName(client);
  const normalizedKey = normalizeStorageKey(input.key);
  if (!normalizedKey) {
    throw new Error("Invalid storage key");
  }

  if (!client || !bucketName) {
    const publicUrl = resolvePublicStorageUrlFromKey(normalizedKey);
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
    Bucket: bucketName,
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
