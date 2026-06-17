import {
  discoverStorageKeyByUserPrefix,
  imageObjectExistsWithPublicFallback,
  resolveFirstReachableStoredFileCandidateFromCandidates,
  resolveExistingImageStorageKeyWithFallback,
  resolveRenderableStoredFileUrl
} from "@/lib/s3";
import {
  buildStoredFileRouteUrl,
  normalizeStoredFileKey
} from "@/lib/file-resolver";

type StoredFileLike = {
  storageKey?: unknown;
  url?: unknown;
  key?: unknown;
  path?: unknown;
  filePath?: unknown;
};

export interface ReleaseCoverSource {
  id: string;
  preview?: string | null;
  submissionData?: unknown;
  coverUpload?: unknown;
  cover?: unknown;
  roles?: unknown;
  coverImage?: unknown;
  userId?: string | null;
  title?: string | null;
}

export interface ReleaseCoverAsset {
  storageKey: string | null;
  url: string | null;
  downloadUrl: string | null;
  candidateUrls: string[];
  source: "exact" | "legacy" | "user-prefix" | "preview-exact" | "not_found";
  sourceField?: string | null;
  savedCoverValue?: string | null;
  existsInS3?: boolean | null;
}

type CoverSourceEntry = {
  field: string;
  value: unknown;
};

const COVER_PREFIXES = [
  "previews/",
  "uploads/",
  "covers/",
  "contracts/previews/",
  "contracts/uploads/",
  "contracts/covers/"
] as const;

const COVER_EXTENSIONS = ["jpg", "jpeg", "png", "webp"] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function looksLikeOnlyExtension(value: string): boolean {
  return /^[a-z0-9]{2,8}$/iu.test(value.trim().replace(/^\./u, ""));
}

function normalizeExtension(value: string): string | null {
  const normalized = value.trim().replace(/^\./u, "").toLowerCase();
  return /^[a-z0-9]{2,8}$/u.test(normalized) ? normalized : null;
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

function buildOrderedExtensions(extensionHint: string | null, fallbackExtensions: string[]): string[] {
  return unique(
    [
      extensionHint,
      ...fallbackExtensions,
      ...fallbackExtensions.map((value) => value.toUpperCase())
    ].filter(Boolean) as string[]
  );
}

function decodePathSegments(value: string): string[] {
  return value
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

function extractRawPathCandidate(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/api/uploads/object/") || trimmed.startsWith("api/uploads/object/")) {
    const stripped = trimmed.replace(/^\/?api\/uploads\/object\/+/u, "").split("?")[0]?.split("#")[0] ?? "";
    return decodePathSegments(stripped).join("/");
  }

  if (trimmed.startsWith("/api/storage/preview") || trimmed.startsWith("api/storage/preview")) {
    const query = trimmed.split("?")[1] ?? "";
    const key = new URLSearchParams(query).get("key");
    return key ? decodeURIComponent(key) : null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const parsed = new URL(trimmed);
      return decodePathSegments(parsed.pathname).join("/");
    } catch {
      return null;
    }
  }

  return trimmed.replace(/^\/+/u, "");
}

function normalizePreviewStorageKeyFromRawValue(rawValue: string, releaseId: string | null): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  if (looksLikeOnlyExtension(trimmed)) return null;

  const pathCandidate = extractRawPathCandidate(trimmed);
  if (!pathCandidate) return null;

  const segments = pathCandidate.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  if (
    segments[0] === "contracts" &&
    ["previews", "uploads", "covers", "tracks"].includes(segments[1] ?? "")
  ) {
    return pathCandidate;
  }

  if (["previews", "tracks", "uploads", "covers"].includes(segments[0] ?? "")) {
    return segments.join("/");
  }

  return null;
}

function normalizeStoredFileLike(input: unknown): StoredFileLike | null {
  if (!input) return null;
  if (typeof input === "string") {
    return { url: input };
  }
  const record = asRecord(input);
  if (!record) return null;
  return {
    storageKey:
      asString(record.storageKey) ??
      asString(record.key) ??
      asString(record.path) ??
      asString(record.filePath),
    url: asString(record.url),
    key: asString(record.key),
    path: asString(record.path),
    filePath: asString(record.filePath)
  };
}

function toPreviewStorageKey(value: unknown, releaseId: string | null): string | null {
  const normalized = normalizeStoredFileLike(value);
  if (!normalized) return null;

  const prioritizedValues = [
    normalized.storageKey,
    normalized.key,
    normalized.path,
    normalized.filePath,
    normalized.url
  ];

  for (const candidate of prioritizedValues) {
    const raw = asString(candidate);
    if (!raw) continue;
    const storageKey = normalizePreviewStorageKeyFromRawValue(raw, releaseId);
    if (storageKey) return storageKey;
  }

  return null;
}

