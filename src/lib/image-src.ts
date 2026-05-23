const IMAGE_PLACEHOLDER_RE = /^(?:image\/)?(?:jpe?g|png|webp|gif)$/iu;
const IMAGE_FILE_RE = /\.(?:jpe?g|png|webp|gif|avif)(?:[?#].*)?$/iu;

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

export function normalizeNextImageSrc(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const src = value.trim();
  if (!src) return null;
  if (IMAGE_PLACEHOLDER_RE.test(src)) return null;

  if (
    src.startsWith("/") ||
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:image/") ||
    src.startsWith("blob:")
  ) {
    return src;
  }

  const localObjectPath = toLocalObjectPath(src);
  if (localObjectPath) {
    return localObjectPath;
  }

  return null;
}
