import { Prisma, ReleaseStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { allReleasePlatformCodes } from "@/lib/release-platforms";

type FileKind = "audio" | "text" | "karaoke" | "video-shot" | "video-clip";

interface SubmissionDataLike {
  cover?: string | null;
  title?: string;
  subtitle?: string;
  genre?: string;
  label?: string;
  language?: string;
  upc?: string;
  preorderDate?: string;
  releaseDate?: string;
  startDate?: string;
  territoryCountries?: string[];
  platforms?: string[];
  platformMode?: "all" | "selected";
  territoryMode?: "all" | "selected" | "exclude" | "cis";
  moderatorComment?: string;
  priorityRelease?: boolean;
  realTimeDelivery?: boolean;
  yandexPreReleaseDate?: string;
  earlyRussiaStart?: boolean;
  persons?: Array<{ name?: string; role?: string }>;
  tracks?: SubmissionTrackLike[];
  extras?: Record<string, unknown>;
  karaoke?: string;
  karaokeText?: string;
  videoShot?: Record<string, unknown>;
  videoClip?: Record<string, unknown>;
  lyrics?: string;
}

interface SubmissionTrackLike {
  fileName?: string;
  hasAudio?: boolean;
  durationSec?: number;
  title?: string;
  subtitle?: string;
  isrc?: string;
  partnerCode?: string;
  metadataLanguage?: string;
  trackPersons?: Array<{ name?: string; role?: string }>;
  copyrightPct?: string;
  relatedRightsPct?: string;
  previewStart?: string;
  instantGratification?: boolean;
  focusTrack?: boolean;
  versionExplicit?: boolean;
  versionLive?: boolean;
  versionCover?: boolean;
  versionRemix?: boolean;
  versionInstrumental?: boolean;
  lyrics?: string;
  audioFile?: unknown;
  textFile?: unknown;
  karaokeFile?: unknown;
  videoShotFile?: unknown;
  videoClipFile?: unknown;
}

interface FileRefLike {
  fileName?: string | null;
  storageKey?: string | null;
  url?: string | null;
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

interface TrackRoleGroups extends PersonGroups {}

type FullReleaseRow = Prisma.ReleaseGetPayload<{
  include: {
    user: { select: { id: true; name: true } };
    tracks: true;
    coverImage: true;
    releaseFile: true;
    distributionStatus: {
      include: {
        platform: {
          select: {
            code: true;
            name: true;
          };
        };
      };
    };
  };
}>;

type LegacyReleaseRow = Omit<
  FullReleaseRow,
  "approvedAt" | "approvedBy" | "rejectedAt" | "rejectedBy" | "rejectionReason"
>;

function parseSubmissionData(value: unknown): SubmissionDataLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SubmissionDataLike;
}

function toDateOnly(value: Date | null): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: Date | null): string {
  if (!value) return "";
  return value.toISOString();
}

function readObject(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(normalized);
  }
  return list;
}

function roleMatch(role: string, patterns: string[]): boolean {
  const normalized = role.trim().toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function groupPersons(persons: Array<{ name?: string; role?: string }>): PersonGroups {
  const values = {
    performers: [] as string[],
    feats: [] as string[],
    remixers: [] as string[],
    coPerformers: [] as string[],
    producers: [] as string[],
    musicAuthors: [] as string[],
    lyricsAuthors: [] as string[]
  };

  for (const item of persons) {
    const name = String(item.name ?? "").trim();
    const role = String(item.role ?? "").trim();
    if (!name || !role) continue;

    if (roleMatch(role, ["исполн", "artist"])) values.performers.push(name);
    if (roleMatch(role, ["feat"])) values.feats.push(name);
    if (roleMatch(role, ["remix"])) values.remixers.push(name);
    if (roleMatch(role, ["соисполн", "co"])) values.coPerformers.push(name);
    if (roleMatch(role, ["продюсер", "producer"])) values.producers.push(name);
    if (roleMatch(role, ["автор музыки", "music author", "composer"])) values.musicAuthors.push(name);
    if (roleMatch(role, ["автор слов", "автор текста", "lyrics author", "lyricist"])) values.lyricsAuthors.push(name);
  }

  return {
    performers: uniqueNames(values.performers),
    feats: uniqueNames(values.feats),
    remixers: uniqueNames(values.remixers),
    coPerformers: uniqueNames(values.coPerformers),
    producers: uniqueNames(values.producers),
    musicAuthors: uniqueNames(values.musicAuthors),
    lyricsAuthors: uniqueNames(values.lyricsAuthors)
  };
}

function isMissingReleaseDecisionColumnError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("column `release.approvedat` does not exist") ||
    message.includes("column \"release\".\"approvedat\" does not exist") ||
    message.includes("column `release.rejectedat` does not exist") ||
    message.includes("column \"release\".\"rejectedat\" does not exist") ||
    message.includes("column `release.rejectionreason` does not exist") ||
    message.includes("column \"release\".\"rejectionreason\" does not exist")
  );
}

