import { buildStoredFileRouteUrl, normalizeStoredFileKey } from "@/lib/file-resolver";
import {
  ALLOWED_S3_AUDIO_CANDIDATE_PREFIXES,
  ALLOWED_S3_IMAGE_PREFIXES,
  resolveFirstReachableStoredFileCandidateFromCandidates
} from "@/lib/s3";

type ResolvedMediaAssetSource = "exact" | "legacy" | "not_found";

type RecordLike = Record<string, unknown>;

interface ResolvedMediaAsset {
  storageKey: string | null;
  url: string | null;
  downloadUrl: string | null;
  candidateUrls: string[];
  source: ResolvedMediaAssetSource;
}

interface CoverResolutionInput {
  id: string;
  userId?: string | null;
  title?: string | null;
  preview?: string | null;
  submissionData?: unknown;
  coverUpload?: unknown;
  cover?: unknown;
  roles?: unknown;
  coverImage?: unknown;
}

interface AudioResolutionInput {
  releaseId?: string | null;
  userId?: string | null;
  releaseTitle?: string | null;
  trackId: string;
  trackTitle?: string | null;
  audioFile?: unknown;
  audioUpload?: unknown;
  audioUrl?: unknown;
  audio?: unknown;
  track?: unknown;
}

function asRecord(value: unknown): RecordLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as RecordLike;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildOrderedExtensions(extensionHint: string | null, fallbackExtensions: string[]): string[] {
  return unique(
    [
      extensionHint,
      ...fallbackExtensions,
      ...fallbackExtensions.map((value) => value.toUpperCase())
    ].filter(Boolean) as string[]
  );
}

function looksLikeOnlyExtension(value: string | null | undefined): boolean {
  return Boolean(value && /^[a-z0-9]{2,8}$/iu.test(value.trim().replace(/^\./u, "")));
}

function normalizeExtension(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^\./u, "").toLowerCase();
  return /^[a-z0-9]{2,8}$/u.test(normalized) ? normalized : null;
}

function splitFileNameParts(value: string): { baseName: string; extension: string | null } {
  const trimmed = value.trim();
  const withoutQuery = trimmed.split("?")[0]?.split("#")[0] ?? trimmed;
  const fileName = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";
  if (!fileName) return { baseName: "", extension: null };
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= fileName.length - 1) {
    return { baseName: fileName, extension: null };
  }
  return {
    baseName: fileName.slice(0, dotIndex),
    extension: fileName.slice(dotIndex + 1)
  };
}

function extractExtensionHint(value: string | null | undefined): string | null {
  if (!value) return null;
  if (looksLikeOnlyExtension(value)) {
    return value.trim().replace(/^\./u, "");
  }
  const { extension } = splitFileNameParts(value);
  return extension ?? null;
}

function normalizeCandidateUrl(value: unknown): string | null {
  const storageKey = normalizeStoredFileKey(value);
  if (storageKey) {
    return buildStoredFileRouteUrl(storageKey);
  }

  const raw = asString(value);
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return null;
}

function normalizePreviewStorageKeyFromRawValue(rawValue: string, releaseId: string | null): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (looksLikeOnlyExtension(trimmed)) {
    const extension = normalizeExtension(trimmed);
    return releaseId && extension ? `previews/${releaseId}.${extension}` : null;
  }

  const normalized = normalizeStoredFileKey(trimmed);
  if (!normalized) return null;

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  if (
    (segments[0] === "contracts" && ["previews", "tracks", "uploads", "covers"].includes(segments[1] ?? "")) ||
    ["previews", "tracks", "uploads", "covers"].includes(segments[0] ?? "")
  ) {
    return segments.join("/");
  }

  const fileName = segments.at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex > 0 && releaseId) {
    const extension = normalizeExtension(fileName.slice(dotIndex + 1));
    if (extension) return `previews/${releaseId}.${extension}`;
  }

  return null;
}

function buildPreviewCandidateUrls(value: unknown, releaseId: string | null): string[] {
  const raw = extractRawCandidateString(value);
  if (!raw) return [];
  const storageKey = normalizePreviewStorageKeyFromRawValue(raw, releaseId);
  if (!storageKey) return [];
  const url = buildStoredFileRouteUrl(storageKey);
  return url ? [url] : [];
}

function buildRawStoredFileRouteCandidates(...values: unknown[]): string[] {
  const candidates = new Set<string>();
  for (const value of values) {
    const url = buildStoredFileRouteUrl(value);
    if (url) candidates.add(url);
  }
  return Array.from(candidates);
}

