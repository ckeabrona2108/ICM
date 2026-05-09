import { ReleaseStatus, type Prisma } from "@prisma/client";

import type { ModerationRemark } from "@/lib/api/contracts";
import type {
  CabinetRelease,
  CabinetReleaseStatus,
  CabinetTrack
} from "@/lib/cabinet-types";
import {
  buildReleasePaymentDisplay,
  parseReleasePaymentSnapshot
} from "@/lib/release-payment";
import { allReleasePlatformCodes } from "@/lib/release-platforms";

export const cabinetReleaseSelect = {
  id: true,
  title: true,
  upc: true,
  isrc: true,
  createdAt: true,
  updatedAt: true,
  releaseDate: true,
  genre: true,
  status: true,
  priority: true,
  submissionData: true,
  moderationStartedAt: true,
  moderationRemarks: true,
  moderationReturnedAt: true,
  moderationComment: true,
  tracks: {
    select: {
      trackNumber: true,
      title: true,
      durationSec: true,
      isrc: true
    }
  },
  coverImage: {
    select: {
      url: true
    }
  }
} satisfies Prisma.ReleaseSelect;

type ReleaseWithTracks = Prisma.ReleaseGetPayload<{
  select: typeof cabinetReleaseSelect;
}>;

interface SubmissionDataLike {
  cover?: string | null;
  title?: string;
  genre?: string;
  label?: string;
  upc?: string;
  isrc?: string;
  preorderDate?: string;
  releaseDate?: string;
  startDate?: string;
  territoryMode?: "all" | "selected" | "exclude" | "cis";
  territoryCountries?: string[];
  platformMode?: "all" | "selected";
  platforms?: string[];
  persons?: Array<{ name?: string; role?: string }>;
  paymentSnapshot?: unknown;
}

function toCabinetStatus(status: ReleaseStatus): CabinetReleaseStatus {
  if (status === ReleaseStatus.PENDING_VERIFICATION) return "pending_verification";
  if (status === ReleaseStatus.MODERATION) return "moderation";
  if (status === ReleaseStatus.CHANGES_REQUIRED) return "changes_required";
  if (status === ReleaseStatus.REJECTED) return "rejected";
  if (status === ReleaseStatus.APPROVED) return "approved";
  if (status === ReleaseStatus.DISTRIBUTED) return "distributed";
  if (status === ReleaseStatus.ARCHIVED) return "archived";
  return "draft";
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  return date.toISOString().slice(0, 16).replace("T", " ");
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function parseSubmissionData(value: unknown): SubmissionDataLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SubmissionDataLike;
}

function withFallback(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
}

function parseModerationRemarks(value: unknown): ModerationRemark[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized: ModerationRemark[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const field = typeof item.field === "string" ? item.field.trim() : "";
    const message = typeof item.message === "string" ? item.message.trim() : "";
    const section =
      typeof item.section === "string" && item.section.trim()
        ? item.section.trim()
        : undefined;

    if (!field || !message) continue;
    normalized.push({ field, message, section });
  }

  return normalized.length > 0 ? normalized : undefined;
}

function mapTracks(tracks: ReleaseWithTracks["tracks"]): CabinetTrack[] {
  return tracks
    .slice()
    .sort((a, b) => a.trackNumber - b.trackNumber)
    .map((track) => ({
      num: track.trackNumber,
      title: track.title,
      duration: formatDuration(track.durationSec)
    }));
}

function deriveArtist(
  submissionData: SubmissionDataLike | null
): string {
  const persons = submissionData?.persons ?? [];
  const preferred = persons.find((person) => {
    const role = person.role?.toLowerCase() ?? "";
    return role.includes("исполн") || role.includes("artist");
  });
  return preferred?.name?.trim() || persons[0]?.name?.trim() || "Не указан";
}

