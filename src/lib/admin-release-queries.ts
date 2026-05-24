import { prisma } from "@/lib/prisma";
import type { AdminReleaseDetails, AdminReleaseStatus } from "@/lib/admin-data";
import { getReleasePriorityFromRoles } from "@/lib/release-priority";
import { getReleasePaymentDisplayFromRoles } from "@/lib/release-quota";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import {
  buildLegacyImageCandidateUrls,
  resolveFirstReachableImageCandidateFromCandidates,
  resolveStoredFileUrl
} from "@/lib/s3";

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

const COVER_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "jpng",
  "PNG",
  "JPG",
  "JPEG",
  "WEBP",
  "JPNG"
] as const;

function getExtensionHint(rawPreview: string): string | null {
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

function getCoverExtensionsByPriority(rawPreview: string): string[] {
  const hint = getExtensionHint(rawPreview);
  const ordered = [...COVER_EXTENSIONS];
  if (!hint) return ordered;
  const exacts = ordered.filter((ext) => ext === hint || ext.toLowerCase() === hint);
  const rest = ordered.filter((ext) => !exacts.includes(ext));
  return [...exacts, ...rest];
}

function resolveReleaseCoverUrls(
  releaseId: string,
  preview: string
): { url: string; candidates: string[] } {
  const rawPreview = preview.trim();
  const previewIsExtensionOnly = rawPreview ? looksLikeOnlyExtension(rawPreview) : false;
  const previewSeed = previewIsExtensionOnly ? "" : rawPreview;
  const prioritizedExtensions = getCoverExtensionsByPriority(rawPreview);
  const extraStorageKeys: string[] = prioritizedExtensions.flatMap((extension) => [
    `previews/${releaseId}.${extension}`,
    `covers/${releaseId}.${extension}`,
    `uploads/${releaseId}/release-cover.${extension}`,
    `uploads/${releaseId}.${extension}`,
    `${releaseId}.${extension}`,
    `previews/release-cover.${extension}`,
    `covers/release-cover.${extension}`,
    `uploads/release-cover.${extension}`,
    `release-cover.${extension}`
  ]);

  if (rawPreview && looksLikeOnlyExtension(rawPreview)) {
    const extension = normalizeExtension(rawPreview);
    if (extension) {
      extraStorageKeys.push(
        `previews/${releaseId}.${extension}`,
    `covers/${releaseId}.${extension}`,
    `uploads/${releaseId}/release-cover.${extension}`,
    `uploads/${releaseId}.${extension}`,
    `${releaseId}.${extension}`,
    `previews/release-cover.${extension}`,
    `covers/release-cover.${extension}`,
    `uploads/release-cover.${extension}`,
    `release-cover.${extension}`
      );
    }
  }

  const candidates = Array.from(
    new Set(
      buildLegacyImageCandidateUrls({
        url: previewSeed,
        storageKey:
          previewSeed && !previewSeed.startsWith("http") && !previewSeed.startsWith("/")
            ? previewSeed
            : null,
        extraStorageKeys
      })
    )
  );

  return {
    url: candidates[0] ?? resolveStoredFileUrl({ url: previewSeed, storageKey: null }) ?? "",
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

const adminCoverResolveCache = new Map<string, { url: string | null; failedReason: string | null }>();
const MAX_ADMIN_COVER_RESOLVE_CACHE_SIZE = 1000;

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

  const mapped = releases
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
    .filter((release) => (filter === "approved" || filter === "all" ? true : release.confirmed))
    .map((source) => {
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
        upc: resolvedUpc ?? "",
        preorderDate: formatDate(source.preorderDate),
        releaseDate: formatDate(source.date),
        startDate: formatDate(source.startDate),
        territories: "Все страны",
        territoriesCount: 244,
        platformsCount: 0,
        genre: source.genre,
        status: accepted ? "approved" : toAdminStatus(source.status),
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
        previewUrl: cover.url,
        tracks
      } satisfies AdminReleaseDetails;
    });

  return Promise.all(
    mapped.map(async (item) => {
      const candidates = Array.from(new Set([item.coverUrl, ...(item.coverUrlCandidates ?? [])].filter(Boolean)));
      const cacheKey = `${item.id}\n${candidates.join("\n")}`;
      const cached = adminCoverResolveCache.get(cacheKey);
      const resolved =
        cached ?? (await resolveFirstReachableImageCandidateFromCandidates(candidates));
      if (!cached) {
        if (adminCoverResolveCache.size >= MAX_ADMIN_COVER_RESOLVE_CACHE_SIZE) {
          const firstKey = adminCoverResolveCache.keys().next().value;
          if (firstKey) adminCoverResolveCache.delete(firstKey);
        }
        adminCoverResolveCache.set(cacheKey, resolved);
      }
      if (!resolved.url) {
        return {
          ...item,
          coverUrl: "",
          coverUrlCandidates: []
        };
      }
      return {
        ...item,
        coverUrl: resolved.url,
        coverUrlCandidates: [resolved.url]
      };
    })
  );
}
