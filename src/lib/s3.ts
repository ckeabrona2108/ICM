import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
const bucket = readStringEnv("S3_BUCKET");
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

function buildLocalObjectPath(key: string): string {
  return `/api/uploads/object/${key.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function normalizeStorageKey(value: string | null | undefined): string | null {
  const normalized = (value ?? "").trim().replace(/^\/+/u, "");
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
  const normalizedKey = normalizeStorageKey(input.key);
  if (!normalizedKey) {
    throw new Error("Invalid storage key");
  }

  if (!client || !bucket) {
    return {
      url: buildLocalObjectPath(normalizedKey),
      method: "PUT",
      fields: {},
      mock: false
    };
  }

  const command = new PutObjectCommand({
    Bucket: bucket,
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
  const normalizedKey = normalizeStorageKey(input.key);
  if (!normalizedKey) {
    throw new Error("Invalid storage key");
  }

  if (!client || !bucket) {
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
    Bucket: bucket,
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
