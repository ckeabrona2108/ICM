import { prisma } from "@/lib/prisma";
import type { AdminReleaseDetails, AdminReleaseStatus } from "@/lib/admin-data";
import { getReleasePriorityFromRoles } from "@/lib/release-priority";
import { getReleasePaymentDisplayFromRoles } from "@/lib/release-quota";
import { buildLegacyImageCandidateUrls, resolveStoredFileUrl } from "@/lib/s3";

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

function toAdminStatus(status: string): AdminReleaseStatus {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "moderation";
}

function matchStatus(status: string, filter: AdminReleaseStatusFilter): boolean {
  if (filter === "all") return status === "approved";
  if (filter === "approved") return status === "approved";
  if (filter === "rejected") return status === "rejected";
  return status === "moderating";
}

function looksLikeOnlyExtension(value: string): boolean {
  return /^[a-z0-9]{2,8}$/iu.test(value.trim().replace(/^\./u, ""));
}

function normalizeExtension(value: string): string | null {
  const normalized = value.trim().replace(/^\./u, "").toLowerCase();
  if (!normalized) return null;
  return /^[a-z0-9]{2,8}$/u.test(normalized) ? normalized : null;
}

const COVER_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "JPG", "JPEG", "PNG", "WEBP"] as const;

function resolveReleaseCoverUrls(
  releaseId: string,
  preview: string
): { url: string; candidates: string[] } {
  const rawPreview = preview.trim();
  const extraStorageKeys: string[] = COVER_EXTENSIONS.flatMap((extension) => [
    `${releaseId}.${extension}`,
    `previews/${releaseId}.${extension}`,
    `covers/${releaseId}.${extension}`,
    `uploads/${releaseId}/release-cover.${extension}`,
    `uploads/${releaseId}.${extension}`,
    `release-cover.${extension}`,
    `previews/release-cover.${extension}`,
    `covers/release-cover.${extension}`,
    `uploads/release-cover.${extension}`
  ]);

  if (rawPreview && looksLikeOnlyExtension(rawPreview)) {
    const extension = normalizeExtension(rawPreview);
    if (extension) {
      extraStorageKeys.push(
        `${releaseId}.${extension}`,
        `previews/${releaseId}.${extension}`,
        `covers/${releaseId}.${extension}`,
        `uploads/${releaseId}/release-cover.${extension}`,
        `uploads/${releaseId}.${extension}`,
        `release-cover.${extension}`,
        `previews/release-cover.${extension}`,
        `covers/release-cover.${extension}`,
        `uploads/release-cover.${extension}`
      );
    }
  }

  const candidates = Array.from(
    new Set(
      buildLegacyImageCandidateUrls({
        url: rawPreview,
        storageKey:
          rawPreview && !rawPreview.startsWith("http") && !rawPreview.startsWith("/")
            ? rawPreview
            : null,
        extraStorageKeys
      })
    )
  );

  return {
    url: candidates[0] ?? resolveStoredFileUrl({ url: rawPreview, storageKey: null }) ?? rawPreview,
    candidates
  };
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
    include: {
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

  return releases
    .filter((release) => matchStatus(release.status, filter))
    .filter((release) => (filter === "approved" ? true : release.confirmed))
    .map((source) => {
      const tracks = source.track.length
        ? source.track.map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: item.subtitle ?? "",
            isrc: item.isrc ?? "",
            partnerCode: item.partner_code ?? "",
            artists: source.performer ?? source.user.name,
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

      const cover = resolveReleaseCoverUrls(source.id, source.preview);
      const paymentDisplay = source.confirmed
        ? getReleasePaymentDisplayFromRoles(source.roles)
        : null;

      return {
        id: source.id,
        role: source.user.isAdmin ? "label" : "artist",
        title: source.title,
        subtitle: source.subtitle ?? "",
        coverUrl: cover.url,
        coverUrlCandidates: cover.candidates,
        label: source.labelName ?? "ICECREAMMUSIC",
        upc: source.upc ?? "",
        preorderDate: formatDate(source.preorderDate),
        releaseDate: formatDate(source.date),
        startDate: formatDate(source.startDate),
        territories: "Все страны",
        territoriesCount: 244,
        platformsCount: 0,
        genre: source.genre,
        status: toAdminStatus(source.status),
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
        artists: source.performer ?? source.user.name,
        feat: source.feat ?? "",
        countryStartEarly: Boolean(source.earlyStartInRussia),
        realTimeDelivery: Boolean(source.realTimeDelivery),
        yandexDate: source.yandexSoonNewRelease ? formatDate(source.yandexSoonNewRelease) : "",
        previewUrl: cover.url,
        tracks
      } satisfies AdminReleaseDetails;
    });
}
