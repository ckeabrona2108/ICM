import type { verification_status } from "@prisma/client";

import type { CabinetRelease, CabinetReleaseStatus, CabinetTrack, CabinetTrackPerson } from "@/lib/cabinet-types";
import { getReleasePriorityFromRoles } from "@/lib/release-priority";
import { getReleasePaymentDisplayFromRoles } from "@/lib/release-quota";
import {
  getExplicitReleaseLifecycleStatus,
  getReleaseLifecycleStatus,
  shouldTreatReleaseAsApproved
} from "@/lib/release-counts";
import { getReleaseCoverAsset } from "@/lib/release-cover";
import { resolveTrackAudioAsset } from "@/lib/release-media-asset";

export interface CabinetReleaseSource {
  id: string;
  userId: string;
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
    subtitle: string | null;
    track: string;
    isrc: string | null;
    partner_code: string | null;
    language: string | null;
    preview_start: string | null;
    focus: boolean | null;
    explicit: boolean | null;
    author_rights: string | null;
    durationSec?: number | null;
    roles: unknown;
  }>;
}

interface SubmissionTrackLike {
  fileName?: string;
  title?: string;
  subtitle?: string;
  durationSec?: number | null;
  isrc?: string;
  partnerCode?: string;
  trackPersons?: CabinetTrackPerson[];
  copyrightPct?: string;
  relatedRightsPct?: string;
  previewStart?: string;
  focusTrack?: boolean;
  versionExplicit?: boolean;
  metadataLanguage?: string;
}

function inflateTrackData(value: { roles: unknown } & Record<string, unknown>): Record<string, unknown> {
  const roles = asRecord(value.roles);
  return roles ? { ...roles, ...value } : value;
}

function toCabinetStatus(
  status: verification_status,
  confirmed: boolean,
  roles: unknown,
  upc: string | null
): CabinetReleaseStatus {
  if (
    shouldTreatReleaseAsApproved({
      status,
      confirmed,
      upc,
      roles
    })
  ) {
    return "approved";
  }

  const explicitLifecycle = getExplicitReleaseLifecycleStatus(roles);
  const lifecycle = getReleaseLifecycleStatus(status, roles);

  if (lifecycle === "approved") return "approved";
  if (lifecycle === "changes_required") return "changes_required";
  if (lifecycle === "pending_verification") return "pending_verification";
  if (lifecycle === "moderation") return "moderation";
  if (lifecycle === "draft") return "draft";
  if (lifecycle === "archived") return "archived";

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

function resolveReleaseUpc(source: { upc: string | null; roles: unknown }): string | null {
  const explicitUpc = source.upc?.trim() || null;
  if (explicitUpc) return explicitUpc;
  const root = asRecord(source.roles);
  const submission = root ? asRecord(root.submissionData) : null;
  const fallbackUpc =
    asString(submission?.upc) ??
    asString(root?.upc) ??
    asString(root?.releaseUpc) ??
    asString(root?.release_upc);
  return fallbackUpc ?? null;
}

function normalizeTrackPersons(value: unknown): CabinetTrackPerson[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asRecord(item))
    .filter(Boolean)
    .map((item) => ({
      name: asString(item?.name) ?? asString(item?.person) ?? "",
      role: asString(item?.role) ?? ""
    }))
    .filter((item) => item.name && item.role);
}

function resolveReleaseArtist(source: { performer: string | null; roles: unknown }): string | null {
  const explicit = source.performer?.trim();
  if (explicit) return explicit;

  const root = asRecord(source.roles);
  const submission = root ? asRecord(root.submissionData) : null;
  const personsRaw = submission?.persons;
  if (!Array.isArray(personsRaw)) return null;

  const performerNames = personsRaw
    .map((item) => asRecord(item))
    .filter(Boolean)
    .filter((item) => {
      const role = asString(item?.role)?.toLowerCase();
      return role === "исполнитель";
    })
    .map((item) => asString(item?.name) ?? "")
    .filter(Boolean);

  return performerNames.join(", ") || null;
}

