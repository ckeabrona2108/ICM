import { prisma } from "@/lib/prisma";
import { getReleasePriorityFromRoles } from "@/lib/release-priority";
import { resolveStoredFileUrl } from "@/lib/s3";

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
    download_url: string | null;
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

function normalizeStorageKeyCandidate(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) return null;
  if (normalized.startsWith("/")) return null;
  if (!normalized.includes("/")) return null;
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
  const resolvedUrl = resolveStoredFileUrl({ url: rawUrl, storageKey });
  const fileName = rawFileName ?? fileNameFromUrl(rawUrl) ?? fileNameFromUrl(resolvedUrl);

  return { storageKey, url: resolvedUrl, fileName };
}

function pickLegacyFileRef(value: unknown): { storageKey: string | null; url: string | null; fileName: string | null } {
  const asValue = asString(value);
  if (!asValue || looksLikeOnlyExtension(asValue)) {
    return { storageKey: null, url: null, fileName: null };
  }
  if (asValue.startsWith("http://") || asValue.startsWith("https://") || asValue.startsWith("/")) {
    const resolved = resolveStoredFileUrl({ url: asValue, storageKey: null });
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
    url: resolveStoredFileUrl({ storageKey }),
    fileName: fileNameFromUrl(storageKey)
  };
}

