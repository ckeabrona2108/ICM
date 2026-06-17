import { prisma } from "@/lib/prisma";
import { getReleasePriorityFromRoles } from "@/lib/release-priority";
import {
  ALLOWED_S3_AUDIO_CANDIDATE_PREFIXES,
  resolveRenderableStoredFileUrl
} from "@/lib/s3";
import {
  buildReleaseCoverCandidateUrls,
  getReleaseCoverAsset
} from "@/lib/release-cover";
import { resolveTrackAudioAsset } from "@/lib/release-media-asset";

interface AdminReleaseDetailsResponse {
  id: string;
  status: string;
  payment_status: string;
  payment_label?: string;
  payment_usage?: string | null;
  payment_plan?: "STANDARD" | "PRO" | "ENTERPRISE" | null;
  priority: boolean;
  cover: {
    url: string;
    storage_key?: string | null;
    download_url: string | null;
    candidate_urls: string[];
  };
  release: {
    metadata_language: string;
    title: string;
    subtitle: string;
    genre: string;
    release_type: string;
    label: string;
    upc: string;
    dates: {
      preorder_date: string;
      start_date: string;
      release_date: string;
    };
    territories: {
      mode: string;
      label: string;
      count: number;
      countries: string[];
    };
    platforms: {
      count: number;
      selected_codes: string[];
      names: string[];
    };
    roles: {
      performers: string[];
      feats: string[];
      remixers: string[];
      coPerformers: string[];
      producers: string[];
      musicAuthors: string[];
      lyricsAuthors: string[];
    };
    settings: {
      early_russia_start: boolean;
      real_time_delivery: boolean;
      yandex_pre_release_date: string;
    };
  };
  tracks: Array<{
    id: string;
    title: string;
    subtitle: string;
    identification: {
      isrc: string;
      partner_code: string;
    };
    track_roles: {
      performers: string[];
      feats: string[];
      remixers: string[];
      coPerformers: string[];
      producers: string[];
      musicAuthors: string[];
      lyricsAuthors: string[];
    };
    rights: {
      copyright_pct: string | number | null;
      related_rights_pct: string | number | null;
    };
    additional: {
      preview_start: string;
      instant_gratification: boolean;
      focus_track: boolean;
    };
    version: {
      explicit: boolean;
      live: boolean;
      cover: boolean;
      remix: boolean;
      instrumental: boolean;
    };
    usage: {
      metadata_language: string;
    };
    duration_sec: number;
    files: {
      audio: FileItem;
      text: FileItem;
      karaoke: FileItem;
      video_shot: FileItem;
      video_clip: FileItem;
    };
    raw_commentary: {
      lyrics: string;
    };
  }>;
  comment: string;
  extras: {
    lyrics: string | null;
    karaoke: string | null;
    video_shot: Record<string, unknown> | null;
    video_clip: Record<string, unknown> | null;
    additional: Record<string, unknown> | null;
  };
}

interface FileItem {
  available: boolean;
  file_name: string | null;
  download_url: string | null;
}

interface FileTarget {
  kind: string;
  storageKey: string | null;
  url: string | null;
  fileName: string | null;
}

function buildAdminReleaseFileDownloadUrl(releaseId: string, fileId: string): string {
  return `/api/admin/releases/${releaseId}/files/${encodeURIComponent(fileId)}/download`;
}

interface PersonGroups {
  performers: string[];
  feats: string[];
  remixers: string[];
  coPerformers: string[];
  producers: string[];
  musicAuthors: string[];
  lyricsAuthors: string[];
}

const COVER_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "jpng",
  "PNG",
  "JPG",
  "JPEG",
  "WEBP",
  "GIF",
  "JPNG"
] as const;

function getExtensionHint(rawPreview: string | null): string | null {
  if (!rawPreview) return null;
  if (looksLikeOnlyExtension(rawPreview)) {
    return normalizeExtension(rawPreview);
  }
  const withoutQuery = rawPreview.split("?")[0]?.split("#")[0] ?? rawPreview;
  const fileName = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= fileName.length - 1) return null;
  return normalizeExtension(fileName.slice(dotIndex + 1));
}

function getCoverExtensionsByPriority(rawPreview: string | null): string[] {
  const hint = getExtensionHint(rawPreview);
  const ordered = [...COVER_EXTENSIONS];
  if (!hint) return ordered;
  const exacts = ordered.filter((ext) => ext === hint || ext.toLowerCase() === hint);
  const rest = ordered.filter((ext) => !exacts.includes(ext));
  return [...exacts, ...rest];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function looksLikeOnlyExtension(value: string | null): boolean {
  if (!value) return false;
  return /^[a-z0-9]{2,5}$/iu.test(value);
}

function normalizeExtension(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().replace(/^\./u, "").toLowerCase();
  if (!/^[a-z0-9]{2,8}$/u.test(normalized)) return null;
  return normalized;
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toDate(value: Date | string | null | undefined): string {
  const date = parseDate(value);
  if (!date) return "-";
  return date.toISOString().slice(0, 10);
}

function toSeconds(duration: string | null | undefined): number {
  const value = (duration ?? "").trim();
  if (!value) return 0;
  const parts = value.split(":");
  if (parts.length !== 2) return 0;
  const minutes = Number(parts[0]);
  const seconds = Number(parts[1]);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return 0;
  return Math.max(0, minutes * 60 + seconds);
}

function fileNameFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, "http://localhost");
    const candidate = parsed.pathname.split("/").filter(Boolean).at(-1) ?? "";
    return candidate ? decodeURIComponent(candidate) : null;
  } catch {
    return null;
  }
}

