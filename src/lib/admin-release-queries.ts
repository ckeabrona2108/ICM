import { ReleaseStatus, Role, type Prisma } from "@prisma/client";

import type { ModerationRemark } from "@/lib/api/contracts";
import type { AdminReleaseDetails, AdminReleaseStatus } from "@/lib/admin-data";
import { allReleasePlatformCodes } from "@/lib/release-platforms";
import { prisma } from "@/lib/prisma";

export type AdminReleaseStatusFilter = "moderation" | "all" | "approved" | "rejected";

type AdminReleaseSource = Prisma.ReleaseGetPayload<{
  include: {
    tracks: true;
    user: {
      select: {
        role: true;
        name: true;
      };
    };
    coverImage: {
      select: {
        url: true;
      };
    };
  };
}>;

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
  territoryMode?: "all" | "selected" | "exclude" | "cis";
  territoryCountries?: string[];
  platformMode?: "all" | "selected";
  platforms?: string[];
  realTimeDelivery?: boolean;
  yandexPreReleaseDate?: string;
  persons?: Array<{ name?: string; role?: string }>;
  tracks?: Array<{
    title?: string;
    subtitle?: string;
    isrc?: string;
    partnerCode?: string;
    metadataLanguage?: string;
    previewStart?: string;
    instantGratification?: boolean;
    focusTrack?: boolean;
    versionExplicit?: boolean;
    versionLive?: boolean;
    versionCover?: boolean;
    versionRemix?: boolean;
    versionInstrumental?: boolean;
    copyrightPct?: string;
    relatedRightsPct?: string;
    trackPersons?: Array<{ name?: string; role?: string }>;
  }>;
}

function parseSubmissionData(value: unknown): SubmissionDataLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SubmissionDataLike;
}

function parseModerationRemarks(value: unknown): ModerationRemark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const remarks: ModerationRemark[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const field = typeof item.field === "string" ? item.field.trim() : "";
    const message = typeof item.message === "string" ? item.message.trim() : "";
    const section =
      typeof item.section === "string" && item.section.trim()
        ? item.section.trim()
        : undefined;
    if (!field || !message) continue;
    remarks.push({ field, message, section });
  }
  return remarks.length > 0 ? remarks : undefined;
}