function buildPreviewCandidateUrls(value: unknown, releaseId: string | null): string[] {
  const storageKey = toPreviewStorageKey(value, releaseId);
  if (!storageKey) return [];
  const url = resolveRenderableStoredFileUrl({ storageKey });
  return url ? [url] : [];
}

function buildExactCandidateUrls(...values: unknown[]): string[] {
  const candidates = new Set<string>();
  for (const value of values) {
    const url = buildStoredFileRouteUrl(value);
    if (url) candidates.add(url);
  }
  return Array.from(candidates);
}

function buildVariantCandidateUrlsFromSeeds(seeds: string[], fallbackExtensions: string[]): string[] {
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

function getPrefixWithoutFileName(value: string): string | null {
  const storageKey = normalizeStoredFileKey(value);
  if (!storageKey) return null;
  const segments = storageKey.split("/").filter(Boolean);
  if (segments.length <= 1) return null;
  return `${segments.slice(0, -1).join("/")}/`;
}

function buildReleaseIdBasenameCandidateUrls(
  releaseId: string | null,
  previewValue: string | null
): string[] {
  if (!releaseId || !previewValue) return [];
  const storageKey = normalizeStoredFileKey(previewValue);
  if (!storageKey) return [];
  const { baseName } = splitFileNameParts(storageKey);
  if (!baseName || baseName !== releaseId) return [];

  const samePrefix = getPrefixWithoutFileName(storageKey);
  return unique([
    ...(samePrefix
      ? COVER_EXTENSIONS.map((ext) => buildStoredFileRouteUrl(`${samePrefix}${releaseId}.${ext}`)).filter(Boolean)
      : []),
    ...COVER_PREFIXES
      .filter((prefix) => prefix !== samePrefix)
      .flatMap((prefix) =>
        COVER_EXTENSIONS.map((ext) => buildStoredFileRouteUrl(`${prefix}${releaseId}.${ext}`)).filter(Boolean)
      )
  ] as string[]);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeValueToLogString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  const record = asRecord(value);
  if (!record) return null;
  return (
    asString(record.storageKey) ??
    asString(record.url) ??
    asString(record.key) ??
    asString(record.path) ??
    asString(record.filePath) ??
    null
  );
}

function pushCoverSource(entries: CoverSourceEntry[], field: string, value: unknown): void {
  if (value == null) return;
  if (typeof value === "string" && !value.trim()) return;
  entries.push({ field, value });
}

function pushStructuredCoverFields(entries: CoverSourceEntry[], prefix: string, value: unknown): void {
  const record = asRecord(value);
  if (!record) return;

  pushCoverSource(entries, `${prefix}.coverUpload`, record.coverUpload);
  pushCoverSource(entries, `${prefix}.coverImage`, record.coverImage);
  pushCoverSource(entries, `${prefix}.cover`, record.cover);
  pushCoverSource(entries, `${prefix}.coverUrl`, record.coverUrl);
  pushCoverSource(entries, `${prefix}.cover_url`, record.cover_url);
  pushCoverSource(entries, `${prefix}.artwork`, record.artwork);
  pushCoverSource(entries, `${prefix}.artworkUrl`, record.artworkUrl);
  pushCoverSource(entries, `${prefix}.image`, record.image);
  pushCoverSource(entries, `${prefix}.imageUrl`, record.imageUrl);
  pushCoverSource(entries, `${prefix}.preview`, record.preview);
  pushCoverSource(entries, `${prefix}.previewUrl`, record.previewUrl);

  const files = asRecord(record.files);
  if (files) {
    pushCoverSource(entries, `${prefix}.files.cover`, files.cover);
    pushCoverSource(entries, `${prefix}.files.coverImage`, files.coverImage);
    pushCoverSource(entries, `${prefix}.files.image`, files.image);
    pushCoverSource(entries, `${prefix}.files.preview`, files.preview);
    pushCoverSource(entries, `${prefix}.files.artwork`, files.artwork);
  }

  const uploads = asRecord(record.uploads);
  if (uploads) {
    pushCoverSource(entries, `${prefix}.uploads.cover`, uploads.cover);
    pushCoverSource(entries, `${prefix}.uploads.coverImage`, uploads.coverImage);
    pushCoverSource(entries, `${prefix}.uploads.image`, uploads.image);
    pushCoverSource(entries, `${prefix}.uploads.preview`, uploads.preview);
    pushCoverSource(entries, `${prefix}.uploads.artwork`, uploads.artwork);
  }

  const assets = asRecord(record.assets);
  if (assets) {
    pushCoverSource(entries, `${prefix}.assets.cover`, assets.cover);
    pushCoverSource(entries, `${prefix}.assets.coverImage`, assets.coverImage);
    pushCoverSource(entries, `${prefix}.assets.image`, assets.image);
    pushCoverSource(entries, `${prefix}.assets.preview`, assets.preview);
    pushCoverSource(entries, `${prefix}.assets.artwork`, assets.artwork);
  }

  const listCandidates: Array<{ name: string; value: unknown }> = [
    { name: "files", value: record.files },
    { name: "uploads", value: record.uploads },
    { name: "assets", value: record.assets }
  ];

  for (const candidate of listCandidates) {
    if (!Array.isArray(candidate.value)) continue;
    candidate.value.forEach((item, index) => {
      const itemRecord = asRecord(item);
      if (!itemRecord) return;
      const descriptor = [
        asString(itemRecord.kind),
        asString(itemRecord.type),
        asString(itemRecord.role),
        asString(itemRecord.name),
        asString(itemRecord.field)
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!/(cover|artwork|image|preview)/u.test(descriptor)) return;
      pushCoverSource(entries, `${prefix}.${candidate.name}[${index}]`, itemRecord);
    });
  }
}

function collectReleaseCoverSources(input: ReleaseCoverSource): CoverSourceEntry[] {
  const root = asRecord(input.roles);
  const submission = asRecord(input.submissionData) ?? (root ? asRecord(root.submissionData) : null);
  const inputRecord = asRecord(input as unknown);
  const entries: CoverSourceEntry[] = [];

  pushCoverSource(entries, "submissionData.coverUpload", submission?.coverUpload);
  pushCoverSource(entries, "input.coverUpload", input.coverUpload);
  pushCoverSource(entries, "input.coverImage", input.coverImage);
  pushCoverSource(entries, "roles.coverImage", root?.coverImage);

  pushStructuredCoverFields(entries, "submissionData", submission);
  pushStructuredCoverFields(entries, "roles", root);
  pushStructuredCoverFields(entries, "input", inputRecord);
  pushCoverSource(entries, "submissionData.cover", submission?.cover);
  pushCoverSource(entries, "input.cover", input.cover);
  pushCoverSource(entries, "roles.cover", root?.cover);
  pushCoverSource(entries, "input.preview", input.preview);
  pushCoverSource(entries, "roles.preview", root?.preview);

  const seen = new Set<string>();
  return entries.filter((entry) => {
    const signature = `${entry.field}:${normalizeValueToLogString(entry.value) ?? typeof entry.value}`;
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function buildCandidatesForCoverSource(entry: CoverSourceEntry, releaseId: string | null): string[] {
  return unique([
    ...buildPreviewCandidateUrls(entry.value, releaseId),
    ...buildExactCandidateUrls(entry.value)
  ]);
}

function isPreviewLikeSourceField(field: string): boolean {
  return /(^|\.)(preview|previewUrl)$/u.test(field);
}

export function normalizeReleaseCoverStorageKey(
  value: unknown,
  releaseId?: string | null
): string | null {
  return normalizeStoredFileKey(value);
}

export function normalizeReleaseCoverUrl(value: unknown, releaseId?: string | null): string | null {
  const storageKey = normalizeReleaseCoverStorageKey(value, releaseId);
  if (storageKey) {
    return buildStoredFileRouteUrl(storageKey);
  }

  const normalized = normalizeStoredFileLike(value);
  const rawUrl = asString(normalized?.url);
  if (!rawUrl) return null;

  if (
    rawUrl.startsWith("http://") ||
    rawUrl.startsWith("https://") ||
    rawUrl.startsWith("/")
  ) {
    const resolved = resolveRenderableStoredFileUrl({ url: rawUrl, storageKey: null });
    if (resolved) return resolved;
    if (/^https?:\/\/s3\.icecreammusic\.net\//iu.test(rawUrl)) return null;
    return rawUrl;
  }

  return null;
}

export function buildReleaseCoverCandidateUrls(input: ReleaseCoverSource): string[] {
  const releaseId = asString(input.id);
  const root = asRecord(input.roles);
  const coverSources = collectReleaseCoverSources(input);
  const exactCandidates = unique(coverSources.flatMap((entry) => buildCandidatesForCoverSource(entry, releaseId)));
  const variantCandidates = buildVariantCandidateUrlsFromSeeds(exactCandidates, [
    "jpg",
    "jpeg",
    "png",
    "webp"
  ]);
  return unique([...exactCandidates, ...variantCandidates]);
}

export async function getReleaseCoverAsset(input: ReleaseCoverSource): Promise<ReleaseCoverAsset> {
  const title = input.title ?? asString(asRecord(input.submissionData)?.title) ?? asString(asRecord(input.roles)?.title);
  const releaseId = asString(input.id);
  const root = asRecord(input.roles);
  const previewValue = asString(input.preview) ?? asString(root?.preview);
  const previewKey = previewValue ? toPreviewStorageKey(previewValue, releaseId) : null;
  let resolvedPreviewKey: string | null = null;
  const coverSources = collectReleaseCoverSources({
    ...input,
    title
  });

  const sourceGroups = coverSources.map((entry) => ({
    field: entry.field,
    savedValue: normalizeValueToLogString(entry.value),
    candidates: unique(
      isPreviewLikeSourceField(entry.field)
        ? [
            ...buildCandidatesForCoverSource(entry, releaseId),
            ...buildReleaseIdBasenameCandidateUrls(releaseId, normalizeValueToLogString(entry.value)),
            ...buildVariantCandidateUrlsFromSeeds(buildCandidatesForCoverSource(entry, releaseId), [
              "jpg",
              "jpeg",
              "png",
              "webp"
            ])
          ]
        : [
            ...buildCandidatesForCoverSource(entry, releaseId),
            ...buildVariantCandidateUrlsFromSeeds(buildCandidatesForCoverSource(entry, releaseId), [
              "jpg",
              "jpeg",
              "png",
              "webp"
            ])
          ]
    )
  }));
  const hasStructuredCoverSource = sourceGroups.some((group) => group.candidates.length > 0 && !isPreviewLikeSourceField(group.field));
  const candidateUrls = unique(sourceGroups.flatMap((group) => group.candidates));
  const attemptedSources: Array<Record<string, unknown>> = [];

  const logAttempt = (input: {
    source: string;
    sourceField?: string | null;
    candidates: string[];
    selectedKey?: string | null;
    existsInS3?: boolean | null;
  }) => {
    attemptedSources.push({
      source: input.source,
      sourceField: input.sourceField ?? null,
      candidates: input.candidates,
      selectedKey: input.selectedKey ?? null,
      existsInS3: input.existsInS3 ?? null
    });
  };

  const finalize = (asset: ReleaseCoverAsset): ReleaseCoverAsset => {
    logReleaseCoverResolver({
      releaseId: input.id,
      preview: previewValue,
      previewKey,
      resolvedPreviewKey,
      previewExists:
        asset.source === "preview-exact"
          ? asset.existsInS3 ?? null
          : resolvedPreviewKey
            ? asset.existsInS3 ?? null
            : null,
      userId: input.userId ?? null,
      attemptedSources,
      selectedSource: asset.source,
      selectedKey: asset.storageKey,
      existsInS3: asset.existsInS3 ?? null
    });
    return asset;
  };

  if (previewKey) {
    resolvedPreviewKey = await resolveExistingImageStorageKeyWithFallback(previewKey);
    const previewExists = resolvedPreviewKey ? await imageObjectExistsWithPublicFallback(resolvedPreviewKey) : false;
    logAttempt({
      source: "preview-exact",
      sourceField: "input.preview",
      candidates: [buildStoredFileRouteUrl(previewKey) ?? `/api/uploads/object/${previewKey}`],
      selectedKey: resolvedPreviewKey ?? previewKey,
      existsInS3: previewExists
    });
    if (resolvedPreviewKey && previewExists === true) {
      const previewUrl =
        buildStoredFileRouteUrl(resolvedPreviewKey) ?? `/api/uploads/object/${resolvedPreviewKey}`;
      return finalize({
        storageKey: resolvedPreviewKey,
        url: previewUrl,
        downloadUrl: previewUrl,
        candidateUrls: unique([previewUrl, ...candidateUrls]),
        source: "preview-exact",
        sourceField: "input.preview",
        savedCoverValue: previewValue,
        existsInS3: true
      });
    }
  }

  for (const group of sourceGroups) {
    if (group.candidates.length === 0) continue;
    const resolved = await resolveFirstReachableStoredFileCandidateFromCandidates(group.candidates);
    const storageKey = normalizeStoredFileKey(resolved.url);
    const existsInS3 = storageKey ? await imageObjectExistsWithPublicFallback(storageKey) : null;
    logAttempt({
      source: "candidate",
      sourceField: group.field,
      candidates: group.candidates,
      selectedKey: storageKey,
      existsInS3
    });
    if (!resolved.url || !storageKey || existsInS3 !== true) {
      continue;
    }

    const asset: ReleaseCoverAsset = {
      storageKey,
      url: buildStoredFileRouteUrl(storageKey) ?? resolved.url,
      downloadUrl: buildStoredFileRouteUrl(storageKey) ?? resolved.url,
      candidateUrls,
      source: "exact",
      sourceField: group.field,
      savedCoverValue: group.savedValue,
      existsInS3
    };
    return finalize(asset);
  }

  if (input.userId && releaseId && hasStructuredCoverSource) {
    const discoveredKey = await discoverStorageKeyByUserPrefix({
      userId: input.userId,
      kind: "cover",
      releaseId,
      releaseTitle: title ?? null,
      extensionHint: splitFileNameParts(previewValue ?? "").extension
    });
    const existsInS3 = discoveredKey ? await imageObjectExistsWithPublicFallback(discoveredKey) : null;
    logAttempt({
      source: "user-prefix",
      sourceField: "user-prefix",
      candidates: candidateUrls,
      selectedKey: discoveredKey,
      existsInS3
    });
    if (discoveredKey && existsInS3 === true) {
      const url = buildStoredFileRouteUrl(discoveredKey);
      const asset: ReleaseCoverAsset = {
        storageKey: discoveredKey,
        url,
        downloadUrl: url,
        candidateUrls: unique([...candidateUrls, ...(url ? [url] : [])]),
        source: "user-prefix",
        sourceField: "user-prefix",
        savedCoverValue: normalizeValueToLogString(input.preview),
        existsInS3
      };
      return finalize(asset);
    }
  }

  const asset: ReleaseCoverAsset = {
    storageKey: null,
    url: null,
    downloadUrl: null,
    candidateUrls,
    source: "not_found",
    sourceField: coverSources[0]?.field ?? null,
    savedCoverValue: coverSources[0] ? normalizeValueToLogString(coverSources[0].value) : null,
    existsInS3: false
  };
  return finalize(asset);
}

export async function getReleaseCoverUrl(input: ReleaseCoverSource): Promise<string | null> {
  const asset = await getReleaseCoverAsset(input);
  return asset.url;
}

export async function resolveReleasePreviewForPersistence(input: ReleaseCoverSource): Promise<string> {
  const asset = await getReleaseCoverAsset(input);
  if (asset.url && asset.existsInS3 !== false) {
    return asset.url;
  }
  return "/hero/drop.png";
}

function logReleaseCoverDiagnostics(releaseId: string, asset: ReleaseCoverAsset, input?: ReleaseCoverSource): void {
  if (process.env.NODE_ENV === "production") return;
  const root = input ? asRecord(input.roles) : null;
  const submission = input ? asRecord(input.submissionData) ?? (root ? asRecord(root.submissionData) : null) : null;
  console.log("[release-cover-diagnostics]", {
    releaseId,
    userId: input?.userId ?? null,
    previewField: input?.preview ?? asString(root?.preview) ?? null,
    coverField: asString(submission?.cover) ?? asString(root?.cover) ?? asString(input?.cover) ?? null,
    uploadRecords: {
      submissionCoverUpload: submission?.coverUpload ?? null,
      inputCoverUpload: input?.coverUpload ?? null,
      rolesUploads: root?.uploads ?? null,
      submissionUploads: submission?.uploads ?? null
    },
    assetRecords: {
      inputCoverImage: input?.coverImage ?? null,
      rolesCoverImage: root?.coverImage ?? null,
      submissionAssets: submission?.assets ?? null,
      rolesAssets: root?.assets ?? null,
      submissionFiles: submission?.files ?? null,
      rolesFiles: root?.files ?? null
    },
    savedCoverKeyOrUrl: asset.savedCoverValue ?? null,
    resolvedCoverKey: asset.storageKey,
    resolvedCoverUrl: asset.url,
    existsInS3: asset.existsInS3,
    sourceField: asset.sourceField ?? null,
    source: asset.source
  });
}

function logReleaseCoverResolver(input: {
  releaseId: string;
  preview: string | null;
  previewKey: string | null;
  resolvedPreviewKey: string | null;
  previewExists: boolean | null;
  userId: string | null;
  attemptedSources: Array<Record<string, unknown>>;
  selectedSource: string | null;
  selectedKey: string | null;
  existsInS3: boolean | null;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.log("[release-cover-resolver]", input);
}
