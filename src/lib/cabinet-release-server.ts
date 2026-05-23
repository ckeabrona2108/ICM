import type { verification_status } from "@prisma/client";

import type { CabinetRelease, CabinetReleaseStatus, CabinetTrack } from "@/lib/cabinet-types";
import { normalizeNextImageSrc } from "@/lib/image-src";
import { getReleasePriorityFromRoles } from "@/lib/release-priority";
import { getReleasePaymentDisplayFromRoles } from "@/lib/release-quota";
import { resolveStoredFileUrl } from "@/lib/s3";

export interface CabinetReleaseSource {
  id: string;
  title: string;
  upc: string | null;
  date: Date;
  startDate: Date;
  preorderDate: Date;
  genre: string;
  status: verification_status;
  confirmed: boolean;
  labelName: string | null;
  preview: string;
  performer: string | null;
  roles: unknown;
  priority?: boolean | null;
  track: Array<{
    id: string;
    index: number;
    title: string;
    track: string;
    isrc: string | null;
  }>;
}

interface SubmissionTrackLike {
  fileName?: string;
  title?: string;
  durationSec?: number | null;
  isrc?: string;
}

function isSubmittedToModeration(roles: unknown): boolean {
  const root = asRecord(roles);
  return root?.submittedToModeration === true;
}

function toCabinetStatus(
  status: verification_status,
  confirmed: boolean,
  roles: unknown
): CabinetReleaseStatus {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "moderating") {
    if (isSubmittedToModeration(roles)) return "moderation";
    return confirmed ? "moderation" : "draft";
  }
  return confirmed ? "moderation" : "draft";
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function normalizeDuration(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "00:00";
  if (/^\d{1,2}:\d{2}$/u.test(raw)) {
    const [m, s] = raw.split(":");
    return `${m.padStart(2, "0")}:${s}`;
  }
  return "00:00";
}

function formatDurationFromSeconds(value: number | null | undefined): string | null {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return null;
  const safe = Math.max(0, Math.floor(value ?? 0));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function parseSubmissionTracks(roles: unknown): SubmissionTrackLike[] {
  const root = asRecord(roles);
  const submission = root ? asRecord(root.submissionData) : null;
  const tracksRaw = submission?.tracks;
  if (!Array.isArray(tracksRaw)) return [];
  return tracksRaw
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => item as SubmissionTrackLike);
}