async function resolveAdminDetailCoverAsset(input: {
  id: string;
  preview: string | null;
  submissionData: unknown;
  roles: unknown;
  coverImage: unknown;
  userId: string | null;
  title: string | null;
}) {
  const primary = await getReleaseCoverAsset({
    id: input.id,
    preview: input.preview,
    submissionData: input.submissionData,
    roles: input.roles,
    coverImage: input.coverImage,
    userId: input.userId,
    title: input.title
  });

  if (primary.url || primary.storageKey || !input.preview) {
    return primary;
  }

  return getReleaseCoverAsset({
    id: input.id,
    preview: input.preview,
    submissionData: input.submissionData,
    roles: {},
    coverImage: input.coverImage,
    userId: input.userId,
    title: input.title
  });
}

function normalizeStorageKeyCandidate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return null;
  if (normalized.startsWith("/")) return null;
  const isSimpleFile = !normalized.includes("/") && /\.[a-z0-9]{2,8}$/iu.test(normalized);
  if (!normalized.includes("/") && !isSimpleFile) return null;
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

function pickStoredFileRef(input: unknown): { storageKey: string | null; url: string | null; fileName: string | null } {
  if (typeof input === "string") {
    return pickLegacyFileRef(input);
  }
  const source = asRecord(input);
  if (!source) return { storageKey: null, url: null, fileName: null };

  const rawUrl = asString(source.url);
  const rawStorageKey =
    asString(source.storageKey) ??
    asString(source.key) ??
    asString(source.path) ??
    asString(source.filePath);
  const rawFileName = asString(source.fileName) ?? asString(source.filename);

  const storageKey = normalizeStorageKeyCandidate(rawStorageKey) ?? normalizeStorageKeyCandidate(rawUrl);
  const resolvedUrl = storageKey
    ? resolveRenderableStoredFileUrl({ storageKey })
    : resolveRenderableStoredFileUrl({ url: rawUrl, storageKey: null });
  const fileName = rawFileName ?? fileNameFromUrl(rawUrl) ?? fileNameFromUrl(resolvedUrl);

  return { storageKey, url: resolvedUrl, fileName };
}

function pickLegacyFileRef(value: unknown): { storageKey: string | null; url: string | null; fileName: string | null } {
  const asValue = asString(value);
  if (!asValue || looksLikeOnlyExtension(asValue)) {
    return { storageKey: null, url: null, fileName: null };
  }
  if (asValue.startsWith("http://") || asValue.startsWith("https://") || asValue.startsWith("/")) {
    const resolved = resolveRenderableStoredFileUrl({ url: asValue, storageKey: null });
    return {
      storageKey: null,
      url: resolved,
      fileName: fileNameFromUrl(resolved) ?? fileNameFromUrl(asValue)
    };
  }

  const storageKey = normalizeStorageKeyCandidate(asValue);
  if (!storageKey) {
    return { storageKey: null, url: null, fileName: null };
  }

  return {
    storageKey,
    url: resolveRenderableStoredFileUrl({ storageKey }),
    fileName: fileNameFromUrl(storageKey)
  };
}

function toFileItem(input: {
  storageKey?: string | null;
  url?: string | null;
  fileName?: string | null;
  fallbackName?: string | null;
  downloadUrl?: string | null;
}): FileItem {
  const downloadUrl =
    input.downloadUrl ??
    resolveRenderableStoredFileUrl({
      url: input.url ?? null,
      storageKey: input.storageKey ?? null
    });
  const fileName =
    input.fileName ??
    input.fallbackName ??
    fileNameFromUrl(downloadUrl) ??
    fileNameFromUrl(input.url ?? null);

  return {
    available: Boolean(downloadUrl),
    file_name: fileName ?? null,
    download_url: downloadUrl
  };
}

