import { prisma } from "@/lib/prisma";
import type { AdminReleaseDetails, AdminReleaseStatus } from "@/lib/admin-data";
import { getReleasePriorityFromRoles } from "@/lib/release-priority";
import { getReleasePaymentDisplayFromRoles } from "@/lib/release-quota";
import {
  getReleaseLifecycleStatus,
  shouldTreatReleaseAsApproved
} from "@/lib/release-counts";
import { getReleaseCoverAsset } from "@/lib/release-cover";

export type AdminReleaseStatusFilter =
  | "moderation"
  | "pending_verification"
  | "all"
  | "approved"
  | "rejected";

function formatDate(value: Date): string {
  const dd = String(value.getUTCDate()).padStart(2, "0");
  const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = value.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatDateTime(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

export function toAdminStatus(status: string, roles?: unknown): AdminReleaseStatus {
  const lifecycle = getReleaseLifecycleStatus(status, roles);
  if (lifecycle === "approved" || lifecycle === "archived") return "approved";
  if (lifecycle === "changes_required") return "changes_required";
  if (lifecycle === "draft") return "draft";
  if (lifecycle === "pending_verification") return "pending_verification";
  return "moderation";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function resolveReleaseUpc(source: { upc: string | null; roles: unknown }): string | null {
  const explicitUpc = source.upc?.trim() || null;
  if (explicitUpc) return explicitUpc;
  const root = asRecord(source.roles);
  const submission = root ? asRecord(root.submissionData) : null;
  return (
    asString(submission?.upc) ??
    asString(root?.upc) ??
    asString(root?.releaseUpc) ??
    asString(root?.release_upc) ??
    null
  );
}

function isAcceptedForAdminView(source: {
  status: string;
  confirmed: boolean;
  upc: string | null;
  roles: unknown;
}): boolean {
  return shouldTreatReleaseAsApproved({
    status: source.status,
    confirmed: source.confirmed,
    upc: source.upc,
    roles: source.roles
  });
}

function isActuallyOnModeration(source: {
  status: string;
  confirmed: boolean;
  roles: unknown;
}): boolean {
  const lifecycle = getReleaseLifecycleStatus(source.status, source.roles);
  return lifecycle === "moderation" || lifecycle === "pending_verification";
}

function matchStatus(source: {
  status: string;
  confirmed: boolean;
  upc: string | null;
  roles: unknown;
}, filter: AdminReleaseStatusFilter): boolean {
  const status = source.status;
  const accepted = isAcceptedForAdminView(source);

  if (filter === "all") return true;
  if (filter === "approved") return accepted;
  if (filter === "rejected") return status === "rejected";
  if (filter === "pending_verification") return status === "pending_verification";
  return isActuallyOnModeration(source);
}

export function resolveAdminReleaseCoverUrl(input: {
  sourceCoverUrl: string;
  submissionCover: string;
}): string {
  const submissionCover = input.submissionCover.trim();
  if (submissionCover) return submissionCover;
  const sourceCoverUrl = input.sourceCoverUrl.trim();
  return sourceCoverUrl || "/hero/drop.png";
}

function emptyTrack(id: string): AdminReleaseDetails["tracks"][number] {
  return {
    id,
    title: "",
    subtitle: "",
    isrc: "",
    partnerCode: "",
    artists: "",
    feat: "",
    musicAuthor: "",
    lyricsAuthor: "",
    copyright: "",
    neighboringRights: "",
    language: "",
    explicit: false,
    live: false,
    cover: false,
    remix: false,
    instrumental: false,
    prereleaseStart: "",
    instantGratification: "",
    focusTrack: false
  };
}


export async function getAdminReleases(filter: AdminReleaseStatusFilter): Promise<AdminReleaseDetails[]> {
  const releases = await prisma.release.findMany({
    select: {
      id: true,
      title: true,
      subtitle: true,
      genre: true,
      date: true,
      startDate: true,
      preorderDate: true,
      status: true,
      confirmed: true,
      labelName: true,
      preview: true,
      performer: true,
      roles: true,
      upc: true,
      language: true,
      type: true,
      feat: true,
      earlyStartInRussia: true,
      realTimeDelivery: true,
      yandexSoonNewRelease: true,
      rejectReason: true,
      moderatorComment: true,
      userId: true,
      user: {
        select: {
          name: true,
          isAdmin: true
        }
      },
      track: {
        select: {
          id: true,
          title: true,
          subtitle: true,
          isrc: true,
          partner_code: true,
          language: true,
          explicit: true,
          live: true,
          cover: true,
          remix: true,
          instrumental: true,
          preview_start: true,
          focus: true
        },
        orderBy: { index: "asc" }
      }
    },
    orderBy: { date: "desc" }
  });

  const mapped = await Promise.all(
    releases
      .filter((release) => {
      const resolvedUpc = resolveReleaseUpc({
        upc: release.upc,
        roles: release.roles
      });
      return matchStatus(
        {
          status: release.status,
          confirmed: release.confirmed,
          upc: resolvedUpc,
          roles: release.roles
        },
        filter
      );
    })
        .map(async (source) => {
      const resolvedUpc = resolveReleaseUpc({
        upc: source.upc,
        roles: source.roles
      });
      const accepted = isAcceptedForAdminView({
        status: source.status,
        confirmed: source.confirmed,
        upc: resolvedUpc,
        roles: source.roles
      });
      const tracks = source.track.length
        ? source.track.map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: item.subtitle ?? "",
            isrc: item.isrc ?? "",
            partnerCode: item.partner_code ?? "",
            artists: source.performer ?? "",
            feat: source.feat ?? "",
            musicAuthor: "",
            lyricsAuthor: "",
            copyright: "",
            neighboringRights: "",
            language: item.language,
            explicit: item.explicit,
            live: item.live,
            cover: item.cover,
            remix: item.remix,
            instrumental: item.instrumental,
            prereleaseStart: item.preview_start,
            instantGratification: "",
            focusTrack: item.focus
          }))
        : [emptyTrack(`${source.id}-track`)];

      const cover = await getReleaseCoverAsset({
        id: source.id,
        preview: source.preview,
        roles: source.roles,
        userId: source.userId,
        title: source.title
      });
      const previewFallbackCover =
        !cover.url && source.preview
          ? await getReleaseCoverAsset({
              id: source.id,
              preview: source.preview,
              roles: {},
              userId: source.userId,
              title: source.title
            })
          : null;
      const resolvedCover = previewFallbackCover?.url ? previewFallbackCover : cover;
      if (process.env.NODE_ENV !== "production") {
        console.log("[admin-releases-api:cover]", {
          releaseId: source.id,
          title: source.title,
          preview: source.preview,
          coverUrl: resolvedCover.url ?? "",
          coverStorageKey: resolvedCover.storageKey
        });
      }
      const paymentDisplay = source.confirmed
        ? getReleasePaymentDisplayFromRoles(source.roles)
        : null;

      return {
        id: source.id,
        role: source.user.isAdmin ? "label" : "artist",
        title: source.title,
        subtitle: source.subtitle ?? "",
        coverUrl: resolvedCover.url ?? "",
        coverStorageKey: resolvedCover.storageKey,
        coverUrlCandidates: resolvedCover.candidateUrls,
        label: source.labelName ?? "ICECREAMMUSIC",
        upc: resolvedUpc ?? "",
        preorderDate: formatDate(source.preorderDate),
        releaseDate: formatDate(source.date),
        startDate: formatDate(source.startDate),
        territories: "Все страны",
        territoriesCount: 244,
        platformsCount: 0,
        genre: source.genre,
        status: accepted ? "approved" : toAdminStatus(source.status, source.roles),
        submittedAt: formatDateTime(source.date),
        approvedAt: source.status === "approved" ? formatDateTime(source.date) : undefined,
        rejectedAt: source.status === "rejected" ? formatDateTime(source.date) : undefined,
        rejectionReason: source.rejectReason ?? undefined,
        moderationComment: source.moderatorComment ?? undefined,
        moderationRemarks: undefined,
        moderationReturnedAt: undefined,
        priority: getReleasePriorityFromRoles(source.roles),
        paid: Boolean(source.confirmed),
        paymentKind: source.confirmed ? paymentDisplay?.kind ?? "paid" : "unpaid",
        paymentLabel: source.confirmed
          ? paymentDisplay?.label ?? "Оплачен/Подтверждён"
          : "Не оплачен/Не подтверждён",
        paymentUsage: null,
        paymentPlan: paymentDisplay?.usage?.plan ?? null,
        metadataLanguage: source.language,
        releaseType: source.type,
        artists: source.performer ?? "",
        feat: source.feat ?? "",
        countryStartEarly: Boolean(source.earlyStartInRussia),
        realTimeDelivery: Boolean(source.realTimeDelivery),
        yandexDate: source.yandexSoonNewRelease ? formatDate(source.yandexSoonNewRelease) : "",
        previewUrl: resolvedCover.url ?? "",
        tracks
      } satisfies AdminReleaseDetails;
    })
  );

  return mapped;
}