function mapTracks(
  tracks: CabinetReleaseSource["track"],
  submissionTracks: SubmissionTrackLike[]
): CabinetTrack[] {
  if (tracks.length === 0 && submissionTracks.length > 0) {
    return submissionTracks.map((track, index) => ({
      num: index + 1,
      title: track.title?.trim() || track.fileName?.trim() || `Трек ${index + 1}`,
      duration: formatDurationFromSeconds(track.durationSec) ?? "00:00"
    }));
  }

  return tracks
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((track) => ({
      num: track.index,
      title: track.title,
      duration: normalizeDuration(track.track)
    }));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveCoverFromRoles(roles: unknown): string | null {
  const root = asRecord(roles);
  if (!root) return null;

  const submission = asRecord(root.submissionData);
  const topCoverUpload = asRecord(root.coverUpload);
  const submissionCoverUpload = submission ? asRecord(submission.coverUpload) : null;

  const candidates: Array<unknown> = [
    root.cover,
    topCoverUpload?.url,
    topCoverUpload?.storageKey,
    submission?.cover,
    submissionCoverUpload?.url,
    submissionCoverUpload?.storageKey
  ];

  for (const value of candidates) {
    const candidate = asString(value);
    if (!candidate) continue;
    const normalizedFromStorage = normalizeNextImageSrc(
      resolveStoredFileUrl({ url: candidate, storageKey: null })
    );
    const normalizedDirect = normalizeNextImageSrc(candidate);
    const normalized = normalizedFromStorage ?? normalizedDirect;
    if (normalized) return normalized;
  }

  return null;
}

function looksLikeOnlyExtension(value: string): boolean {
  return /^[a-z0-9]{2,8}$/iu.test(value.trim().replace(/^\./u, ""));
}

function normalizeExtension(value: string): string | null {
  const normalized = value.trim().replace(/^\./u, "").toLowerCase();
  if (!normalized) return null;
  return /^[a-z0-9]{2,8}$/u.test(normalized) ? normalized : null;
}

function extractBaseFileName(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const withoutQuery = normalized.split("?")[0]?.split("#")[0] ?? normalized;
  const raw = withoutQuery.split("/").filter(Boolean).at(-1) ?? "";
  if (!raw || !raw.includes(".")) return null;
  return raw;
}

function resolveReleaseCoverUrl(releaseId: string, preview: string, roles: unknown): string {
  const rawPreview = preview.trim();
  const normalizedPreview = normalizeNextImageSrc(rawPreview);
  if (
    normalizedPreview &&
    (rawPreview.startsWith("/") ||
      rawPreview.startsWith("http://") ||
      rawPreview.startsWith("https://"))
  ) {
    return normalizedPreview;
  }

  const resolvedPreviewUrl = normalizeNextImageSrc(
    resolveStoredFileUrl({ url: rawPreview, storageKey: null })
  );
  if (resolvedPreviewUrl) return resolvedPreviewUrl;

  const legacyCandidates: string[] = [];
  if (rawPreview) {
    if (looksLikeOnlyExtension(rawPreview)) {
      const ext = normalizeExtension(rawPreview);
      if (ext) {
        legacyCandidates.push(
          `previews/${releaseId}.${ext}`,
          `covers/${releaseId}.${ext}`,
          `uploads/${releaseId}/release-cover.${ext}`,
          `uploads/${releaseId}.${ext}`
        );
      }
    }

    const baseFileName = extractBaseFileName(rawPreview);
    if (baseFileName) {
      legacyCandidates.push(
        `previews/${baseFileName}`,
        `covers/${baseFileName}`,
        `uploads/${baseFileName}`,
        `uploads/${releaseId}/${baseFileName}`
      );
    }
  }

  for (const storageKey of legacyCandidates) {
    const candidate = normalizeNextImageSrc(resolveStoredFileUrl({ storageKey }));
    if (candidate) return candidate;
  }

  return resolveCoverFromRoles(roles) ?? "";
}

export function mapReleaseToCabinetRelease(release: CabinetReleaseSource, number: number): CabinetRelease {
  const submissionTracks = parseSubmissionTracks(release.roles);
  const mappedTracks = mapTracks(release.track, submissionTracks);
  const firstDbTrack = release.track.slice().sort((a, b) => a.index - b.index)[0];
  const firstSubmissionTrack = submissionTracks[0];
  const paymentDisplay = release.confirmed
    ? getReleasePaymentDisplayFromRoles(release.roles)
    : null;
  const submissionData =
    release.roles &&
    typeof release.roles === "object" &&
    !Array.isArray(release.roles) &&
    "submissionData" in (release.roles as Record<string, unknown>)
      ? (release.roles as Record<string, unknown>).submissionData
      : undefined;
  return {
    id: release.id,
    number,
    coverUrl: resolveReleaseCoverUrl(release.id, release.preview, release.roles),
    title: release.title || "Без названия",
    artist: release.performer?.trim() || "Не указан",
    upc: release.upc || "",
    isrc: firstDbTrack?.isrc || firstSubmissionTrack?.isrc?.trim() || "",
    label: release.labelName?.trim() || "ICECREAMMUSIC",
    createdAt: formatDate(release.date),
    preorderDate: formatDate(release.preorderDate),
    releaseDate: formatDate(release.date),
    startDate: formatDate(release.startDate),
    territories: "Все страны",
    territoriesCount: 244,
    platforms: "Все площадки",
    platformsCount: 0,
    genre: release.genre || "Не указан",
    status: toCabinetStatus(release.status, release.confirmed, release.roles),
    paid: Boolean(release.confirmed),
    paymentKind: release.confirmed ? paymentDisplay?.kind ?? "paid" : "unpaid",
    paymentLabel: release.confirmed ? paymentDisplay?.label ?? "Оплачен" : "Не оплачен",
    paymentPlan: paymentDisplay?.usage?.plan ?? null,
    tracks: mappedTracks,
    moderationStarted: release.status === "moderating",
    priority: getReleasePriorityFromRoles(release.roles, Boolean(release.priority)),
    submissionData
  };
}