function formatDate(value: Date): string {
  const dd = String(value.getUTCDate()).padStart(2, "0");
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = value.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatDateTime(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

function toAdminStatus(status: ReleaseStatus): AdminReleaseStatus {
  if (status === ReleaseStatus.DRAFT) {
    return "draft";
  }
  if (status === ReleaseStatus.MODERATION) {
    return "moderation";
  }
  if (status === ReleaseStatus.CHANGES_REQUIRED) {
    return "changes_required";
  }
  if (status === ReleaseStatus.APPROVED || status === ReleaseStatus.DISTRIBUTED) {
    return "approved";
  }
  if (status === ReleaseStatus.REJECTED) {
    return "rejected";
  }
  return "draft";
}

function toRoleFilter(role: Role): "artist" | "label" | "studio" {
  if (role === Role.ADMIN || role === Role.MODERATOR) return "label";
  return "artist";
}

function personsByRole(
  persons: Array<{ name?: string; role?: string }> | undefined,
  matcher: (role: string) => boolean
): string {
  const result =
    persons
      ?.filter((person) => matcher((person.role ?? "").toLowerCase()))
      .map((person) => person.name?.trim())
      .filter(Boolean) ?? [];
  return result.join(", ");
}

export function resolveAdminReleaseCoverUrl(params: {
  sourceCoverUrl?: string | null;
  submissionCover?: string | null;
}): string {
  const submissionCover = params.submissionCover?.trim();
  if (submissionCover) return submissionCover;
  const direct = params.sourceCoverUrl?.trim();
  if (direct) return direct;
  return "/hero/drop.png";
}

function resolveCoverUrl(source: AdminReleaseSource, submission: SubmissionDataLike | null): string {
  return resolveAdminReleaseCoverUrl({
    sourceCoverUrl: source.coverImage?.url,
    submissionCover: submission?.cover
  });
}

function mapRelease(source: AdminReleaseSource): AdminReleaseDetails {
  const submission = parseSubmissionData(source.submissionData);
  const coverUrl = resolveCoverUrl(source, submission);
  const persons = submission?.persons ?? [];
  const territoriesCount = submission?.territoryCountries?.length ?? 244;
  const platformsCount =
    submission?.platformMode === "selected"
      ? submission.platforms?.length ?? 0
      : allReleasePlatformCodes.length;
  const moderationRemarks = parseModerationRemarks(source.moderationRemarks);
  return {
    id: source.id,
    role: toRoleFilter(source.user.role),
    title: submission?.title?.trim() || source.title,
    subtitle: submission?.subtitle?.trim() || "",
    coverUrl,
    label: submission?.label?.trim() || "ICECREAMMUSIC",
    upc: submission?.upc?.trim() || source.upc || "",
    preorderDate: submission?.preorderDate?.trim() || formatDate(source.releaseDate),
    releaseDate: submission?.releaseDate?.trim() || formatDate(source.releaseDate),
    startDate: submission?.startDate?.trim() || formatDate(source.releaseDate),
    territories: submission?.territoryMode === "cis" ? "В СНГ" : "Все страны",
    territoriesCount,
    platformsCount,
    genre: submission?.genre?.trim() || source.genre,
    status: toAdminStatus(source.status),
    submittedAt: source.moderationStartedAt
      ? formatDateTime(source.moderationStartedAt)
      : formatDateTime(source.updatedAt),
    approvedAt: source.approvedAt ? formatDateTime(source.approvedAt) : undefined,
    rejectedAt: source.rejectedAt ? formatDateTime(source.rejectedAt) : undefined,
    rejectionReason: source.rejectionReason || undefined,
    moderationComment: source.moderationComment || undefined,
    moderationRemarks,
    moderationReturnedAt: source.moderationReturnedAt
      ? formatDateTime(source.moderationReturnedAt)
      : undefined,
    priority: Boolean(source.priority),
    paid: source.status === ReleaseStatus.DISTRIBUTED,
    metadataLanguage: submission?.language || source.language,
    releaseType: source.type.toLowerCase(),
    artists:
      personsByRole(
        persons,
        (role) => role.includes("исполн") || role.includes("artist")
      ) || source.user.name,
    feat: personsByRole(persons, (role) => role.includes("соисполн") || role.includes("feat")),
    countryStartEarly: false,
    realTimeDelivery: Boolean(submission?.realTimeDelivery),
    yandexDate: submission?.yandexPreReleaseDate?.trim() || "",
    previewUrl: coverUrl,
    tracks: source.tracks
      .slice()
      .sort((a, b) => a.trackNumber - b.trackNumber)
      .map((track, index) => {
        const trackSubmission = submission?.tracks?.[index];
        const trackPersons = trackSubmission?.trackPersons ?? [];
        return {
          id: track.id,
          title: trackSubmission?.title?.trim() || track.title,
          subtitle: trackSubmission?.subtitle?.trim() || "",
          isrc: trackSubmission?.isrc?.trim() || track.isrc || "",
          partnerCode: trackSubmission?.partnerCode?.trim() || track.partnerCode || "",
          artists: personsByRole(
            trackPersons,
            (role) => role.includes("исполн") || role.includes("artist")
          ),
          feat: personsByRole(trackPersons, (role) => role.includes("соисполн") || role.includes("feat")),
          musicAuthor: personsByRole(trackPersons, (role) => role.includes("автор музыки")),
          lyricsAuthor: personsByRole(
            trackPersons,
            (role) => role.includes("автор текста") || role.includes("автор слов")
          ),
          copyright: trackSubmission?.copyrightPct || "0",
          neighboringRights: trackSubmission?.relatedRightsPct || "100",
          language: trackSubmission?.metadataLanguage || track.metadataLanguage || "",
          explicit: Boolean(trackSubmission?.versionExplicit || track.versionExplicit),
          live: Boolean(trackSubmission?.versionLive || track.versionLive),
          cover: Boolean(trackSubmission?.versionCover || track.versionCover),
          remix: Boolean(trackSubmission?.versionRemix || track.versionRemix),
          instrumental: Boolean(
            trackSubmission?.versionInstrumental || track.versionInstrumental
          ),
          prereleaseStart: trackSubmission?.previewStart || track.previewStart || "",
          instantGratification: trackSubmission?.instantGratification ? "Да" : "-",
          focusTrack: Boolean(trackSubmission?.focusTrack || track.focusTrack)
        };
      }),
  };
}

function resolveStatuses(filter: AdminReleaseStatusFilter): ReleaseStatus[] | undefined {
  if (filter === "moderation") return [ReleaseStatus.MODERATION];
  if (filter === "approved") return [ReleaseStatus.APPROVED, ReleaseStatus.DISTRIBUTED];
  if (filter === "rejected") return [ReleaseStatus.REJECTED];
  return undefined;
}

function resolveOrderBy(filter: AdminReleaseStatusFilter): Prisma.ReleaseOrderByWithRelationInput[] {
  if (filter === "moderation") {
    return [{ moderationStartedAt: "desc" }, { updatedAt: "desc" }];
  }
  if (filter === "approved") {
    return [{ approvedAt: "desc" }, { updatedAt: "desc" }];
  }
  if (filter === "rejected") {
    return [{ rejectedAt: "desc" }, { updatedAt: "desc" }];
  }
  return [{ updatedAt: "desc" }];
}

function resolveLegacyOrderBy(
  filter: AdminReleaseStatusFilter
): Prisma.ReleaseOrderByWithRelationInput[] {
  if (filter === "moderation") {
    return [{ moderationStartedAt: "desc" }, { updatedAt: "desc" }];
  }
  return [{ updatedAt: "desc" }];
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

export async function getAdminReleases(
  filter: AdminReleaseStatusFilter = "all"
): Promise<AdminReleaseDetails[]> {
  const statuses = resolveStatuses(filter);
  try {
    const releases = await prisma.release.findMany({
      where: statuses ? { status: { in: statuses } } : undefined,
      include: {
        tracks: true,
        user: {
          select: {
            role: true,
            name: true
          }
        },
        coverImage: {
          select: {
            url: true
          }
        }
      },
      orderBy: resolveOrderBy(filter)
    });

    return releases.map(mapRelease);
  } catch (error) {
    if (!isMissingReleaseDecisionColumnError(error)) {
      throw error;
    }

    const legacyRows = await prisma.release.findMany({
      where: statuses ? { status: { in: statuses } } : undefined,
      select: {
        id: true,
        title: true,
        genre: true,
        releaseDate: true,
        status: true,
        updatedAt: true,
        upc: true,
        language: true,
        type: true,
        submissionData: true,
        moderationStartedAt: true,
        moderationComment: true,
        moderationRemarks: true,
        moderationReturnedAt: true,
        tracks: true,
        user: {
          select: {
            role: true,
            name: true
          }
        },
        coverImage: {
          select: {
            url: true
          }
        }
      },
      orderBy: resolveLegacyOrderBy(filter)
    });

    return legacyRows.map((row) =>
      mapRelease({
        ...row,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null
      } as AdminReleaseSource)
    );
  }
}