function extractRawCandidateString(value: unknown): string | null {
  const raw = asString(value);
  if (raw) return raw;
  const record = asRecord(value);
  if (!record) return null;
  const prioritizedValues = [record.url, record.storageKey, record.key, record.path, record.filePath];
  for (const candidate of prioritizedValues) {
    const normalized = asString(candidate);
    if (normalized) return normalized;
  }
  return null;
}

function buildCandidateUrls(values: unknown[]): string[] {
  const candidates: string[] = [];
  for (const value of values) {
    const url = normalizeCandidateUrl(value);
    if (url) candidates.push(url);
  }
  return unique(candidates);
}

function buildVariantCandidateUrlsFromSeeds(
  seeds: string[],
  fallbackExtensions: string[]
): string[] {
  const candidates: string[] = [];

  for (const seed of unique(seeds)) {
    const storageKey = normalizeStoredFileKey(seed);
    if (!storageKey) continue;
    const segments = storageKey.split("/").filter(Boolean);
    const fileName = segments.at(-1) ?? "";
    const prefix = segments.slice(0, -1).join("/");
    const { baseName, extension } = splitFileNameParts(fileName);
    if (!baseName) continue;

    const orderedExtensions = buildOrderedExtensions(extension, fallbackExtensions);
    for (const ext of orderedExtensions) {
      const nextKey = prefix ? `${prefix}/${baseName}.${ext}` : `${baseName}.${ext}`;
      const nextUrl = buildStoredFileRouteUrl(nextKey);
      if (nextUrl) candidates.push(nextUrl);
    }
  }

  return unique(candidates);
}

function buildLegacyCoverCandidates(releaseId: string | null, previewValue: string | null): string[] {
  if (!releaseId) return [];
  const extensionHint = extractExtensionHint(previewValue);
  const orderedExtensions = buildOrderedExtensions(extensionHint, ["jpg", "jpeg", "png", "webp"]);
  const prefixes = [...ALLOWED_S3_IMAGE_PREFIXES];

  return unique([
    ...prefixes.flatMap((prefix) => orderedExtensions.map((ext) => `${prefix}${releaseId}.${ext}`)),
  ].map((candidate) => buildStoredFileRouteUrl(candidate) ?? candidate));
}

function buildLegacyAudioCandidates(
  trackId: string | null,
  trackValue: string | null,
  fileName?: string | null
): string[] {
  if (!trackId) return [];

  const extensionHint =
    extractExtensionHint(trackValue) ?? extractExtensionHint(fileName);
  const orderedExtensions = buildOrderedExtensions(extensionHint, ["wav"]);
  const prefixes = [...ALLOWED_S3_AUDIO_CANDIDATE_PREFIXES];
  const fileNames = orderedExtensions.map((ext) => `${trackId}.${ext}`);

  return unique(
    fileNames.flatMap((fileName) => prefixes.map((prefix) => `${prefix}${fileName}`)).map((candidate) => buildStoredFileRouteUrl(candidate) ?? candidate)
  );
}

async function resolveCandidateGroups(groups: Array<{ source: ResolvedMediaAssetSource; candidates: string[] }>): Promise<ResolvedMediaAsset> {
  const candidateUrls = unique(groups.flatMap((group) => group.candidates));

  for (const group of groups) {
    if (group.candidates.length === 0) continue;
    const resolved = await resolveFirstReachableStoredFileCandidateFromCandidates(group.candidates);
    if (resolved.url) {
      const storageKey = normalizeStoredFileKey(resolved.url);
      const finalUrl = storageKey ? buildStoredFileRouteUrl(storageKey) ?? resolved.url : resolved.url;
      return {
        storageKey,
        url: finalUrl,
        downloadUrl: finalUrl,
        candidateUrls,
        source: group.source
      };
    }
  }

  const firstUsableGroup = groups.find((group) => group.candidates.length > 0);
  const fallbackUrl = firstUsableGroup?.candidates[0] ?? null;
  if (fallbackUrl) {
    const normalizedUrl = buildStoredFileRouteUrl(fallbackUrl) ?? fallbackUrl;
    return {
      storageKey: normalizeStoredFileKey(normalizedUrl),
      url: normalizedUrl,
      downloadUrl: normalizedUrl,
      candidateUrls,
      source: firstUsableGroup?.source ?? "not_found"
    };
  }

  return {
    storageKey: null,
    url: null,
    downloadUrl: null,
    candidateUrls,
    source: "not_found"
  };
}

function getSubmissionData(input: CoverResolutionInput): RecordLike | null {
  const root = asRecord(input.roles);
  const submission = asRecord(input.submissionData) ?? (root ? asRecord(root.submissionData) : null);
  return submission;
}