function parseFileRef(input: unknown): FileRefLike | null {
  if (!input) return null;

  if (typeof input === "string") {
    const url = input.trim();
    if (!url) return null;
    return { url };
  }

  if (typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;

  const url = typeof obj.url === "string" ? obj.url.trim() : "";
  const storageKey =
    typeof obj.storageKey === "string"
      ? obj.storageKey.trim()
      : typeof obj.key === "string"
        ? obj.key.trim()
        : "";
  const fileName =
    typeof obj.fileName === "string"
      ? obj.fileName.trim()
      : typeof obj.name === "string"
        ? obj.name.trim()
        : "";

  if (!url && !storageKey) return null;
  return {
    url: url || null,
    storageKey: storageKey || null,
    fileName: fileName || null
  };
}

function trackFileId(trackId: string, kind: FileKind): string {
  return `track-${trackId}-${kind}`;
}

export function mapAdminReleaseDetails(source: FullReleaseRow) {
  const submission = parseSubmissionData(source.submissionData);
  const submissionTracks = submission?.tracks ?? [];
  const releasePersons = groupPersons(submission?.persons ?? []);

  const coverUrl = submission?.cover?.trim() || source.coverImage?.url || "";
  const preorderDate = submission?.preorderDate?.trim() || toDateOnly(source.releaseDate);
  const startDate = submission?.startDate?.trim() || toDateOnly(source.releaseDate);
  const releaseDate = submission?.releaseDate?.trim() || toDateOnly(source.releaseDate);
  const metadataLanguage = submission?.language?.trim() || source.language || "";
  const subtitle = submission?.subtitle?.trim() || source.subtitle || "";
  const releaseType = source.type.toLowerCase();
  const genre = submission?.genre?.trim() || source.genre || "";
  const label = submission?.label?.trim() || "ICECREAMMUSIC";
  const upc = submission?.upc?.trim() || source.upc || "";

  const territoryCountries =
    (submission?.territoryCountries ?? [])
      .map((country) => String(country).trim())
      .filter(Boolean);
  const territoryMode = submission?.territoryMode ?? "all";
  const territoriesLabel =
    territoryMode === "all"
      ? "Все страны"
      : territoryCountries.length > 0
        ? `${territoryCountries.length} стран`
        : "Страны не выбраны";

  const selectedPlatformCodes =
    source.distributionStatus.length > 0
      ? source.distributionStatus.map((row) => row.platform.code)
      : (submission?.platforms ?? []).map((code) => String(code).trim()).filter(Boolean);
  const platformNames =
    source.distributionStatus.length > 0
      ? source.distributionStatus.map((row) => row.platform.name)
      : selectedPlatformCodes;
  const platformCount =
    submission?.platformMode === "all"
      ? allReleasePlatformCodes.length
      : selectedPlatformCodes.length;

  const hasGlobalAudio = Boolean(source.releaseFile?.storageKey || source.releaseFile?.url);
  const globalAudioFileName = source.releaseFile?.storageKey?.split("/").pop() ?? null;

  const tracks = source.tracks
    .slice()
    .sort((a, b) => a.trackNumber - b.trackNumber)
    .map((track, index) => {
      const sTrack = submissionTracks[index];
      const contributorsFromSubmission = sTrack?.trackPersons ?? [];
      const contributorsFromDb = Array.isArray(track.contributors)
        ? track.contributors
        : [];

      const contributors = (contributorsFromSubmission.length > 0
        ? contributorsFromSubmission
        : contributorsFromDb
      )
        .map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return null;
          const obj = item as Record<string, unknown>;
          const name = String(obj.name ?? "").trim();
          const role = String(obj.role ?? "").trim();
          if (!name || !role) return null;
          return { name, role };
        })
        .filter((item): item is { name: string; role: string } => Boolean(item));

      const grouped = groupPersons(contributors);
      const trackAudioFile = parseFileRef(sTrack?.audioFile);
      const textFile = parseFileRef(sTrack?.textFile);
      const karaokeFile = parseFileRef(sTrack?.karaokeFile);
      const videoShotFile = parseFileRef(sTrack?.videoShotFile);
      const videoClipFile = parseFileRef(sTrack?.videoClipFile);
      const hasLyricsText = Boolean((sTrack?.lyrics ?? track.lyrics ?? "").trim());

      return {
        id: track.id,
        title: sTrack?.title?.trim() || track.title,
        subtitle: sTrack?.subtitle?.trim() || track.subtitle || "",
        identification: {
          isrc: sTrack?.isrc?.trim() || track.isrc || "",
          partner_code: sTrack?.partnerCode?.trim() || track.partnerCode || ""
        },
        track_roles: grouped as TrackRoleGroups,
        rights: {
          copyright_pct: sTrack?.copyrightPct ?? track.copyrightPct,
          related_rights_pct: sTrack?.relatedRightsPct ?? track.relatedRightsPct
        },
        additional: {
          preview_start: sTrack?.previewStart?.trim() || track.previewStart || "",
          instant_gratification: Boolean(sTrack?.instantGratification ?? track.instantGratification),
          focus_track: Boolean(sTrack?.focusTrack ?? track.focusTrack)
        },
        version: {
          explicit: Boolean(sTrack?.versionExplicit ?? track.versionExplicit),
          live: Boolean(sTrack?.versionLive ?? track.versionLive),
          cover: Boolean(sTrack?.versionCover ?? track.versionCover),
          remix: Boolean(sTrack?.versionRemix ?? track.versionRemix),
          instrumental: Boolean(sTrack?.versionInstrumental ?? track.versionInstrumental)
        },
        usage: {
          metadata_language: sTrack?.metadataLanguage?.trim() || track.metadataLanguage || ""
        },
        duration_sec:
          typeof sTrack?.durationSec === "number" ? sTrack.durationSec : track.durationSec,
        files: {
          audio: {
            available: Boolean(trackAudioFile) || hasGlobalAudio,
            file_name:
              trackAudioFile?.fileName ??
              sTrack?.fileName?.trim() ??
              globalAudioFileName ??
              null,
            url: trackAudioFile?.url ?? source.releaseFile?.url ?? null,
            download_url: trackAudioFile
              ? `/api/admin/releases/${source.id}/files/${trackFileId(track.id, "audio")}/download`
              : hasGlobalAudio
                ? `/api/admin/releases/${source.id}/files/release-file/download`
                : null
          },
          text: {
            available: hasLyricsText || Boolean(textFile),
            file_name: textFile?.fileName ?? null,
            url: textFile?.url ?? null,
            download_url: textFile
              ? `/api/admin/releases/${source.id}/files/${trackFileId(track.id, "text")}/download`
              : null
          },
          karaoke: {
            available: Boolean(karaokeFile),
            file_name: karaokeFile?.fileName ?? null,
            url: karaokeFile?.url ?? null,
            download_url: karaokeFile
              ? `/api/admin/releases/${source.id}/files/${trackFileId(track.id, "karaoke")}/download`
              : null
          },
          video_shot: {
            available: Boolean(videoShotFile),
            file_name: videoShotFile?.fileName ?? null,
            url: videoShotFile?.url ?? null,
            download_url: videoShotFile
              ? `/api/admin/releases/${source.id}/files/${trackFileId(track.id, "video-shot")}/download`
              : null
          },
          video_clip: {
            available: Boolean(videoClipFile),
            file_name: videoClipFile?.fileName ?? null,
            url: videoClipFile?.url ?? null,
            download_url: videoClipFile
              ? `/api/admin/releases/${source.id}/files/${trackFileId(track.id, "video-clip")}/download`
              : null
          }
        },
        raw_commentary: {
          lyrics: sTrack?.lyrics ?? track.lyrics ?? ""
        }
      };
    });

  const extrasObject = readObject(submission?.extras);
  const karaokeText = submission?.karaokeText ?? submission?.karaoke ?? null;

  return {
    id: source.id,
    status: source.status.toLowerCase(),
    payment_status: source.status === ReleaseStatus.DISTRIBUTED ? "paid" : "unpaid",
    priority: Boolean(source.priority || submission?.priorityRelease),
    cover: {
      url: coverUrl,
      download_url: source.coverImage
        ? `/api/admin/releases/${source.id}/files/cover/download`
        : coverUrl || null
    },
    release: {
      metadata_language: metadataLanguage || "-",
      title: submission?.title?.trim() || source.title,
      subtitle: subtitle || "-",
      genre: genre || "-",
      release_type: releaseType || "-",
      label: label || "-",
      upc: upc || "-",
      dates: {
        preorder_date: preorderDate || "-",
        start_date: startDate || "-",
        release_date: releaseDate || "-"
      },
      territories: {
        mode: territoryMode,
        label: territoriesLabel,
        count: territoryCountries.length,
        countries: territoryCountries
      },
      platforms: {
        count: platformCount,
        selected_codes: selectedPlatformCodes,
        names: platformNames
      },
      roles: releasePersons,
      settings: {
        early_russia_start: Boolean(submission?.earlyRussiaStart),
        real_time_delivery: Boolean(submission?.realTimeDelivery),
        yandex_pre_release_date: submission?.yandexPreReleaseDate?.trim() || ""
      }
    },
    tracks,
    comment: source.moderationComment?.trim() || submission?.moderatorComment?.trim() || "",
    extras: {
      lyrics: submission?.lyrics ?? source.lyrics ?? null,
      karaoke: karaokeText,
      video_shot: readObject(submission?.videoShot),
      video_clip: readObject(submission?.videoClip),
      additional: extrasObject
    },
    created_at: toIsoDateTime(source.createdAt),
    submitted_to_moderation_at: toIsoDateTime(source.moderationStartedAt)
  };
}

