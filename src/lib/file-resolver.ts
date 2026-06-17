import { buildLocalObjectUrl } from "@/lib/s3";

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
      return normalizePathSegments(parsed.pathname);
    } catch {
      return null;
    }
  }

  const stripped = trimmed.replace(/^\/+/u, "");
  if (!stripped) return null;
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
  const key = normalizeStoredFileKey(value);
  if (!key) return null;
  return buildLocalObjectUrl(key);
}
