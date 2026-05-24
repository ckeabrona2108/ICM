const IMAGE_PLACEHOLDER_RE = /^(?:image\/)?(?:jpe?g|png|webp|gif)$/iu;
const IMAGE_FILE_RE = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/iu;
const LEGACY_IMAGE_PREFIXES = ["", "previews/", "covers/", "uploads/"] as const;
const LEGACY_IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP"] as const;

function toLocalObjectPath(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith("/api/uploads/object/")) return raw;
  if (raw.startsWith("api/uploads/object/")) return `/${raw}`;

  const normalized = raw.replace(/^\/+/, "");
  if (!normalized) return null;

  const mightBeStorageKey =
    normalized.startsWith("uploads/") || normalized.includes("/") || IMAGE_FILE_RE.test(normalized);
  if (!mightBeStorageKey) return null;

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

  return `/api/uploads/object/${segments.map((segment) => encodeURIComponent(segment)).join("/")}`;
}

function normalizeStorageLikeKey(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith("/api/uploads/object/")) {
    return raw.replace(/^\/api\/uploads\/object\/+/u, "").replace(/^\/+/u, "") || null;
  }
  if (raw.startsWith("api/uploads/object/")) {
    return raw.replace(/^api\/uploads\/object\/+/u, "").replace(/^\/+/u, "") || null;
  }

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const parsed = new URL(raw);
      return parsed.pathname.replace(/^\/+/u, "") || null;
    } catch {
      return null;
    }
  }

  return raw.replace(/^\/+/u, "") || null;
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

function pushUnique(list: string[], seen: Set<string>, value: string | null): void {
  const normalized = value?.trim() ?? "";
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  list.push(normalized);
}

function buildLegacyPathCandidatesFromValue(value: string): string[] {
  if (!isLikelyFilename(value)) return [];
  const key = normalizeStorageLikeKey(value);
  if (!key) return [];

  const { baseName, extension } = splitFileNameParts(key);
  if (!baseName) return [];

  const extCandidates = new Set<string>();
  if (extension) extCandidates.add(extension);
  for (const ext of LEGACY_IMAGE_EXTENSIONS) extCandidates.add(ext);

  const fileNames = Array.from(extCandidates).map((ext) => `${baseName}.${ext}`);
  const candidateKeys: string[] = [];
  for (const fileName of fileNames) {
    for (const prefix of LEGACY_IMAGE_PREFIXES) {
      candidateKeys.push(`${prefix}${fileName}`);
    }
  }

  return candidateKeys
    .map((candidateKey) => toLocalObjectPath(candidateKey))
    .filter((item): item is string => Boolean(item));
}

export function buildCoverImageSrcCandidates(
  value: string | null | undefined
): string[] {
  if (!value) return [];
  const src = value.trim();
  if (!src || IMAGE_PLACEHOLDER_RE.test(src)) return [];

  const candidates: string[] = [];
  const seen = new Set<string>();

  if (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:image/") ||
    src.startsWith("blob:") ||
    src.startsWith("/")
  ) {
    pushUnique(candidates, seen, src);
  }

  if (
    !src.startsWith("http://") &&
    !src.startsWith("https://") &&
    !src.startsWith("data:image/") &&
    !src.startsWith("blob:") &&
    !src.startsWith("/")
  ) {
    pushUnique(candidates, seen, toLocalObjectPath(src));
  }

  for (const candidate of buildLegacyPathCandidatesFromValue(src)) {
    pushUnique(candidates, seen, candidate);
  }

  return candidates;
}

export function normalizeNextImageSrc(
  value: string | null | undefined
): string | null {
  return buildCoverImageSrcCandidates(value)[0] ?? null;
}