export async function getAdminReleaseDetailsById(releaseId: string) {
  try {
    const release = await prisma.release.findUnique({
      where: { id: releaseId },
      include: {
        user: { select: { id: true, name: true } },
        tracks: true,
        coverImage: true,
        releaseFile: true,
        distributionStatus: {
          include: {
            platform: {
              select: { code: true, name: true }
            }
          }
        }
      }
    });
    if (!release) return null;
    return mapAdminReleaseDetails(release);
  } catch (error) {
    if (!isMissingReleaseDecisionColumnError(error)) throw error;

    const legacy = (await prisma.release.findUnique({
      where: { id: releaseId },
      select: {
        id: true,
        userId: true,
        artistProfileId: true,
        title: true,
        subtitle: true,
        slug: true,
        genre: true,
        subgenre: true,
        language: true,
        releaseKind: true,
        platformMode: true,
        platforms: true,
        partnerCode: true,
        rightsYear: true,
        releaseDate: true,
        type: true,
        status: true,
        explicit: true,
        upc: true,
        isrc: true,
        lyrics: true,
        moderationComment: true,
        moderationRemarks: true,
        moderationReturnedAt: true,
        moderationCancelledAt: true,
        moderationStartedAt: true,
        priority: true,
        coverMeta: true,
        submissionData: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true } },
        tracks: true,
        coverImage: true,
        releaseFile: true,
        distributionStatus: {
          include: {
            platform: {
              select: { code: true, name: true }
            }
          }
        }
      }
    })) as LegacyReleaseRow | null;

    if (!legacy) return null;

    const synthetic = {
      ...legacy,
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null
    } as FullReleaseRow;

    return mapAdminReleaseDetails(synthetic);
  }
}

