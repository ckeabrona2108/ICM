import {
  PaymentStatus,
  ReleaseStatus,
  Role,
  SubscriptionPlan,
  SubscriptionStatus,
  type Prisma
} from "@prisma/client";

import type { ModerationRemark } from "@/lib/api/contracts";
import type { AdminReleaseDetails, AdminReleaseStatus } from "@/lib/admin-data";
import { buildReleasePaymentBackfill } from "@/lib/release-payment-backfill";
import { getSubscriptionEffectiveEndDate } from "@/lib/subscription-service";
import {
  buildReleasePaymentDisplay,
  parseReleasePaymentSnapshot,
  type ReleasePaymentSnapshot
} from "@/lib/release-payment";
import { allReleasePlatformCodes } from "@/lib/release-platforms";
import { prisma } from "@/lib/prisma";

export type AdminReleaseStatusFilter =
  | "moderation"
  | "pending_verification"
  | "all"
  | "approved"
  | "rejected";

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
  paymentSnapshot?: unknown;
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

function readSubmissionData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasPaymentSnapshot(value: unknown): boolean {
  const data = readSubmissionData(value);
  if (!data || !data.paymentSnapshot || typeof data.paymentSnapshot !== "object") return false;
  const snapshot = data.paymentSnapshot as Record<string, unknown>;
  return snapshot.kind === "subscription_included" && snapshot.version === 1;
}

function toEffectivePlan(plan: SubscriptionPlan): "STANDARD" | "PRO" | "ENTERPRISE" | null {
  if (plan === SubscriptionPlan.STANDARD) return "STANDARD";
  if (plan === SubscriptionPlan.PRO) return "PRO";
  if (plan === SubscriptionPlan.ENTERPRISE || plan === SubscriptionPlan.LABEL) return "ENTERPRISE";
  return null;
}

function planReleaseLimit(plan: "STANDARD" | "PRO" | "ENTERPRISE"): number | null {
  if (plan === "ENTERPRISE") return null;
  if (plan === "PRO") return 6;
  return 1;
}

function resolveSubmitMoment(
  release: Pick<AdminReleaseSource, "createdAt" | "updatedAt" | "moderationStartedAt">
): Date {
  return release.moderationStartedAt ?? release.updatedAt ?? release.createdAt;
}

function resolveSubmitMomentInWindow(params: {
  release: Pick<AdminReleaseSource, "createdAt" | "updatedAt" | "moderationStartedAt">;
  windowStart: Date;
  windowEnd: Date;
}): Date {
  const { release, windowStart, windowEnd } = params;
  if (release.moderationStartedAt) return release.moderationStartedAt;

  const start = windowStart.getTime();
  const end = windowEnd.getTime();
  const created = release.createdAt.getTime();
  const updated = release.updatedAt.getTime();

  if (created >= start && created < end) return release.createdAt;
  if (updated >= start && updated < end) return release.updatedAt;
  if (created < start && updated >= start) return new Date(start);
  return release.createdAt;
}

function buildSnapshot(params: {
  plan: "STANDARD" | "PRO" | "ENTERPRISE";
  releasesUsedAfterSubmit: number;
}): ReleasePaymentSnapshot {
  return {
    version: 1,
    kind: "subscription_included",
    plan: params.plan,
    releasesUsedAfterSubmit: params.releasesUsedAfterSubmit,
    releasesLimit: planReleaseLimit(params.plan)
  };
}

