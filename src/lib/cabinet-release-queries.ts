import {
  PaymentStatus,
  Prisma,
  ReleaseStatus,
  SubscriptionPlan,
  SubscriptionStatus
} from "@prisma/client";

import type { CabinetRelease } from "@/lib/cabinet-types";
import { prisma } from "@/lib/prisma";
import { buildReleasePaymentBackfill } from "@/lib/release-payment-backfill";
import { getSubscriptionEffectiveEndDate } from "@/lib/subscription-service";

import { cabinetReleaseSelect, mapReleaseToCabinetRelease } from "./cabinet-release-server";
import type { ReleasePaymentSnapshot } from "./release-payment";

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

async function getPaidReleaseIdSetByUser(userId: string): Promise<Set<string>> {
  const payments = await prisma.subscriptionPayment.findMany({
    where: {
      userId,
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
    if (releaseId) {
      paidReleaseIds.add(releaseId);
    }
  }
  return paidReleaseIds;
}

type CabinetReleaseSource = Prisma.ReleaseGetPayload<{
  select: typeof cabinetReleaseSelect;
}>;

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
  release: Pick<CabinetReleaseSource, "createdAt" | "updatedAt" | "moderationStartedAt">
): Date {
  return release.moderationStartedAt ?? release.updatedAt ?? release.createdAt;
}

function resolveSubmitMomentInWindow(params: {
  release: Pick<CabinetReleaseSource, "createdAt" | "updatedAt" | "moderationStartedAt">;
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
  release: CabinetReleaseSource,
  snapshot: ReleasePaymentSnapshot | undefined
): CabinetReleaseSource {
  if (!snapshot) return release;
  return {
    ...release,
    submissionData: {
      ...(readSubmissionData(release.submissionData) ?? {}),
      paymentSnapshot: snapshot
    } as unknown as Prisma.JsonValue
  };
}

async function inferMissingPaymentSnapshots(params: {
  userId: string;
  releases: CabinetReleaseSource[];
  paidReleaseIds: Set<string>;
}): Promise<Map<string, ReleasePaymentSnapshot>> {
  const successfulSubscriptionPayments = await prisma.subscriptionPayment.findMany({
    where: {
      userId: params.userId,
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
      userId: params.userId,
      status: release.status,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
      moderationStartedAt: release.moderationStartedAt,
      submissionData: release.submissionData
    })),
    successfulSubscriptionPayments,
    oneTimePaidReleaseIds: params.paidReleaseIds
  });

  const result = new Map<string, ReleasePaymentSnapshot>();
  for (const item of inferredItems) {
    result.set(item.releaseId, item.snapshot);
  }

  const subscription = await prisma.subscription.findUnique({
    where: { userId: params.userId },
    select: {
      plan: true,
      status: true,
      startedAt: true,
      endsAt: true,
      renewalAt: true
    }
  });

  if (!subscription) return result;
  const plan = toEffectivePlan(subscription.plan);
  if (!plan) return result;

  const effectiveEnd = getSubscriptionEffectiveEndDate({
    endsAt: subscription.endsAt ?? null,
    renewalAt: subscription.renewalAt ?? null
  });
  if (!effectiveEnd || effectiveEnd.getTime() <= subscription.startedAt.getTime()) {
    return result;
  }

  const isActiveLike =
    subscription.status === SubscriptionStatus.ACTIVE ||
    subscription.status === SubscriptionStatus.TRIALING;
  const now = Date.now();
  if (!isActiveLike && effectiveEnd.getTime() < now) {
    // Expired subscription still can label historical releases in its active window.
  }

  const eligible = params.releases
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
    if (result.has(release.id)) continue;
    if (hasPaymentSnapshot(release.submissionData)) continue;
    result.set(
      release.id,
      buildSnapshot({
        plan,
        releasesUsedAfterSubmit: usage
      })
    );
  }

  return result;
}

export async function getCabinetReleasesByUser(userId: string): Promise<CabinetRelease[]> {
  const [releases, paidReleaseIds] = await Promise.all([
    prisma.release.findMany({
      where: { userId },
      select: cabinetReleaseSelect,
      orderBy: { createdAt: "desc" }
    }),
    getPaidReleaseIdSetByUser(userId)
  ]);

  const inferredSnapshots = await inferMissingPaymentSnapshots({
    userId,
    releases: releases as CabinetReleaseSource[],
    paidReleaseIds
  });

  return releases.map((release, index) =>
    mapReleaseToCabinetRelease(
      applyInferredSnapshot(release as CabinetReleaseSource, inferredSnapshots.get(release.id)),
      index + 1,
      paidReleaseIds.has(release.id)
    )
  );
}

export async function getCabinetDraftReleasesByUser(userId: string): Promise<CabinetRelease[]> {
  const [releases, paidReleaseIds] = await Promise.all([
    prisma.release.findMany({
      where: {
        userId,
        status: ReleaseStatus.DRAFT
      },
      select: cabinetReleaseSelect,
      orderBy: { createdAt: "desc" }
    }),
    getPaidReleaseIdSetByUser(userId)
  ]);

  const inferredSnapshots = await inferMissingPaymentSnapshots({
    userId,
    releases: releases as CabinetReleaseSource[],
    paidReleaseIds
  });

  return releases.map((release, index) =>
    mapReleaseToCabinetRelease(
      applyInferredSnapshot(release as CabinetReleaseSource, inferredSnapshots.get(release.id)),
      index + 1,
      paidReleaseIds.has(release.id)
    )
  );
}

export async function getCabinetReleaseByIdForUser(
  userId: string,
  releaseId: string
): Promise<CabinetRelease | null> {
  const [release, paidReleaseIds] = await Promise.all([
    prisma.release.findFirst({
      where: {
        id: releaseId,
        userId
      },
      select: cabinetReleaseSelect
    }),
    getPaidReleaseIdSetByUser(userId)
  ]);

  if (!release) return null;
  const inferredSnapshots = await inferMissingPaymentSnapshots({
    userId,
    releases: [release as CabinetReleaseSource],
    paidReleaseIds
  });

  return mapReleaseToCabinetRelease(
    applyInferredSnapshot(release as CabinetReleaseSource, inferredSnapshots.get(release.id)),
    1,
    paidReleaseIds.has(release.id)
  );
}