function splitNames(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[;,|]/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pushNames(target: string[], names: string[]) {
  for (const name of names) {
    if (!name) continue;
    target.push(name);
  }
}

function mapRoleToBucket(roleRaw: string): keyof PersonGroups | null {
  const role = roleRaw.trim().toLowerCase();
  if (!role) return null;
  const compact = role.replace(/[^\p{L}\p{N}]+/gu, "");

  const isPerformer =
    compact === "performer" ||
    compact === "artist" ||
    compact === "mainartist" ||
    compact === "исполнитель" ||
    compact === "исполнители" ||
    compact.startsWith("исполн");
  if (isPerformer) return "performers";

  const isFeat =
    compact === "feat" ||
    compact === "featuring" ||
    compact === "featuredartist" ||
    compact === "featuredartists" ||
    compact.startsWith("feat");
  if (isFeat) return "feats";

  const isRemixer =
    compact === "remixer" || compact === "remixers" || compact.startsWith("remix");
  if (isRemixer) return "remixers";

  const isCoPerformer =
    compact === "coartist" ||
    compact === "coartists" ||
    compact === "coperformer" ||
    compact === "coperformers" ||
    compact === "collaborator" ||
    compact === "collaborators" ||
    compact === "соисполнитель" ||
    compact === "соисполнители" ||
    compact.startsWith("соисполн");
  if (isCoPerformer) return "coPerformers";

  const isProducer =
    compact === "producer" ||
    compact === "producers" ||
    compact === "продюсер" ||
    compact === "продюсеры";
  if (isProducer) return "producers";

  const isMusicAuthor =
    compact === "composer" ||
    compact === "composers" ||
    compact === "musicauthor" ||
    compact === "musicauthors" ||
    compact === "authormusic" ||
    compact === "music" ||
    compact === "songwritermusic" ||
    compact === "автормузыки" ||
    compact === "авторымузыки";
  if (isMusicAuthor) return "musicAuthors";

  const isLyricsAuthor =
    compact === "lyricist" ||
    compact === "lyricists" ||
    compact === "textauthor" ||
    compact === "textauthors" ||
    compact === "authorwords" ||
    compact === "lyricsauthor" ||
    compact === "lyricsauthors" ||
    compact === "songwriter" ||
    compact === "авторслов" ||
    compact === "авторыслов";
  if (isLyricsAuthor) return "lyricsAuthors";

  return null;
}

function looksLikeLyricsText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 200) return true;
  if (/[\r\n]/u.test(trimmed)) return true;
  if (/[.!?…]{2,}/u.test(trimmed)) return true;
  const words = trimmed.split(/\s+/u).filter(Boolean);
  if (words.length >= 12) return true;
  if (/[а-яёa-z]{4,}\s+[а-яёa-z]{4,}\s+[а-яёa-z]{4,}\s+[а-яёa-z]{4,}/iu.test(trimmed)) return true;
  return false;
}

