import { prisma } from "@/lib/prisma";
import { getReleasePriorityFromRoles } from "@/lib/release-priority";
import {
  getReleaseLifecycleStatus,
  shouldTreatReleaseAsApproved
} from "@/lib/release-counts";
import {
  discoverStorageKeyByRootFilename,
  discoverStorageKeyBySiblingFolder,
  probeStorageKeyDiagnostics,
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
  media_health?: {
    broken_cover: boolean;
    broken_audio_tracks: number;
  };
  cover: {
    url: string;
    storage_key?: string | null;
    download_url: string | null;
    candidate_urls: string[];
    diagnosis?: MediaDiagnosisSummary;
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
      drug_reference: boolean;
    };
    ai_usage: {
      used: boolean;
      generated_full_track: boolean;
      generated_music_only: boolean;
      generated_lyrics_only: boolean;
      processed_track_only: boolean;
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

export interface AdminReleaseMediaIssueSummary {
  id: string;
  title: string;
  artists: string[];
  status: AdminReleaseDetailsResponse["status"];
  release_date: string | null;
  cover_url: string | null;
  broken_cover: boolean;
  broken_audio_tracks: number;
  repairable_cover: boolean;
  repairable_audio_tracks: number;
  total_tracks: number;
}

export interface AdminReleaseMediaCandidateSummary {
  id: string;
  title: string;
  artists: string[];
  release_date: string | null;
  cover_url: string | null;
  total_tracks: number;
}

export interface AdminReleaseMediaDiagnosticsResponse {
  media_health: {
    broken_cover: boolean;
    broken_audio_tracks: number;
  };
  cover_diagnosis: MediaDiagnosisSummary | null;
  track_audio_diagnoses: Record<string, MediaDiagnosisSummary>;
}

interface FileItem {
  available: boolean;
  file_name: string | null;
  download_url: string | null;
  diagnosis?: MediaDiagnosisSummary;
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

type MediaDiagnosisStatus = "ok" | "missing_file" | "broken_db_path" | "access_denied" | "no_preview";

interface MediaDiagnosisSummary {
  status: MediaDiagnosisStatus;
  label: string;
  message: string;
  storage_key: string | null;
  resolved_url: string | null;
  suggested_storage_key: string | null;
  suggested_source: "root_filename" | "sibling_folder" | null;
  suggested_ambiguous: boolean;
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

function mediaDiagnosisLabel(status: MediaDiagnosisStatus): string {
  switch (status) {
    case "ok":
      return "Файл доступен";
    case "missing_file":
      return "Файл отсутствует в storage";
    case "broken_db_path":
      return "Некорректная привязка в базе";
    case "access_denied":
      return "Storage недоступен";
    case "no_preview":
      return "Файл не привязан";
    default:
      return "Статус неизвестен";
  }
}

function mediaDiagnosisMessage(input: {
  kind: "cover" | "audio";
  status: MediaDiagnosisStatus;
  suggestedStorageKey: string | null;
  suggestedSource: "root_filename" | "sibling_folder" | null;
  suggestedAmbiguous: boolean;
}): string {
  const noun = input.kind === "cover" ? "обложка" : "аудио";
  if (input.status === "ok") return `${noun} доступна и читается корректно.`;
  if (input.suggestedStorageKey) {
    const sourceLabel = input.suggestedSource === "sibling_folder" ? "соседней папке" : "по имени файла";
    return `Найден возможный файл в ${sourceLabel}. Можно перепривязать без повторной загрузки.`;
  }
  if (input.suggestedAmbiguous) {
    return `Найдено несколько кандидатов для ${noun}. Нужна ручная проверка и выбор правильного файла.`;
  }
  switch (input.status) {
    case "missing_file":
      return `Файл ${noun === "обложка" ? "обложки" : "аудио"} отсутствует в storage. Нужна повторная загрузка.`;
    case "broken_db_path":
      return `В базе хранится путь, который не ведёт к рабочему ${noun === "обложка" ? "файлу обложки" : "аудио"}.`;
    case "access_denied":
      return `Storage не даёт прочитать ${noun}. Проверьте доступы или bucket.`;
    case "no_preview":
      return `Для ${noun === "обложка" ? "обложки" : "аудио"} пока нет сохранённой привязки.`;
    default:
      return `Не удалось подтвердить доступность ${noun}.`;
  }
}

async function diagnoseMediaAsset(input: {
  kind: "cover" | "audio";
  storageKey: string | null;
  resolvedUrl: string | null;
  fileName: string | null;
  discoveryNames?: Array<unknown>;
  discoveryCandidates?: Array<unknown>;
}): Promise<MediaDiagnosisSummary> {
  const initialStatus: MediaDiagnosisStatus = input.storageKey ? "broken_db_path" : "no_preview";
  const probe = input.storageKey
    ? await probeStorageKeyDiagnostics({
        storageKey: input.storageKey,
        publicUrl: input.resolvedUrl
      })
    : null;
  const status = (probe?.finalDiagnosis ?? initialStatus) as MediaDiagnosisStatus;

  const rootFilenameMatch =
    status === "ok"
      ? { key: null, ambiguous: false as const }
      : await discoverStorageKeyByRootFilename({
          kind: input.kind,
          filenames: [input.fileName, ...(input.discoveryNames ?? [])]
        });
  const siblingMatch =
    status === "ok" || rootFilenameMatch.key
      ? { key: null, ambiguous: false as const }
      : await discoverStorageKeyBySiblingFolder({
          kind: input.kind,
          candidates: [input.storageKey, ...(input.discoveryCandidates ?? [])]
        });

  const suggestedStorageKey = rootFilenameMatch.key ?? siblingMatch.key ?? null;
  const suggestedSource =
    rootFilenameMatch.key ? "root_filename" : siblingMatch.key ? "sibling_folder" : null;
  const suggestedAmbiguous = Boolean(rootFilenameMatch.ambiguous || siblingMatch.ambiguous);

  return {
    status,
    label: mediaDiagnosisLabel(status),
    message: mediaDiagnosisMessage({
      kind: input.kind,
      status,
      suggestedStorageKey,
      suggestedSource,
      suggestedAmbiguous
    }),
    storage_key: input.storageKey,
    resolved_url: input.resolvedUrl,
    suggested_storage_key: suggestedStorageKey,
    suggested_source: suggestedSource,
    suggested_ambiguous: suggestedAmbiguous
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

function inflateTrackRow(value: unknown): Record<string, unknown> {
  const track = asRecord(value) ?? {};
  const roles = asRecord(track.roles);
  return roles ? { ...roles, ...track } : track;
}

function resolveReleaseStatus(input: {
  status: unknown;
  roles: unknown;
  confirmed?: boolean | null;
  upc?: string | null;
}): string {
  if (
    shouldTreatReleaseAsApproved({
      status: asString(input.status),
      confirmed: input.confirmed,
      upc: input.upc,
      roles: input.roles
    })
  ) {
    return "approved";
  }

  const lifecycle = getReleaseLifecycleStatus(asString(input.status), input.roles);
  if (lifecycle === "changes_required") return "changes_required";
  if (lifecycle === "approved" || lifecycle === "archived") return "approved";
  if (lifecycle === "dsp_confirmed") return "dsp_confirmed";
  if (lifecycle === "draft") return "draft";
  if (lifecycle === "pending_verification") return "pending_verification";
  if (lifecycle === "moderation") return "moderation";

  const normalized = (asString(input.status) ?? "").toLowerCase();
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
export function mapAdminReleaseDetails(releaseInput: unknown): AdminReleaseDetailsResponse {
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
    const dbTrack = inflateTrackRow(dbTracks[index]);
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
        instrumental: Boolean(submissionTrack.versionInstrumental ?? dbTrack.instrumental),
        drug_reference: Boolean(submissionTrack.versionDrugReference ?? dbTrack.versionDrugReference)
      },
      ai_usage: {
        used: Boolean(submissionTrack.aiAssistanceUsed ?? dbTrack.aiAssistanceUsed),
        generated_full_track: Boolean(
          submissionTrack.aiGeneratedFullTrack ?? dbTrack.aiGeneratedFullTrack
        ),
        generated_music_only: Boolean(
          submissionTrack.aiGeneratedMusicOnly ?? dbTrack.aiGeneratedMusicOnly
        ),
        generated_lyrics_only: Boolean(
          submissionTrack.aiGeneratedLyricsOnly ?? dbTrack.aiGeneratedLyricsOnly
        ),
        processed_track_only: Boolean(
          submissionTrack.aiProcessedTrackOnly ?? dbTrack.aiProcessedTrackOnly
        )
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
    status: resolveReleaseStatus({
      status: release.status,
      roles: release.roles,
      confirmed: Boolean(release.confirmed),
      upc: asString(submissionData?.upc) ?? asString(release.upc)
    }),
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
        early_russia_start: Boolean(submissionData?.earlyRussiaStart ?? release.earlyStartInRussia),
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
    | { release: unknown; fileId: string }
    | unknown,
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
  const cover = await resolveAdminDetailCoverAsset({
    id: release.id,
    preview: asString(release.preview),
    submissionData: parseSubmissionData(release),
    roles: release.roles,
    coverImage: (release as Record<string, unknown>).coverImage,
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

async function computeAdminReleaseMediaDiagnostics(params: {
  release: Record<string, unknown>;
  details: AdminReleaseDetailsResponse;
}): Promise<AdminReleaseMediaDiagnosticsResponse> {
  const { release, details } = params;
  const submissionData = parseSubmissionData(release);
  const submissionTracks = asArray(submissionData?.tracks);
  const dbTracks = asArray((release as Record<string, unknown>).tracks ?? (release as Record<string, unknown>).track);
  const coverImage = (release as Record<string, unknown>).coverImage;
  const releaseId = asString((release as Record<string, unknown>).id) ?? "";
  const cover = await resolveAdminDetailCoverAsset({
    id: releaseId,
    preview: asString((release as Record<string, unknown>).preview),
    submissionData,
    roles: (release as Record<string, unknown>).roles,
    coverImage,
    userId: asString((release as Record<string, unknown>).userId),
    title: asString((release as Record<string, unknown>).title)
  });

  const coverDiagnosis = await diagnoseMediaAsset({
    kind: "cover",
    storageKey: cover.storageKey ?? null,
    resolvedUrl: cover.url ?? null,
    fileName: fileNameFromUrl(cover.storageKey ?? cover.url ?? null),
    discoveryNames: [asString((release as Record<string, unknown>).preview), cover.url, cover.storageKey],
    discoveryCandidates: [cover.storageKey, ...cover.candidateUrls]
  });

  let brokenAudioTracks = 0;
  const trackAudioDiagnoses: Record<string, MediaDiagnosisSummary> = {};

  for (let index = 0; index < details.tracks.length; index += 1) {
    const currentTrack = details.tracks[index];
    if (!currentTrack) continue;
    const dbTrack = inflateTrackRow(dbTracks[index]);
    const submissionTrack = asRecord(submissionTracks[index]) ?? {};
    const trackId = currentTrack.id || asString(dbTrack.id) || asString(submissionTrack.id) || `track-${index + 1}`;
    const resolvedAudio = await resolveTrackAudioAsset({
      releaseId,
      userId: asString((release as Record<string, unknown>).userId),
      releaseTitle: asString(submissionData?.title) ?? asString((release as Record<string, unknown>).title),
      trackId,
      trackTitle: asString(submissionTrack.title) ?? asString(dbTrack.title),
      audioFile: submissionTrack.audioFile ?? dbTrack.audioFile,
      audioUpload: submissionTrack.audioUpload ?? dbTrack.audioUpload,
      audioUrl: submissionTrack.audioUrl ?? dbTrack.audioUrl,
      audio: submissionTrack.audio ?? dbTrack.audio,
      track: submissionTrack.track ?? dbTrack.track
    });

    const diagnosis = await diagnoseMediaAsset({
      kind: "audio",
      storageKey: resolvedAudio.storageKey ?? null,
      resolvedUrl: resolvedAudio.url ?? null,
      fileName:
        asString(submissionTrack.fileName) ??
        asString(dbTrack.fileName) ??
        currentTrack.files.audio.file_name,
      discoveryNames: resolvedAudio.url
        ? [
            asString(submissionTrack.fileName),
            asString(dbTrack.fileName),
            resolvedAudio.storageKey,
            resolvedAudio.url
          ]
        : [
            asString(submissionTrack.fileName),
            asString(dbTrack.fileName),
            asString(submissionTrack.audioUrl),
            asString(dbTrack.audioUrl)
          ],
      discoveryCandidates: resolvedAudio.url
        ? [resolvedAudio.storageKey, ...resolvedAudio.candidateUrls]
        : [
            asString(submissionTrack.audioUrl),
            asString(dbTrack.audioUrl),
            asString(submissionTrack.track),
            asString(dbTrack.track)
          ]
    });

    trackAudioDiagnoses[trackId] = diagnosis;
    if (diagnosis.status !== "ok") brokenAudioTracks += 1;
  }

  return {
    media_health: {
      broken_cover: coverDiagnosis.status !== "ok",
      broken_audio_tracks: brokenAudioTracks
    },
    cover_diagnosis: coverDiagnosis,
    track_audio_diagnoses: trackAudioDiagnoses
  };
}

export async function getAdminReleaseMediaDiagnosticsById(releaseId: string) {
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
  return computeAdminReleaseMediaDiagnostics({ release, details });
}

export async function listAdminReleaseMediaCandidates(): Promise<AdminReleaseMediaCandidateSummary[]> {
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      date: true,
      preview: true,
      performer: true,
      feat: true,
      roles: true,
      track: {
        select: {
          id: true
        },
        orderBy: { index: "asc" }
      }
    },
    orderBy: { date: "desc" }
  });

  return releases.map((release) => {
    const submissionData = parseSubmissionData(release);
    const releasePersons = mergePersonGroups(
      parsePersons(release.roles),
      parsePersons(submissionData?.persons)
    );
    const artists = unique([
      ...releasePersons.performers,
      ...releasePersons.feats,
      ...splitNames(asString(release.performer)),
      ...splitNames(asString(release.feat))
    ]).filter(Boolean);

    return {
      id: release.id,
      title: asString(submissionData?.title) ?? asString(release.title) ?? "Без названия",
      artists,
      release_date: toDate(asString(submissionData?.releaseDate) ?? (release.date as Date | undefined)),
      cover_url: resolveRenderableStoredFileUrl({ url: asString(release.preview), storageKey: null }) ?? null,
      total_tracks: Array.isArray(release.track) ? release.track.length : 0
    } satisfies AdminReleaseMediaCandidateSummary;
  });
}

export async function listAdminReleaseMediaIssues(): Promise<AdminReleaseMediaIssueSummary[]> {
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      date: true,
      status: true,
      preview: true,
      performer: true,
      feat: true,
      roles: true,
      userId: true,
      track: {
        select: {
          id: true,
          title: true,
          track: true
        },
        orderBy: { index: "asc" }
      }
    },
    orderBy: { date: "desc" }
  });

  const issues = await Promise.all(
    releases.map(async (release) => {
      const submissionData = parseSubmissionData(release);
      const dbTracks = asArray((release as Record<string, unknown>).tracks ?? release.track);
      const submissionTracks = asArray(submissionData?.tracks);
      const cover = await resolveAdminDetailCoverAsset({
        id: release.id,
        preview: asString(release.preview),
        submissionData,
        roles: release.roles,
        coverImage: (release as Record<string, unknown>).coverImage,
        userId: asString((release as Record<string, unknown>).userId),
        title: asString(release.title)
      });
      const coverDiagnosis = await diagnoseMediaAsset({
        kind: "cover",
        storageKey: cover.storageKey ?? null,
        resolvedUrl: cover.url ?? null,
        fileName: fileNameFromUrl(cover.storageKey ?? cover.url ?? null),
        discoveryNames: [release.preview, cover.url, cover.storageKey],
        discoveryCandidates: [cover.storageKey, ...cover.candidateUrls]
      });

      let brokenAudioTracks = 0;
      let repairableAudioTracks = 0;

      for (let index = 0; index < dbTracks.length; index += 1) {
        const dbTrack = inflateTrackRow(dbTracks[index]);
        const submissionTrack = asRecord(submissionTracks[index]) ?? {};
        const trackId =
          asString(dbTrack.id) ?? asString(submissionTrack.id) ?? `track-${index + 1}`;
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
        const diagnosis = await diagnoseMediaAsset({
          kind: "audio",
          storageKey: resolvedAudio.storageKey ?? null,
          resolvedUrl: resolvedAudio.url ?? null,
          fileName:
            asString(submissionTrack.fileName) ??
            asString(dbTrack.fileName) ??
            asString(dbTrack.title),
          discoveryNames: [
            asString(submissionTrack.fileName),
            asString(dbTrack.fileName),
            resolvedAudio.storageKey,
            resolvedAudio.url
          ],
          discoveryCandidates: [resolvedAudio.storageKey, ...resolvedAudio.candidateUrls]
        });

        if (diagnosis.status !== "ok") {
          brokenAudioTracks += 1;
        }
        if (diagnosis.suggested_storage_key) {
          repairableAudioTracks += 1;
        }
      }

      if (coverDiagnosis.status === "ok" && brokenAudioTracks === 0) {
        return null;
      }

      const releasePersons = mergePersonGroups(
        parsePersons(release.roles),
        parsePersons(submissionData?.persons)
      );
      const artists = unique([
        ...releasePersons.performers,
        ...releasePersons.feats,
        ...splitNames(asString(release.performer)),
        ...splitNames(asString(release.feat))
      ]).filter(Boolean);

      return {
        id: release.id,
        title: asString(submissionData?.title) ?? asString(release.title) ?? "Без названия",
        artists,
        status: resolveReleaseStatus({
          status: release.status,
          roles: release.roles,
          confirmed: false,
          upc: asString(submissionData?.upc)
        }) as AdminReleaseDetailsResponse["status"],
        release_date: toDate(asString(submissionData?.releaseDate) ?? (release.date as Date | undefined)),
        cover_url: cover.url ?? null,
        broken_cover: coverDiagnosis.status !== "ok",
        broken_audio_tracks: brokenAudioTracks,
        repairable_cover: Boolean(coverDiagnosis.suggested_storage_key),
        repairable_audio_tracks: repairableAudioTracks,
        total_tracks: dbTracks.length
      } satisfies AdminReleaseMediaIssueSummary;
    })
  );

  return issues.reduce<AdminReleaseMediaIssueSummary[]>((acc, issue) => {
    if (issue) acc.push(issue);
    return acc;
  }, []);
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
        ...inflateTrackRow(dbTracks[trackIndex]),
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