function deriveTerritories(submissionData: SubmissionDataLike | null): {
  territories: string;
  territoriesCount?: number;
} {
  const mode = submissionData?.territoryMode ?? "all";
  const countries = submissionData?.territoryCountries ?? [];

  if (mode === "cis") {
    return { territories: "В СНГ" };
  }
  if (mode === "selected") {
    return {
      territories: "Только выбранные",
      territoriesCount: countries.length
    };
  }
  if (mode === "exclude") {
    return {
      territories: "Все кроме",
      territoriesCount: countries.length
    };
  }
  return { territories: "Все страны" };
}

function derivePlatforms(submissionData: SubmissionDataLike | null): {
  platforms: string;
  platformsCount?: number;
} {
  const mode = submissionData?.platformMode ?? "all";
  const selected = submissionData?.platforms ?? [];

  if (mode === "selected") {
    return {
      platforms: "Только выбранные",
      platformsCount: selected.length
    };
  }
  return {
    platforms: "Все площадки",
    platformsCount: allReleasePlatformCodes.length
  };
}

function resolveCoverUrl(params: {
  coverImageUrl?: string | null;
  submissionCover?: string | null;
}): string {
  const submission = params.submissionCover?.trim();
  if (submission) return submission;

  const direct = params.coverImageUrl?.trim();
  if (direct) return direct;

  return "";
}

export function mapReleaseToCabinetRelease(
  release: ReleaseWithTracks,
  number: number,
  paid?: boolean
): CabinetRelease {
  const submissionData = parseSubmissionData(release.submissionData);
  const territories = deriveTerritories(submissionData);
  const platforms = derivePlatforms(submissionData);
  const firstTrack = release.tracks
    .slice()
    .sort((a, b) => a.trackNumber - b.trackNumber)[0];

  const fallbackDate = "Дата не выбрана";
  const dbReleaseDate = formatDate(release.releaseDate);
  const createdAt = formatDate(release.createdAt);
  const releaseDate = withFallback(submissionData?.releaseDate, dbReleaseDate || fallbackDate);
  const preorderDate = withFallback(submissionData?.preorderDate, dbReleaseDate || fallbackDate);
  const startDate = withFallback(submissionData?.startDate, dbReleaseDate || fallbackDate);

  const oneTimePaid = paid ?? release.status === ReleaseStatus.DISTRIBUTED;
  const paymentSnapshot = parseReleasePaymentSnapshot(submissionData?.paymentSnapshot);
  const payment = buildReleasePaymentDisplay({
    paid: oneTimePaid,
    snapshot: paymentSnapshot
  });

  return {
    id: release.id,
    number,
    coverUrl: resolveCoverUrl({
      coverImageUrl: release.coverImage?.url,
      submissionCover: submissionData?.cover
    }),
    title: withFallback(submissionData?.title, release.title || "Без названия"),
    artist: deriveArtist(submissionData),
    upc: withFallback(submissionData?.upc, release.upc || ""),
    isrc: submissionData?.isrc?.trim() || release.isrc || firstTrack?.isrc || "",
    label: withFallback(submissionData?.label, "ICECREAMMUSIC"),
    createdAt: createdAt || fallbackDate,
    preorderDate,
    releaseDate,
    startDate,
    territories: territories.territories,
    territoriesCount: territories.territoriesCount,
    platforms: platforms.platforms,
    platformsCount: platforms.platformsCount,
    genre: withFallback(submissionData?.genre, release.genre || "Не указан"),
    status: toCabinetStatus(release.status),
    priority: Boolean(release.priority),
    paid: payment.kind !== "unpaid",
    paymentKind: payment.kind,
    paymentLabel: payment.label,
    paymentUsage: payment.usageLabel,
    paymentPlan: payment.plan,
    tracks: mapTracks(release.tracks),
    moderationStarted: Boolean(release.moderationStartedAt),
    moderationRemarks: parseModerationRemarks(release.moderationRemarks),
    moderationReturnedAt: release.moderationReturnedAt
      ? formatDateTime(release.moderationReturnedAt)
      : undefined,
    rejectionReason: release.moderationComment || undefined,
    submissionData: submissionData ?? undefined
  };
}