export async function resolveReleaseCoverAsset(input: CoverResolutionInput): Promise<ResolvedMediaAsset> {
  const root = asRecord(input.roles);
  const submission = getSubmissionData(input);
  const releaseId = asString(input.id);
  const previewValue = asString(input.preview) ?? asString(root?.preview);
  const exactCandidates = unique([
    ...buildPreviewCandidateUrls(submission?.coverUpload, releaseId),
    ...buildPreviewCandidateUrls(input.coverUpload, releaseId),
    ...buildPreviewCandidateUrls(submission?.cover, releaseId),
    ...buildPreviewCandidateUrls(input.cover, releaseId),
    ...buildPreviewCandidateUrls(input.coverImage, releaseId),
    ...buildPreviewCandidateUrls(root?.coverImage, releaseId),
    ...buildPreviewCandidateUrls(previewValue, releaseId),
    ...buildRawStoredFileRouteCandidates(
      submission?.coverUpload,
      input.coverUpload,
      submission?.cover,
      input.cover,
      input.coverImage,
      root?.coverImage,
      previewValue
    )
  ]);
  const variantCandidates = buildVariantCandidateUrlsFromSeeds(exactCandidates, [
    "jpg",
    "jpeg",
    "png",
    "webp"
  ]);
  const legacyCandidates = buildLegacyCoverCandidates(releaseId, previewValue);
  const deterministicCandidates = unique([
    ...exactCandidates,
    ...variantCandidates,
    ...legacyCandidates
  ]);
  const resolved = await resolveCandidateGroups([
    { source: "exact", candidates: unique([...exactCandidates, ...variantCandidates]) },
    { source: "legacy", candidates: legacyCandidates }
  ]);
  if (resolved.url) {
    if (resolved.source === "legacy") {
      console.warn("File resolved via legacy fallback:", {
        type: "cover",
        releaseId: releaseId ?? null,
        trackId: null,
        resolvedKey: resolved.storageKey
      });
    }
    return resolved;
  }

  const fallbackUrl = deterministicCandidates[0] ?? null;
  if (fallbackUrl) {
    const storageKey = normalizeStoredFileKey(fallbackUrl);
    return {
      storageKey,
      url: fallbackUrl,
      downloadUrl: fallbackUrl,
      candidateUrls: deterministicCandidates,
      source: exactCandidates.includes(fallbackUrl) || variantCandidates.includes(fallbackUrl) ? "exact" : "legacy"
    };
  }

  return resolved;
}

export async function resolveTrackAudioAsset(input: AudioResolutionInput): Promise<ResolvedMediaAsset> {
  const trackValue = asString(input.track);
  const audioFileValue = input.audioFile;
  const audioUploadValue = input.audioUpload;
  const audioUrlValue = input.audioUrl;
  const audioValue = input.audio;
  const exactCandidates = buildCandidateUrls([
    audioFileValue,
    audioUploadValue,
    audioUrlValue,
    audioValue,
    trackValue
  ]);
  const variantCandidates = buildVariantCandidateUrlsFromSeeds(exactCandidates, [
    "wav",
    "mp3",
    "flac",
    "aac",
    "m4a",
    "aiff"
  ]);
  const legacyCandidates = buildLegacyAudioCandidates(input.trackId, trackValue, asString(input.audioUrl) ?? asString(input.audioFile));
  const deterministicCandidates = unique([
    ...exactCandidates,
    ...variantCandidates,
    ...legacyCandidates
  ]);
  const resolved = await resolveCandidateGroups([
    { source: "exact", candidates: unique([...exactCandidates, ...variantCandidates]) },
    { source: "legacy", candidates: legacyCandidates }
  ]);
  if (resolved.url) {
    if (resolved.source === "legacy") {
      console.warn("File resolved via legacy fallback:", {
        type: "audio",
        releaseId: input.releaseId ?? null,
        trackId: input.trackId,
        resolvedKey: resolved.storageKey
      });
    }
    return resolved;
  }

  const fallbackUrl = deterministicCandidates[0] ?? null;
  if (fallbackUrl) {
    const storageKey = normalizeStoredFileKey(fallbackUrl);
    return {
      storageKey,
      url: fallbackUrl,
      downloadUrl: fallbackUrl,
      candidateUrls: deterministicCandidates,
      source: exactCandidates.includes(fallbackUrl) || variantCandidates.includes(fallbackUrl) ? "exact" : "legacy"
    };
  }

  return resolved;
}

export type { ResolvedMediaAsset };