function toFileItem(input: {
  storageKey?: string | null;
  url?: string | null;
  fileName?: string | null;
  fallbackName?: string | null;
}): FileItem {
  const downloadUrl = resolveStoredFileUrl({
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

  for (const rawPerson of asArray(persons)) {
    const person = asRecord(rawPerson);
    if (!person) continue;
    const name = asString(person.name) ?? asString(person.person);
    const role = (asString(person.role) ?? "").toLowerCase();
    if (!name) continue;

    if (role.includes("feat")) grouped.feats.push(name);
    else if (role.includes("соисполн")) grouped.coPerformers.push(name);
    else if (role.includes("исполн")) grouped.performers.push(name);
    else if (role.includes("remix")) grouped.remixers.push(name);
    else if (role.includes("продюсер") || role.includes("producer")) grouped.producers.push(name);
    else if (role.includes("автор музыки") || role.includes("composer")) grouped.musicAuthors.push(name);
    else if (role.includes("автор слов") || role.includes("lyric")) grouped.lyricsAuthors.push(name);
  }

  return grouped;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseSubmissionData(release: Record<string, unknown>): Record<string, unknown> | null {
  const inline = asRecord(release.submissionData);
  if (inline) return inline;
  const roles = asRecord(release.roles);
  return asRecord(roles?.submissionData);
}

function resolveCoverItem(release: Record<string, unknown>, submissionData: Record<string, unknown> | null) {
  const coverImageRef = pickStoredFileRef(release.coverImage);
  const coverUploadRef = pickStoredFileRef(submissionData?.coverUpload);
  const legacyCoverUrl = asString(submissionData?.cover);
  const preview = asString(release.preview);
  const releaseId = asString(release.id);
  const previewRef = pickLegacyFileRef(preview);
  const previewExt = normalizeExtension(preview);
  const legacyPreviewBucketRef =
    releaseId && previewExt
      ? {
          storageKey: `previews/${releaseId}.${previewExt}`,
          url: resolveStoredFileUrl({ storageKey: `previews/${releaseId}.${previewExt}` }),
          fileName: `${releaseId}.${previewExt}`
        }
      : { storageKey: null, url: null, fileName: null };
  const fallbackUrl = resolveStoredFileUrl({ url: legacyCoverUrl, storageKey: null });

  const coverUrl =
    coverUploadRef.url ??
    fallbackUrl ??
    coverImageRef.url ??
    legacyPreviewBucketRef.url ??
    previewRef.url ??
    "";
  return {
    url: coverUrl,
    download_url: coverUrl || null
  };
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

function getTrackFileRefByType(trackData: Record<string, unknown>, type: "audio" | "text" | "karaoke" | "video_shot" | "video_clip") {
  if (type === "audio") {
    const fromUploaded = pickStoredFileRef(trackData.audioFile);
    if (fromUploaded.url || fromUploaded.storageKey) return fromUploaded;

    const legacyDb = pickLegacyFileRef(asString(trackData.track));
    if (legacyDb.url || legacyDb.storageKey) return legacyDb;

    const trackId = asString(trackData.id);
    const ext = normalizeExtension(asString(trackData.track));
    if (trackId && ext) {
      const legacyKey = `tracks/${trackId}.${ext}`;
      return {
        storageKey: null,
        url: resolveStoredFileUrl({ storageKey: legacyKey }),
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

export function mapAdminReleaseDetails(releaseInput: any): AdminReleaseDetailsResponse {
  const release = (releaseInput ?? {}) as Record<string, unknown>;
  const submissionData = parseSubmissionData(release);
  const submissionTracks = asArray(submissionData?.tracks);
  const dbTracks = asArray(release.tracks ?? release.track);
  const trackCount = Math.max(dbTracks.length, submissionTracks.length);

  const releasePersons = parsePersons(submissionData?.persons ?? release.roles);
  const releasePerformer = asString(release.performer) ?? asString(asRecord(release.user)?.name) ?? "";
  const releaseFeat = asString(release.feat) ?? "";

  const tracks = Array.from({ length: trackCount }).map((_, index) => {
    const dbTrack = asRecord(dbTracks[index]) ?? {};
    const submissionTrack = asRecord(submissionTracks[index]) ?? {};
    const persons = parsePersons(submissionTrack.trackPersons);

    const audioRef = getTrackFileRefByType({ ...dbTrack, ...submissionTrack }, "audio");
    const textRef = getTrackFileRefByType({ ...dbTrack, ...submissionTrack }, "text");
    const karaokeRef = getTrackFileRefByType({ ...dbTrack, ...submissionTrack }, "karaoke");
    const videoShotRef = getTrackFileRefByType({ ...dbTrack, ...submissionTrack }, "video_shot");
    const videoClipRef = getTrackFileRefByType({ ...dbTrack, ...submissionTrack }, "video_clip");

    return {
      id:
        asString(dbTrack.id) ??
        asString(submissionTrack.id) ??
        `track-${index + 1}`,
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
        remixers: unique(persons.remixers),
        coPerformers: unique(persons.coPerformers),
        producers: unique(persons.producers),
        musicAuthors: unique(persons.musicAuthors),
        lyricsAuthors: unique(persons.lyricsAuthors)
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
        audio: toFileItem({ ...audioRef, fallbackName: asString(submissionTrack.fileName) }),
        text: toFileItem(textRef),
        karaoke: toFileItem(karaokeRef),
        video_shot: toFileItem(videoShotRef),
        video_clip: toFileItem(videoClipRef)
      },
      raw_commentary: {
        lyrics: asString(submissionTrack.lyrics) ?? asString(dbTrack.text) ?? ""
      }
    };
  });

  const cover = resolveCoverItem(release, submissionData);
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
    cover,
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
        performers: unique(releasePersons.performers.length ? releasePersons.performers : [releasePerformer].filter(Boolean)),
        feats: unique(releasePersons.feats.length ? releasePersons.feats : [releaseFeat].filter(Boolean)),
        remixers: unique(releasePersons.remixers),
        coPerformers: unique(releasePersons.coPerformers),
        producers: unique(releasePersons.producers),
        musicAuthors: unique(releasePersons.musicAuthors),
        lyricsAuthors: unique(releasePersons.lyricsAuthors)
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

function resolveTrackIndex(release: Record<string, unknown>, trackId: string): number {
  const tracks = asArray(release.tracks ?? release.track);
  const index = tracks.findIndex((item) => {
    const row = asRecord(item);
    if (!row) return false;
    const id = asString(row.id);
    if (id === trackId) return true;
    const num = row.trackNumber;
    return typeof num === "number" && String(num) === trackId;
  });
  return index;
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
    const submissionData = parseSubmissionData(release);
    const coverImage = pickStoredFileRef(release.coverImage);
    if (coverImage.url || coverImage.storageKey) {
      return {
        kind: "cover",
        storageKey: coverImage.storageKey,
        url: coverImage.url,
        fileName: coverImage.fileName
      };
    }

    const coverUpload = pickStoredFileRef(submissionData?.coverUpload);
    if (coverUpload.url || coverUpload.storageKey) {
      return {
        kind: "cover",
        storageKey: coverUpload.storageKey,
        url: coverUpload.url,
        fileName: coverUpload.fileName
      };
    }

    const previewRef = pickLegacyFileRef(asString(release.preview));
    if (previewRef.url || previewRef.storageKey) {
      return {
        kind: "cover",
        storageKey: previewRef.storageKey,
        url: previewRef.url,
        fileName: previewRef.fileName
      };
    }
    return null;
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
  const trackIndex = resolveTrackIndex(release, parsedTrackFile.trackId);
  if (trackIndex < 0) return null;
  const submissionTracks = asArray(submissionData?.tracks);
  const dbTracks = asArray(release.tracks ?? release.track);
  const trackData = {
    ...(asRecord(dbTracks[trackIndex]) ?? {}),
    ...(asRecord(submissionTracks[trackIndex]) ?? {})
  };

  const resolved = getTrackFileRefByType(trackData, parsedTrackFile.kind);
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
  return mapAdminReleaseDetails(release);
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