function applyInferredSnapshot(
  release: AdminReleaseSource,
  snapshot: ReleasePaymentSnapshot | undefined
): AdminReleaseSource {
  if (!snapshot) return release;
  return {
    ...release,
    submissionData: {
      ...(readSubmissionData(release.submissionData) ?? {}),
      paymentSnapshot: snapshot
    } as unknown as Prisma.JsonValue
  };
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
  if (status === ReleaseStatus.PENDING_VERIFICATION) {
    return "pending_verification";
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

function readReleaseIdFromPaymentMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind.trim().toLowerCase() : "";
  const releaseId =
    typeof record.releaseId === "string" ? record.releaseId.trim() : "";
  if (!releaseId) return null;
  if (!kind || kind === "release") return releaseId;
  return null;
}

async function getPaidReleaseIdSet(params: {
  userIds: string[];
  releaseIds: string[];
}): Promise<Set<string>> {
  if (params.userIds.length === 0 || params.releaseIds.length === 0) return new Set<string>();

  const releaseIdSet = new Set(params.releaseIds);
  const payments = await prisma.subscriptionPayment.findMany({
    where: {
      userId: { in: params.userIds },
      status: PaymentStatus.SUCCEEDED
    },
    select: {
      metadata: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const paidReleaseIds = new Set<string>();
  for (const payment of payments) {
    const releaseId = readReleaseIdFromPaymentMetadata(payment.metadata);
    if (releaseId && releaseIdSet.has(releaseId)) {
      paidReleaseIds.add(releaseId);
    }
  }
  return paidReleaseIds;
}

function mapRelease(source: AdminReleaseSource, oneTimePaid: boolean): AdminReleaseDetails {
  const submission = parseSubmissionData(source.submissionData);
  const payment = buildReleasePaymentDisplay({
    paid: oneTimePaid,
    snapshot: parseReleasePaymentSnapshot(submission?.paymentSnapshot)
  });
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
    paid: payment.kind !== "unpaid",
    paymentKind: payment.kind,
    paymentLabel: payment.label,
    paymentUsage: payment.usageLabel,
    paymentPlan: payment.plan,
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

async function inferMissingPaymentSnapshots(params: {
  releases: AdminReleaseSource[];
  paidReleaseIds: Set<string>;
}): Promise<Map<string, ReleasePaymentSnapshot>> {
  const userIds = Array.from(new Set(params.releases.map((release) => release.userId)));
  if (userIds.length === 0) return new Map();

  const successfulSubscriptionPayments = await prisma.subscriptionPayment.findMany({
    where: {
      userId: { in: userIds },
      status: PaymentStatus.SUCCEEDED
    },
    select: {
      userId: true,
      tariffId: true,
      paidAt: true,
      createdAt: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  const inferredItems = buildReleasePaymentBackfill({
    releases: params.releases.map((release) => ({
      id: release.id,
      userId: release.userId,
      status: release.status,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
      moderationStartedAt: release.moderationStartedAt,
      submissionData: release.submissionData
    })),
    successfulSubscriptionPayments,
    oneTimePaidReleaseIds: params.paidReleaseIds
  });

  const inferred = new Map<string, ReleasePaymentSnapshot>();
  for (const item of inferredItems) {
    inferred.set(item.releaseId, item.snapshot);
  }

  const subscriptions = await prisma.subscription.findMany({
    where: {
      userId: { in: userIds }
    },
    select: {
      userId: true,
      plan: true,
      status: true,
      startedAt: true,
      endsAt: true,
      renewalAt: true
    }
  });

  const subscriptionByUser = new Map(subscriptions.map((item) => [item.userId, item]));
  for (const userId of userIds) {
    const subscription = subscriptionByUser.get(userId);
    if (!subscription) continue;
    const plan = toEffectivePlan(subscription.plan);
    if (!plan) continue;

    const effectiveEnd = getSubscriptionEffectiveEndDate({
      endsAt: subscription.endsAt ?? null,
      renewalAt: subscription.renewalAt ?? null
    });
    if (!effectiveEnd || effectiveEnd.getTime() <= subscription.startedAt.getTime()) continue;

    const isActiveLike =
      subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.TRIALING;
    const now = Date.now();
    if (!isActiveLike && effectiveEnd.getTime() < now) {
      // Expired subscription still can label historical releases in its active window.
    }

    const eligible = params.releases
      .filter((release) => release.userId === userId)
      .filter((release) => release.status !== ReleaseStatus.DRAFT)
      .filter((release) => !params.paidReleaseIds.has(release.id))
      .filter((release) => {
        const submitAt = resolveSubmitMomentInWindow({
          release,
          windowStart: subscription.startedAt,
          windowEnd: effectiveEnd
        }).getTime();
        return submitAt >= subscription.startedAt.getTime() && submitAt < effectiveEnd.getTime();
      })
      .sort((a, b) => {
        const left = resolveSubmitMomentInWindow({
          release: a,
          windowStart: subscription.startedAt,
          windowEnd: effectiveEnd
        }).getTime();
        const right = resolveSubmitMomentInWindow({
          release: b,
          windowStart: subscription.startedAt,
          windowEnd: effectiveEnd
        }).getTime();
        return left - right;
      });

    const limit = planReleaseLimit(plan);
    const included = limit == null ? eligible : eligible.slice(0, Math.max(0, limit));
    let usage = 0;
    for (const release of included) {
      usage += 1;
      if (inferred.has(release.id)) continue;
      if (hasPaymentSnapshot(release.submissionData)) continue;
      inferred.set(
        release.id,
        buildSnapshot({
          plan,
          releasesUsedAfterSubmit: usage
        })
      );
    }
  }

  return inferred;
}

function resolveStatuses(filter: AdminReleaseStatusFilter): ReleaseStatus[] | undefined {
  if (filter === "moderation") return [ReleaseStatus.MODERATION];
  if (filter === "pending_verification") return [ReleaseStatus.PENDING_VERIFICATION];
  if (filter === "approved") return [ReleaseStatus.APPROVED, ReleaseStatus.DISTRIBUTED];
  if (filter === "rejected") return [ReleaseStatus.REJECTED];
  return undefined;
}

function resolveOrderBy(filter: AdminReleaseStatusFilter): Prisma.ReleaseOrderByWithRelationInput[] {
  if (filter === "pending_verification") {
    return [{ updatedAt: "desc" }];
  }
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
  const mapWithPayment = async (
    rows: Array<AdminReleaseSource>
  ): Promise<AdminReleaseDetails[]> => {
    const paidReleaseIds = await getPaidReleaseIdSet({
      userIds: Array.from(new Set(rows.map((release) => release.userId))),
      releaseIds: rows.map((release) => release.id)
    });
    const inferredSnapshots = await inferMissingPaymentSnapshots({
      releases: rows,
      paidReleaseIds
    });

    return rows.map((release) =>
      mapRelease(
        applyInferredSnapshot(release, inferredSnapshots.get(release.id)),
        paidReleaseIds.has(release.id)
      )
    );
  };

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

    return mapWithPayment(releases as AdminReleaseSource[]);
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

    return mapWithPayment(
      legacyRows.map((row) => ({
        ...row,
        approvedAt: null,
        rejectedAt: null,
        rejectionReason: null
      })) as AdminReleaseSource[]
    );
  }
}