function resolveTrackFileRefFromSubmission(
  submission: SubmissionDataLike | null,
  tracks: Array<{ id: string; trackNumber: number }>,
  trackId: string,
  kind: FileKind
): FileRefLike | null {
  if (!submission?.tracks || submission.tracks.length === 0) return null;
  const ordered = tracks.slice().sort((a, b) => a.trackNumber - b.trackNumber);
  const index = ordered.findIndex((track) => track.id === trackId);
  if (index < 0) return null;
  const sTrack = submission.tracks[index];
  if (!sTrack) return null;

  if (kind === "audio") return parseFileRef(sTrack.audioFile);
  if (kind === "text") return parseFileRef(sTrack.textFile);
  if (kind === "karaoke") return parseFileRef(sTrack.karaokeFile);
  if (kind === "video-shot") return parseFileRef(sTrack.videoShotFile);
  if (kind === "video-clip") return parseFileRef(sTrack.videoClipFile);
  return null;
}

export function resolveAdminReleaseFileTargetFromRelease(params: {
  fileId: string;
  release: {
    tracks?: Array<{ id: string; trackNumber: number }>;
    submissionData?: Prisma.JsonValue | null;
    coverImage: { storageKey: string; url: string } | null;
    releaseFile: { storageKey: string; url: string } | null;
  };
}): { kind: string; storageKey?: string; url?: string } | null {
  const normalizedFileId = params.fileId.trim().toLowerCase();
  const submission = parseSubmissionData(params.release.submissionData);
  if (normalizedFileId === "cover") {
    if (params.release.coverImage) {
      return {
        kind: "cover",
        storageKey: params.release.coverImage.storageKey,
        url: params.release.coverImage.url
      };
    }
    const submissionCover = submission?.cover?.trim();
    if (!submissionCover) return null;
    return {
      kind: "cover",
      url: submissionCover
    };
  }

  if (normalizedFileId === "release-file" || normalizedFileId === "audio") {
    if (!params.release.releaseFile) return null;
    return {
      kind: "release-file",
      storageKey: params.release.releaseFile.storageKey,
      url: params.release.releaseFile.url
    };
  }

  const match = /^track-(.+)-(audio|text|karaoke|video-shot|video-clip)$/u.exec(normalizedFileId);
  if (!match) return null;

  const trackId = match[1];
  const kind = match[2] as FileKind;
  const trackRef = resolveTrackFileRefFromSubmission(
    submission,
    params.release.tracks ?? [],
    trackId,
    kind
  );
  if (!trackRef) return null;

  return {
    kind: `track-${kind}`,
    storageKey: trackRef.storageKey ?? undefined,
    url: trackRef.url ?? undefined
  };
}

export async function getAdminReleaseDownloadTarget(params: { releaseId: string; fileId: string }) {
  const release = await prisma.release.findUnique({
    where: { id: params.releaseId },
    select: {
      id: true,
      submissionData: true,
      tracks: {
        select: {
          id: true,
          trackNumber: true
        }
      },
      coverImage: {
        select: {
          storageKey: true,
          url: true
        }
      },
      releaseFile: {
        select: {
          storageKey: true,
          url: true
        }
      }
    }
  });

  if (!release) return null;

  return resolveAdminReleaseFileTargetFromRelease({
    fileId: params.fileId,
    release
  });
}