function looksLikePersonName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (looksLikeLyricsText(trimmed)) return false;
  if (trimmed.length > 120) return false;
  if (/[0-9@#$%^&*_=+<>[\]{}\\/]/u.test(trimmed)) return false;
  const words = trimmed.split(/\s+/u).filter(Boolean);
  if (words.length === 0 || words.length > 6) return false;
  return words.every((word) => /^[\p{L}'’-]{2,}$/u.test(word));
}

function onlyPersonNames(values: string[]): string[] {
  return unique(values.filter((value) => looksLikePersonName(value)));
}

function mergeRoleNamesFromValue(
  grouped: ReturnType<typeof parsePersons>,
  roleKey: keyof ReturnType<typeof parsePersons>,
  value: unknown
) {
  if (typeof value === "string") {
    pushNames(grouped[roleKey], splitNames(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        pushNames(grouped[roleKey], splitNames(item));
        continue;
      }
      const itemRecord = asRecord(item);
      if (!itemRecord) continue;
      const name =
        asString(itemRecord.name) ??
        asString(itemRecord.fullName) ??
        asString(itemRecord.person) ??
        asString(itemRecord.artist) ??
        asString(itemRecord.value);
      if (name) pushNames(grouped[roleKey], splitNames(name));
    }
    return;
  }
  const valueRecord = asRecord(value);
  if (!valueRecord) return;
  const name =
    asString(valueRecord.name) ??
    asString(valueRecord.fullName) ??
    asString(valueRecord.person) ??
    asString(valueRecord.artist) ??
    asString(valueRecord.value);
  if (name) pushNames(grouped[roleKey], splitNames(name));
}

function parsePersons(persons: unknown): {
  performers: string[];
  feats: string[];
  remixers: string[];
  coPerformers: string[];
  producers: string[];
  musicAuthors: string[];
  lyricsAuthors: string[];
} {
  const grouped = {
    performers: [] as string[],
    feats: [] as string[],
    remixers: [] as string[],
    coPerformers: [] as string[],
    producers: [] as string[],
    musicAuthors: [] as string[],
    lyricsAuthors: [] as string[]
  };

  const personArray = asArray(persons);
  if (personArray.length > 0) {
    for (const rawPerson of personArray) {
      const person = asRecord(rawPerson);
      if (!person) continue;
      const name =
        asString(person.name) ??
        asString(person.fullName) ??
        asString(person.person) ??
        asString(person.artist) ??
        asString(person.value);
      const role =
        asString(person.role) ??
        asString(person.type) ??
        asString(person.kind) ??
        asString(person.roleType) ??
        asString(person.category) ??
        "";
      if (!name) continue;
      const bucket = mapRoleToBucket(role);
      if (!bucket) continue;
      pushNames(grouped[bucket], splitNames(name));
    }
    return grouped;
  }

  const personObject = asRecord(persons);
  if (!personObject) return grouped;

  const nestedPersons = asArray(personObject.persons);
  if (nestedPersons.length > 0) {
    const nested = parsePersons(nestedPersons);
    return {
      performers: [...grouped.performers, ...nested.performers],
      feats: [...grouped.feats, ...nested.feats],
      remixers: [...grouped.remixers, ...nested.remixers],
      coPerformers: [...grouped.coPerformers, ...nested.coPerformers],
      producers: [...grouped.producers, ...nested.producers],
      musicAuthors: [...grouped.musicAuthors, ...nested.musicAuthors],
      lyricsAuthors: [...grouped.lyricsAuthors, ...nested.lyricsAuthors]
    };
  }

  const directName =
    asString(personObject.name) ??
    asString(personObject.fullName) ??
    asString(personObject.person) ??
    asString(personObject.artist) ??
    asString(personObject.value);
  if (directName) {
    const role =
      asString(personObject.role) ??
      asString(personObject.type) ??
      asString(personObject.kind) ??
      asString(personObject.roleType) ??
      asString(personObject.category) ??
      "";
    const bucket = mapRoleToBucket(role);
    if (bucket) {
      pushNames(grouped[bucket], splitNames(directName));
    }
  }

  for (const [rawKey, rawValue] of Object.entries(personObject)) {
    const key = rawKey.toLowerCase();
    const bucket = mapRoleToBucket(key);
    if (!bucket) continue;
    mergeRoleNamesFromValue(grouped, bucket, rawValue);
  }

  return grouped;
}

function parseTrackPersons(trackData: Record<string, unknown>): PersonGroups {
  return mergePersonGroups(
    parsePersons(trackData),
    mergePersonGroups(
      parsePersons(trackData.trackPersons),
      mergePersonGroups(
        parsePersons(trackData.persons),
        mergePersonGroups(
          parsePersons(trackData.roles),
          parsePersons(trackData.metadata)
        )
      )
    )
  );
}

function mergePersonGroups(
  first: PersonGroups,
  second: PersonGroups
): PersonGroups {
  return {
    performers: unique([...first.performers, ...second.performers]),
    feats: unique([...first.feats, ...second.feats]),
    remixers: unique([...first.remixers, ...second.remixers]),
    coPerformers: unique([...first.coPerformers, ...second.coPerformers]),
    producers: unique([...first.producers, ...second.producers]),
    musicAuthors: unique([...first.musicAuthors, ...second.musicAuthors]),
    lyricsAuthors: onlyPersonNames([...first.lyricsAuthors, ...second.lyricsAuthors])
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizePersonName(value: string): string {
  return value.trim().toLowerCase();
}

function removeAccountNameFromPerformersIfLeaked(
  performers: string[],
  accountName: string | null,
  explicitPerformers: string[]
): string[] {
  if (!accountName) return performers;
  if (performers.length <= 1) return performers;

  const normalizedAccount = normalizePersonName(accountName);
  if (!normalizedAccount) return performers;

  const explicitSet = new Set(explicitPerformers.map(normalizePersonName));
  if (explicitSet.has(normalizedAccount)) return performers;

  const filtered = performers.filter((value) => normalizePersonName(value) !== normalizedAccount);
  return filtered.length > 0 ? filtered : performers;
}

function parseSubmissionData(release: Record<string, unknown>): Record<string, unknown> | null {
  const inline = asRecord(release.submissionData);
  if (inline) return inline;
  const roles = asRecord(release.roles);
  return asRecord(roles?.submissionData);
}

function resolveReleaseStatus(raw: unknown): string {
  const normalized = (asString(raw) ?? "").toLowerCase();
  if (normalized === "moderating" || normalized === "moderation") return "moderation";
  if (normalized === "rejected") return "changes_required";
  if (normalized === "approved") return "approved";
  if (normalized === "draft") return "draft";
  if (normalized === "pending_verification") return "pending_verification";
  return normalized || "moderation";
}

function getTrackFileByType(trackData: Record<string, unknown>, type: "audio" | "text" | "karaoke" | "video_shot" | "video_clip") {
  if (type === "audio") {
    const fromUploaded = pickStoredFileRef(
      trackData.audioFile ?? trackData.audioUpload ?? trackData.audioUrl ?? trackData.audio
    );
    if (fromUploaded.url || fromUploaded.storageKey) return fromUploaded;

    const legacyDb = pickLegacyFileRef(asString(trackData.track));
    if (legacyDb.url || legacyDb.storageKey) return legacyDb;

    const trackId = asString(trackData.id);
    const ext = normalizeExtension(asString(trackData.track));
    if (trackId && ext) {
      const legacyKey = `tracks/${trackId}.${ext}`;
      return {
        storageKey: null,
        url: resolveRenderableStoredFileUrl({ storageKey: legacyKey }),
        fileName: `${trackId}.${ext}`
      };
    }

    return {
      storageKey: null,
      url: null,
      fileName: asString(trackData.fileName) ?? null
    };
  }

  if (type === "text") {
    const fromUploaded = pickStoredFileRef(trackData.syncedLyricsFile ?? trackData.textFile);
    if (fromUploaded.url || fromUploaded.storageKey) return fromUploaded;
    return pickLegacyFileRef(asString(trackData.text_sync));
  }

  if (type === "karaoke") {
    const fromUploaded = pickStoredFileRef(trackData.ringtoneFile ?? trackData.karaokeFile);
    if (fromUploaded.url || fromUploaded.storageKey) return fromUploaded;
    return pickLegacyFileRef(asString(trackData.ringtone));
  }

  if (type === "video_shot") {
    const fromUploaded = pickStoredFileRef(trackData.videoShotFile);
    if (fromUploaded.url || fromUploaded.storageKey) return fromUploaded;
    return pickLegacyFileRef(asString(trackData.video_shot));
  }

  const fromUploaded = pickStoredFileRef(trackData.videoFile ?? trackData.videoClipFile);
  if (fromUploaded.url || fromUploaded.storageKey) return fromUploaded;
  return pickLegacyFileRef(asString(trackData.video));
}
function buildTrackAudioCandidateUrls(trackData: Record<string, unknown>): string[] {
  const candidates = new Set<string>();
  const addCandidate = (value: unknown) => {
    if (typeof value === "string") {
      const resolved = resolveRenderableStoredFileUrl({ url: value, storageKey: null });
      if (resolved) candidates.add(resolved);
      return;
    }
    const ref = pickStoredFileRef(value);
    if (ref.url) candidates.add(ref.url);
    if (ref.storageKey) candidates.add(resolveRenderableStoredFileUrl({ storageKey: ref.storageKey }) ?? ref.storageKey);
  };

  addCandidate(trackData.audioFile);
  addCandidate(trackData.audioUpload);
  addCandidate(trackData.audioUrl);
  addCandidate(trackData.audio);

  const trackId = asString(trackData.id);
  const extHint = normalizeExtension(asString(trackData.track));
  const fileName = asString(trackData.fileName);
  const fileNames = new Set<string>();
  if (fileName) fileNames.add(fileName);
  if (trackId && extHint) fileNames.add(`${trackId}.${extHint}`);

  const prefixes = [...ALLOWED_S3_AUDIO_CANDIDATE_PREFIXES];
  for (const name of fileNames) {
    candidates.add(name);
    for (const prefix of prefixes) {
      candidates.add(`${prefix}${name}`);
    }
  }

  return Array.from(candidates).filter(Boolean);
}

export function mapAdminReleaseDetails(releaseInput: any): AdminReleaseDetailsResponse {
  const release = (releaseInput ?? {}) as Record<string, unknown>;
  const submissionData = parseSubmissionData(release);
  const submissionTracks = asArray(submissionData?.tracks);
  const dbTracks = asArray((release as Record<string, unknown>).tracks ?? release.track);
  const trackCount = Math.max(dbTracks.length, submissionTracks.length);

  const releasePersons = mergePersonGroups(
    parsePersons(submissionData?.persons),
    mergePersonGroups(
      parsePersons(release.roles),
      parsePersons(submissionData?.roles)
    )
  );
  const releaseId = asString(release.id) ?? "";
  const releasePerformer = asString(release.performer) ?? "";
  const releaseFeat = asString(release.feat) ?? "";
  const releaseRemixer = asString(release.remixer) ?? "";
  const releaseOwnerName = asString(asRecord(release.user)?.name);
  const explicitPerformers = splitNames(releasePerformer);
  const mergedPerformers = unique([...releasePersons.performers, ...explicitPerformers]);
  const sanitizedPerformers = removeAccountNameFromPerformersIfLeaked(
    mergedPerformers,
    releaseOwnerName,
    explicitPerformers
  );
  const sanitizedReleaseLyricsAuthors = onlyPersonNames(releasePersons.lyricsAuthors);

  const tracks = Array.from({ length: trackCount }).map((_, index) => {
    const dbTrack = asRecord(dbTracks[index]) ?? {};
    const submissionTrack = asRecord(submissionTracks[index]) ?? {};
    const persons = mergePersonGroups(
      parseTrackPersons(submissionTrack),
      parseTrackPersons(dbTrack)
    );
    const trackId =
      asString(dbTrack.id) ??
      asString(submissionTrack.id) ??
      `track-${index + 1}`;

    const audioRef = getTrackFileByType({ ...dbTrack, ...submissionTrack }, "audio");
    const textRef = getTrackFileByType({ ...dbTrack, ...submissionTrack }, "text");
    const karaokeRef = getTrackFileByType({ ...dbTrack, ...submissionTrack }, "karaoke");
    const videoShotRef = getTrackFileByType({ ...dbTrack, ...submissionTrack }, "video_shot");
    const videoClipRef = getTrackFileByType({ ...dbTrack, ...submissionTrack }, "video_clip");
    const audioDownloadUrl = null;
    const textDownloadUrl =
      textRef.url || textRef.storageKey
        ? buildAdminReleaseFileDownloadUrl(releaseId, `track-${trackId}-text`)
        : null;
    const karaokeDownloadUrl =
      karaokeRef.url || karaokeRef.storageKey
        ? buildAdminReleaseFileDownloadUrl(releaseId, `track-${trackId}-karaoke`)
        : null;
    const videoShotDownloadUrl =
      videoShotRef.url || videoShotRef.storageKey
        ? buildAdminReleaseFileDownloadUrl(releaseId, `track-${trackId}-video_shot`)
        : null;
    const videoClipDownloadUrl =
      videoClipRef.url || videoClipRef.storageKey
        ? buildAdminReleaseFileDownloadUrl(releaseId, `track-${trackId}-video_clip`)
        : null;

    return {
      id: trackId,
      title: asString(submissionTrack.title) ?? asString(dbTrack.title) ?? "",
      subtitle: asString(submissionTrack.subtitle) ?? asString(dbTrack.subtitle) ?? "",
      identification: {
        isrc: asString(submissionTrack.isrc) ?? asString(dbTrack.isrc) ?? "",
        partner_code: asString(submissionTrack.partnerCode) ?? asString(dbTrack.partner_code) ?? ""
      },
      track_roles: {
        performers: unique(
          persons.performers.length
            ? persons.performers
            : [releasePerformer].filter(Boolean)
        ),
        feats: unique(persons.feats.length ? persons.feats : [releaseFeat].filter(Boolean)),
        remixers: unique(persons.remixers.length ? persons.remixers : [releaseRemixer].filter(Boolean)),
        coPerformers: unique(persons.coPerformers),
        producers: unique(persons.producers),
        musicAuthors: unique(persons.musicAuthors),
        lyricsAuthors: onlyPersonNames(persons.lyricsAuthors)
      },
      rights: {
        copyright_pct: asString(submissionTrack.copyrightPct) ?? asString(dbTrack.author_rights) ?? null,
        related_rights_pct: asString(submissionTrack.relatedRightsPct) ?? null
      },
      additional: {
        preview_start: asString(submissionTrack.previewStart) ?? asString(dbTrack.preview_start) ?? "00:00",
        instant_gratification: Boolean(submissionTrack.instantGratification ?? dbTrack.instant_gratification_date),
        focus_track: Boolean(submissionTrack.focusTrack ?? dbTrack.focus)
      },
      version: {
        explicit: Boolean(submissionTrack.versionExplicit ?? dbTrack.explicit),
        live: Boolean(submissionTrack.versionLive ?? dbTrack.live),
        cover: Boolean(submissionTrack.versionCover ?? dbTrack.cover),
        remix: Boolean(submissionTrack.versionRemix ?? dbTrack.remix),
        instrumental: Boolean(submissionTrack.versionInstrumental ?? dbTrack.instrumental)
      },
      usage: {
        metadata_language: asString(submissionTrack.metadataLanguage) ?? asString(dbTrack.language) ?? ""
      },
      duration_sec:
        typeof submissionTrack.durationSec === "number"
          ? submissionTrack.durationSec
          : toSeconds(asString(dbTrack.track)),
      files: {
        audio: toFileItem({
          ...audioRef,
          fallbackName: asString(submissionTrack.fileName),
          downloadUrl: audioDownloadUrl
        }),
        text: toFileItem({
          ...textRef,
          downloadUrl: textDownloadUrl
        }),
        karaoke: toFileItem({
          ...karaokeRef,
          downloadUrl: karaokeDownloadUrl
        }),
        video_shot: toFileItem({
          ...videoShotRef,
          downloadUrl: videoShotDownloadUrl
        }),
        video_clip: toFileItem({
          ...videoClipRef,
          downloadUrl: videoClipDownloadUrl
        })
      },
      raw_commentary: {
        lyrics: asString(submissionTrack.lyrics) ?? asString(dbTrack.text) ?? ""
      }
    };
  });
  const releaseLyricsField = tracks
    .map((track) => track.raw_commentary.lyrics.trim())
    .find((value) => value.length > 0) ?? "";
  if (process.env.NODE_ENV !== "production" && sanitizedReleaseLyricsAuthors.join(" | ") !== unique(releasePersons.lyricsAuthors).join(" | ")) {
    console.log("[release-lyricist-sanitizer]", {
      releaseId,
      rawLyricist: unique(releasePersons.lyricsAuthors),
      sanitizedLyricist: sanitizedReleaseLyricsAuthors,
      lyricsField: releaseLyricsField
    });
  }

  const coverCandidateUrls = buildReleaseCoverCandidateUrls({
    id: asString(release.id) ?? "",
    preview: asString(release.preview),
    submissionData,
    roles: release.roles,
    coverImage: release.coverImage
  });
  const platforms = asArray(submissionData?.platforms).map((item) => asString(item)).filter(Boolean) as string[];
  const countries = asArray(submissionData?.territoryCountries).map((item) => asString(item)).filter(Boolean) as string[];

  return {
    id: asString(release.id) ?? "",
    status: resolveReleaseStatus(release.status),
    payment_status: Boolean(release.confirmed) ? "paid" : "unpaid",
    payment_label: Boolean(release.confirmed) ? "Оплачен" : "Не оплачен",
    payment_usage: null,
    payment_plan: null,
    priority: getReleasePriorityFromRoles(release.roles, Boolean(release.priority)),
    cover: {
      url: coverCandidateUrls[0] ?? "",
      download_url:
        asString(release.id) && coverCandidateUrls[0]
          ? buildAdminReleaseFileDownloadUrl(asString(release.id) ?? "", "cover")
          : null,
      candidate_urls: coverCandidateUrls
    },
    release: {
      metadata_language: asString(submissionData?.language) ?? asString(release.language) ?? "",
      title: asString(submissionData?.title) ?? asString(release.title) ?? "",
      subtitle: asString(submissionData?.subtitle) ?? asString(release.subtitle) ?? "",
      genre: asString(submissionData?.genre) ?? asString(release.genre) ?? "",
      release_type: asString(submissionData?.releaseType) ?? asString(release.type) ?? "",
      label: asString(submissionData?.label) ?? asString(release.labelName) ?? "ICECREAMMUSIC",
      upc: asString(submissionData?.upc) ?? asString(release.upc) ?? "",
      dates: {
        preorder_date: toDate(submissionData?.preorderDate as string | undefined ?? (release.preorderDate as Date | undefined)),
        start_date: toDate(submissionData?.startDate as string | undefined ?? (release.startDate as Date | undefined)),
        release_date: toDate(submissionData?.releaseDate as string | undefined ?? (release.date as Date | undefined))
      },
      territories: {
        mode: asString(submissionData?.territoryMode) ?? "all",
        label: countries.length ? "Выбранные страны" : "Все страны",
        count: countries.length || 244,
        countries
      },
      platforms: {
        count: platforms.length,
        selected_codes: platforms,
        names: platforms
      },
      roles: {
        performers: sanitizedPerformers,
        feats: unique([...releasePersons.feats, ...splitNames(releaseFeat)]),
        remixers: unique([...releasePersons.remixers, ...splitNames(releaseRemixer)]),
        coPerformers: unique(releasePersons.coPerformers),
        producers: unique(releasePersons.producers),
        musicAuthors: unique(releasePersons.musicAuthors),
        lyricsAuthors: sanitizedReleaseLyricsAuthors
      },
      settings: {
        early_russia_start: Boolean(submissionData?.priorityRelease ?? release.earlyStartInRussia),
        real_time_delivery: Boolean(submissionData?.realTimeDelivery ?? release.realTimeDelivery),
        yandex_pre_release_date: toDate(submissionData?.yandexPreReleaseDate as string | undefined ?? (release.yandexSoonNewRelease as Date | undefined))
      }
    },
    tracks,
    comment:
      asString(release.moderatorComment) ??
      asString(release.moderationComment) ??
      asString(release.rejectReason) ??
      asString(submissionData?.moderatorComment) ??
      "",
    extras: {
      lyrics: null,
      karaoke: null,
      video_shot: null,
      video_clip: null,
      additional: null
    }
  };
}

function parseTrackFileId(fileId: string): { trackId: string; kind: "audio" | "text" | "karaoke" | "video_shot" | "video_clip" } | null {
  const match = /^track-(.+)-(audio|text|karaoke|video_shot|video_clip)$/u.exec(fileId);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    trackId: match[1],
    kind: match[2] as "audio" | "text" | "karaoke" | "video_shot" | "video_clip"
  };
}

function resolveTrackIndexFromTracks(tracks: unknown[], trackId: string): number {
  return tracks.findIndex((item) => {
    const row = asRecord(item);
    if (!row) return false;
    const id = asString(row.id);
    if (id === trackId) return true;
    const num = row.trackNumber ?? row.index;
    return typeof num === "number" && (String(num) === trackId || `track-${num}` === trackId);
  });
}

function resolveTrackIndexByPosition(trackId: string, trackCount: number): number {
  const directMatch = /^track-(\d+)$/u.exec(trackId) ?? /^(\d+)$/u.exec(trackId);
  if (!directMatch?.[1]) return -1;
  const position = Number(directMatch[1]);
  if (!Number.isInteger(position) || position < 1 || position > trackCount) return -1;
  return position - 1;
}

function resolveTrackIndex(release: Record<string, unknown>, submissionData: Record<string, unknown> | null, trackId: string): number {
  const tracks = asArray(release.tracks ?? release.track);
  const dbIndex = resolveTrackIndexFromTracks(tracks, trackId);
  if (dbIndex >= 0) return dbIndex;
  const submissionTracks = asArray(submissionData?.tracks);
  const submissionIndex = resolveTrackIndexFromTracks(submissionTracks, trackId);
  if (submissionIndex >= 0) return submissionIndex;
  return resolveTrackIndexByPosition(trackId, submissionTracks.length);
}

export function resolveAdminReleaseFileTargetFromRelease(
  input:
    | { release: any; fileId: string }
    | any,
  maybeFileId?: string
): FileTarget | null {
  const maybeObject = asRecord(input);
  const release = asRecord(maybeObject?.release ?? input);
  const fileId = asString(maybeObject?.fileId ?? maybeFileId);
  if (!release || !fileId) return null;

  if (fileId === "cover") {
    const coverCandidateUrls = buildReleaseCoverCandidateUrls({
      id: asString(release.id) ?? "",
      preview: asString(release.preview),
      submissionData: parseSubmissionData(release),
      roles: release.roles,
      coverImage: release.coverImage
    });
    const firstCoverCandidate = coverCandidateUrls[0] ?? null;
    if (!firstCoverCandidate) return null;
    return {
      kind: "cover",
      url: firstCoverCandidate,
      fileName: fileNameFromUrl(firstCoverCandidate),
      storageKey: normalizeStorageKeyCandidate(firstCoverCandidate)
    };
  }

  if (fileId === "audio") {
    const releaseFile = asRecord(release.releaseFile);
    const resolved = pickStoredFileRef(releaseFile);
    if (resolved.url || resolved.storageKey) {
      return {
        kind: "release-file",
        storageKey: resolved.storageKey,
        url: resolved.url,
        fileName: resolved.fileName
      };
    }
  }

  const parsedTrackFile = parseTrackFileId(fileId);
  if (!parsedTrackFile) return null;

  const submissionData = parseSubmissionData(release);
  const trackIndex = resolveTrackIndex(release, submissionData, parsedTrackFile.trackId);
  if (trackIndex < 0) return null;
  const submissionTracks = asArray(submissionData?.tracks);
  const dbTracks = asArray((release as Record<string, unknown>).tracks ?? release.track);
  const trackData = {
    ...(asRecord(dbTracks[trackIndex]) ?? {}),
    ...(asRecord(submissionTracks[trackIndex]) ?? {})
  };

  const resolved = getTrackFileByType(trackData, parsedTrackFile.kind);
  if (!resolved.url && !resolved.storageKey) return null;

  return {
    kind: `track-${parsedTrackFile.kind}`,
    storageKey: resolved.storageKey,
    url: resolved.url,
    fileName: resolved.fileName
  };
}

export async function getAdminReleaseDetailsById(releaseId: string) {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    include: {
      user: {
        select: {
          name: true
        }
      },
      track: {
        orderBy: { index: "asc" }
      }
    }
  });

  if (!release) return null;
  const details = mapAdminReleaseDetails(release);
  const submissionData = parseSubmissionData(release);
  const submissionTracks = asArray(submissionData?.tracks);
  const dbTracks = asArray((release as Record<string, unknown>).tracks ?? release.track);
  const coverImage = (release as Record<string, unknown>).coverImage;
  const cover = await resolveAdminDetailCoverAsset({
    id: release.id,
    preview: asString(release.preview),
    submissionData,
    roles: release.roles,
    coverImage,
    userId: asString((release as Record<string, unknown>).userId),
    title: asString(release.title)
  });
  details.cover = {
    ...details.cover,
    url: cover.url ?? "",
    storage_key: cover.storageKey ?? null,
    candidate_urls: cover.candidateUrls,
    download_url:
      releaseId && cover.url ? buildAdminReleaseFileDownloadUrl(releaseId, "cover") : null
  };

  for (let index = 0; index < details.tracks.length; index += 1) {
    const currentTrack = details.tracks[index];
    if (!currentTrack) continue;
    const dbTrack = asRecord(dbTracks[index]) ?? {};
    const submissionTrack = asRecord(submissionTracks[index]) ?? {};
    const trackId = currentTrack.id || asString(dbTrack.id) || asString(submissionTrack.id) || `track-${index + 1}`;
    const resolvedAudio = await resolveTrackAudioAsset({
      releaseId: release.id,
      userId: asString((release as Record<string, unknown>).userId),
      releaseTitle: asString(submissionData?.title) ?? asString(release.title),
      trackId,
      trackTitle: asString(submissionTrack.title) ?? asString(dbTrack.title),
      audioFile: submissionTrack.audioFile ?? dbTrack.audioFile,
      audioUpload: submissionTrack.audioUpload ?? dbTrack.audioUpload,
      audioUrl: submissionTrack.audioUrl ?? dbTrack.audioUrl,
      audio: submissionTrack.audio ?? dbTrack.audio,
      track: submissionTrack.track ?? dbTrack.track
    });

    if (resolvedAudio.url) {
      details.tracks[index] = {
        ...currentTrack,
        files: {
          ...currentTrack.files,
          audio: toFileItem({
            storageKey: resolvedAudio.storageKey,
            url: resolvedAudio.url,
            fallbackName:
              asString(submissionTrack.fileName) ??
              asString(dbTrack.fileName) ??
              currentTrack.files.audio.file_name,
            downloadUrl: resolvedAudio.downloadUrl ?? resolvedAudio.url
          })
        }
      };
    }
  }

  if (process.env.ADMIN_RELEASE_ROLES_DEBUG === "1") {
    console.log("[admin-release-roles-debug]", {
      releaseId,
      releaseRoles: release.roles ?? null,
      tracksRoles: release.track.map((trackRow) => ({
        id: trackRow.id,
        title: trackRow.title,
        roles: trackRow.roles ?? null
      })),
      mappedPersons: {
        release: details.release.roles,
        tracks: details.tracks.map((trackRow) => ({
          id: trackRow.id,
          title: trackRow.title,
          roles: trackRow.track_roles
        }))
      }
    });
  }

  return details;
}

export async function getAdminReleaseDownloadTarget(params: { releaseId: string; fileId: string }) {
  const release = await prisma.release.findUnique({
    where: { id: params.releaseId },
    include: {
      track: {
        orderBy: { index: "asc" }
      }
    }
  });
  if (!release) return null;

  if (params.fileId === "cover") {
    const cover = await resolveAdminDetailCoverAsset({
      id: release.id,
      preview: asString(release.preview),
      submissionData: parseSubmissionData(release),
      roles: release.roles,
      coverImage: (release as Record<string, unknown>).coverImage,
      userId: asString((release as Record<string, unknown>).userId),
      title: asString(release.title)
    });
    if (cover.url) {
      return {
        storageKey: cover.storageKey,
        url: cover.url
      };
    }
  }

  const parsedTrackFile = parseTrackFileId(params.fileId);
  if (parsedTrackFile?.kind === "audio") {
    const submissionData = parseSubmissionData(release);
    const trackIndex = resolveTrackIndex(release, submissionData, parsedTrackFile.trackId);
    if (trackIndex >= 0) {
      const submissionTracks = asArray(submissionData?.tracks);
      const dbTracks = asArray((release as Record<string, unknown>).tracks ?? release.track);
      const trackData = {
        ...(asRecord(dbTracks[trackIndex]) ?? {}),
        ...(asRecord(submissionTracks[trackIndex]) ?? {})
      };
      const resolvedAudio = await resolveTrackAudioAsset({
        releaseId: release.id,
        userId: asString((release as Record<string, unknown>).userId),
        releaseTitle: asString(submissionData?.title) ?? asString(release.title),
        trackId: parsedTrackFile.trackId,
        trackTitle: asString(trackData.title),
        audioFile: trackData.audioFile,
        audioUpload: trackData.audioUpload,
        audioUrl: trackData.audioUrl,
        audio: trackData.audio,
        track: trackData.track
      });
      if (resolvedAudio.url) {
        return {
          storageKey: resolvedAudio.storageKey,
          url: resolvedAudio.url
        };
      }
    }
  }

  const target = resolveAdminReleaseFileTargetFromRelease({
    release,
    fileId: params.fileId
  });
  if (!target) return null;

  return {
    storageKey: target.storageKey,
    url: target.url
  };
}
