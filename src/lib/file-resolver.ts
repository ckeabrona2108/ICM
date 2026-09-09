import { buildLocalObjectUrl, resolveRenderableStoredFileUrl } from "@/lib/s3";

type StoredFileObject = {
  storageKey?: unknown;
  key?: unknown;
  url?: unknown;
  path?: unknown;
  filePath?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function getUrlHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function getConfiguredStorageHosts(): Set<string> {
  const candidates = [
    process.env.NEXT_PUBLIC_S3_URL,
    process.env.S3_PUBLIC_URL,
    process.env.S3_ENDPOINT,
    process.env.MINIO_ENDPOINT,
    process.env.S3_HOST,
    'https://s3.icecreammusic.net'
  ];

  return new Set(
    candidates
      .map((value) => {
        const trimmed = value?.trim();
        if (!trimmed) return null;
        const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
        return getUrlHost(normalized);
      })
      .filter((value): value is string => Boolean(value))
  );
}

const CONFIGURED_STORAGE_HOSTS = getConfiguredStorageHosts();

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

function normalizePathSegments(pathname: string): string | null {
  const segments = decodePathSegments(pathname);
  return segments.length > 0 ? segments.join("/") : null;
}

function normalizeStoredFileKeyFromString(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("/") && !trimmed.includes(".") && /^[a-z0-9]{2,8}$/iu.test(trimmed)) {
    return null;
  }

  if (trimmed.startsWith("/api/uploads/object/") || trimmed.startsWith("api/uploads/object/")) {
    const stripped = trimmed.replace(/^\/?api\/uploads\/object\/+/u, "").split("?")[0]?.split("#")[0] ?? "";
    return normalizePathSegments(stripped);
  }

  if (trimmed.startsWith("/api/storage/preview") || trimmed.startsWith("api/storage/preview")) {
    const query = trimmed.split("?")[1] ?? "";
    const key = new URLSearchParams(query).get("key");
    return key ? normalizeStoredFileKeyFromString(key) : null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.pathname.startsWith("/api/uploads/object/") ||
        parsed.pathname.startsWith("/api/storage/preview")
      ) {
        return normalizeStoredFileKeyFromString(
          `${parsed.pathname}${parsed.search ?? ""}${parsed.hash ?? ""}`
        );
      }
      if (!CONFIGURED_STORAGE_HOSTS.has(parsed.host.toLowerCase())) {
        return null;
      }
      return normalizePathSegments(parsed.pathname);
    } catch {
      return null;
    }
  }

  const stripped = trimmed.replace(/^\/+/u, "");
  if (!stripped) return null;
  if (!stripped.includes("/") && /^(cover|artwork|image|preview)\.[a-z0-9]{2,8}$/iu.test(stripped)) {
    return null;
  }
  return normalizePathSegments(stripped);
}

function normalizeStoredFileKeyFromObject(value: StoredFileObject): string | null {
  const prioritizedValues = [value.storageKey, value.key, value.url, value.path, value.filePath];

  for (const candidate of prioritizedValues) {
    const raw = asString(candidate);
    if (!raw) continue;
    const key = normalizeStoredFileKeyFromString(raw);
    if (key) return key;
  }

  return null;
}

export function normalizeStoredFileKey(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return normalizeStoredFileKeyFromString(value);
  const record = asRecord(value);
  if (!record) return null;
  return normalizeStoredFileKeyFromObject(record);
}

export function buildStoredFileRouteUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const looksLikeDirectUrl =
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("/api/uploads/object/") ||
      trimmed.startsWith("api/uploads/object/") ||
      trimmed.startsWith("/api/storage/preview") ||
      trimmed.startsWith("api/storage/preview") ||
      trimmed.startsWith("/");

    if (looksLikeDirectUrl) {
      const directUrl = resolveRenderableStoredFileUrl({ url: trimmed, storageKey: null });
      if (directUrl) return directUrl;
    }
  }

  const key = normalizeStoredFileKey(value);
  if (!key) return null;
  return buildLocalObjectUrl(key);
}