async function mapTracks(
  tracks: CabinetReleaseSource["track"],
  submissionTracks: SubmissionTrackLike[]
): Promise<CabinetTrack[]> {
  if (tracks.length === 0 && submissionTracks.length > 0) {
    return submissionTracks.map((track, index) => ({
      num: index + 1,
      title: track.title?.trim() || track.fileName?.trim() || `Трек ${index + 1}`,
      duration: formatDurationFromSeconds(track.durationSec) ?? "00:00",
      audioUrl: null,
      subtitle: track.subtitle?.trim() || "",
      isrc: track.isrc?.trim() || null,
      partnerCode: track.partnerCode?.trim() || null,
      trackPersons: normalizeTrackPersons(track.trackPersons),
      copyrightPct: track.copyrightPct?.trim() || null,
      relatedRightsPct: track.relatedRightsPct?.trim() || null,
      previewStart: track.previewStart?.trim() || null,
      focusTrack: Boolean(track.focusTrack),
      versionExplicit: Boolean(track.versionExplicit),
      metadataLanguage: track.metadataLanguage?.trim() || null,
      durationSec: track.durationSec ?? null
    }));
  }

  return Promise.all(
    tracks
      .slice()
      .sort((a, b) => a.index - b.index)
      .map(async (track, index) => {
      const trackData = inflateTrackData(track as typeof track & Record<string, unknown>);
      const resolvedAudio = await resolveTrackAudioAsset({
        trackId: track.id,
        trackTitle: track.title,
        audioFile: trackData.audioFile,
        audioUpload: trackData.audioUpload,
        audioUrl: trackData.audioUrl,
        audio: trackData.audio,
        track: track.track
      });
      const submissionTrack = submissionTracks[index];
      const resolvedDurationSec = typeof submissionTrack?.durationSec === "number" ? submissionTrack.durationSec : null;

      return {
        num: track.index > 0 ? track.index : index + 1,
        title: track.title,
        duration: normalizeDuration(track.track),
        audioUrl: resolvedAudio.url,
        subtitle: track.subtitle?.trim() || "",
        isrc: track.isrc ?? null,
        partnerCode: track.partner_code ?? null,
        trackPersons: normalizeTrackPersons(track.roles),
        copyrightPct: track.author_rights ?? null,
        relatedRightsPct: null,
        previewStart: track.preview_start ?? null,
        focusTrack: Boolean(track.focus),
        versionExplicit: Boolean(track.explicit),
        metadataLanguage: track.language ?? null,
        durationSec: resolvedDurationSec
      };
    })
  );
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

export async function mapReleaseToCabinetRelease(release: CabinetReleaseSource, number: number): Promise<CabinetRelease> {
  const submissionTracks = parseSubmissionTracks(release.roles);
  const mappedTracks = await mapTracks(release.track, submissionTracks);
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
  const resolvedUpc = resolveReleaseUpc({
    upc: release.upc,
    roles: release.roles
  });
  const cover = await getReleaseCoverAsset({
    id: release.id,
    preview: release.preview,
    roles: release.roles,
    userId: release.userId,
    title: release.title
  });
  const cabinetStatus = toCabinetStatus(
    release.status,
    release.confirmed,
    release.roles,
    resolvedUpc
  );
  return {
    id: release.id,
    number,
    coverUrl: cover.url ?? "",
    coverUrlCandidates: cover.candidateUrls,
    title: release.title || "Без названия",
    artist: resolveReleaseArtist({ performer: release.performer, roles: release.roles }) || "Не указан",
    upc: resolvedUpc || "",
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
    status: cabinetStatus,
    paid: Boolean(release.confirmed),
    paymentKind: release.confirmed ? paymentDisplay?.kind ?? "paid" : "unpaid",
    paymentLabel: release.confirmed ? paymentDisplay?.label ?? "Оплачен" : "Не оплачен",
    paymentPlan: paymentDisplay?.usage?.plan ?? null,
    tracks: mappedTracks,
    moderationStarted: cabinetStatus === "moderation" && Boolean(release.confirmed),
    priority: getReleasePriorityFromRoles(release.roles, Boolean(release.priority)),
    submissionData
  };
}
