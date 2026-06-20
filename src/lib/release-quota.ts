import type { Prisma, PrismaClient } from "@prisma/client";
import { addMonths } from "date-fns";

import { prisma as defaultPrisma } from "@/lib/prisma";

export type ReleaseQuotaPlan = "STANDARD" | "PRO" | "ENTERPRISE";
export type ReleaseUsageType = "subscription" | "standalone_payment" | "partner_code";

export interface UserReleaseQuota {
  plan: ReleaseQuotaPlan;
  isActive: boolean;
  includedLimit: number | null;
  used: number;
  remaining: number | null;
  requiresPaymentForNextRelease: boolean;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface ReleasePaymentUsage {
  type: ReleaseUsageType;
  usedAt: string;
  plan?: ReleaseQuotaPlan;
  releasesUsedAfterSubmit?: number;
  releasesLimit?: number | null;
  orderId?: string;
  partnerCode?: string;
  partnerCodeId?: string;
}

type QuotaPrismaClient = Pick<PrismaClient, "user" | "release" | "orders">;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapSubscribeLevelToPlan(level: unknown): ReleaseQuotaPlan {
  const normalized = typeof level === "string" ? level.trim().toLowerCase() : "";
  if (normalized === "professional" || normalized === "pro") return "PRO";
  if (normalized === "enterprise" || normalized === "premium") return "ENTERPRISE";
  return "STANDARD";
}

function includedLimitForPlan(plan: ReleaseQuotaPlan, active: boolean): number | null {
  if (!active) return 0;
  if (plan === "ENTERPRISE") return null;
  if (plan === "PRO") return 6;
  return 1;
}

function isInsidePeriod(value: Date, start: Date, end: Date): boolean {
  const ts = value.getTime();
  return ts >= start.getTime() && ts < end.getTime();
}

function resolveCurrentSubscriptionPeriod(expiresAt: Date, now: Date): {
  periodStart: Date;
  periodEnd: Date;
} {
  let periodEnd = expiresAt;
  let periodStart = addMonths(periodEnd, -1);

  while (periodStart.getTime() > now.getTime()) {
    periodEnd = periodStart;
    periodStart = addMonths(periodEnd, -1);
  }

  return { periodStart, periodEnd };
}

function parseDate(value: unknown): Date | null {
  const text = asString(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readReleaseIdFromOrderMetadata(metadata: unknown): string | null {
  const record = asRecord(metadata);
  if (!record) return null;
  return asString(record.releaseId);
}

export function getReleasePaymentUsageFromRoles(roles: unknown): ReleasePaymentUsage | null {
  const root = asRecord(roles);
  if (!root) return null;

  const usage = asRecord(root.paymentUsage);
  const usageType = asString(usage?.type);
  if (
    usageType === "subscription" ||
    usageType === "standalone_payment" ||
    usageType === "partner_code"
  ) {
    return {
      type: usageType,
      usedAt: asString(usage?.usedAt) ?? new Date(0).toISOString(),
      plan: mapPlanValue(usage?.plan),
      releasesUsedAfterSubmit:
        typeof usage?.releasesUsedAfterSubmit === "number"
          ? usage.releasesUsedAfterSubmit
          : undefined,
      releasesLimit:
        typeof usage?.releasesLimit === "number" || usage?.releasesLimit === null
          ? usage.releasesLimit
          : undefined,
      orderId: asString(usage?.orderId) ?? undefined,
      partnerCode: asString(usage?.partnerCode) ?? undefined,
      partnerCodeId: asString(usage?.partnerCodeId) ?? undefined
    };
  }

  const releaseUsageType = asString(root.releaseUsageType);
  if (releaseUsageType === "standalone_payment") {
    return {
      type: "standalone_payment",
      usedAt: asString(root.releaseUsageUsedAt) ?? new Date(0).toISOString()
    };
  }
  if (releaseUsageType === "partner_code") {
    return {
      type: "partner_code",
      usedAt: asString(root.releaseUsageUsedAt) ?? new Date(0).toISOString(),
      partnerCode: asString(root.releasePartnerCode) ?? undefined
    };
  }
  if (releaseUsageType === "subscription" || root.releasedViaSubscription === true) {
    return {
      type: "subscription",
      usedAt: asString(root.releaseUsageUsedAt) ?? new Date(0).toISOString()
    };
  }

  const submission = asRecord(root.submissionData);
  const snapshot = asRecord(submission?.paymentSnapshot);
  if (snapshot?.kind === "subscription_included") {
    return {
      type: "subscription",
      usedAt: asString(snapshot.usedAt) ?? new Date(0).toISOString(),
      plan: mapPlanValue(snapshot.plan),
      releasesUsedAfterSubmit:
        typeof snapshot.releasesUsedAfterSubmit === "number"
          ? snapshot.releasesUsedAfterSubmit
          : undefined,
      releasesLimit:
        typeof snapshot.releasesLimit === "number" || snapshot.releasesLimit === null
          ? snapshot.releasesLimit
          : undefined
    };
  }

  return null;
}

function mapPlanValue(value: unknown): ReleaseQuotaPlan | undefined {
  const plan = asString(value)?.toUpperCase();
  if (plan === "PRO" || plan === "ENTERPRISE" || plan === "STANDARD") return plan;
  return undefined;
}

export function mergeReleaseRolesPaymentUsage(
  roles: unknown,
  paymentUsage: ReleasePaymentUsage,
  submissionData?: Record<string, unknown>
): Prisma.InputJsonValue {
  const root = asRecord(roles) ?? {};
  const currentSubmission = asRecord(root.submissionData) ?? {};
  const nextSubmission = submissionData ?? currentSubmission;
  const paymentSnapshot =
    paymentUsage.type === "subscription"
      ? {
          version: 1,
          kind: "subscription_included",
          plan: paymentUsage.plan ?? "STANDARD",
          releasesUsedAfterSubmit: paymentUsage.releasesUsedAfterSubmit ?? 1,
          releasesLimit: paymentUsage.releasesLimit ?? null,
          usedAt: paymentUsage.usedAt
        }
      : undefined;

  return {
    ...root,
    releasedViaSubscription: paymentUsage.type === "subscription",
    releaseUsageType: paymentUsage.type,
    releaseUsageUsedAt: paymentUsage.usedAt,
    releasePartnerCode: paymentUsage.partnerCode ?? null,
    submissionData: paymentSnapshot
      ? {
          ...nextSubmission,
          paymentSnapshot
        }
      : nextSubmission,
    paymentUsage
  } as unknown as Prisma.InputJsonValue;
}

export function buildSubscriptionPaymentUsage(params: {
  quota: UserReleaseQuota;
  usedAt?: Date;
}): ReleasePaymentUsage {
  return {
    type: "subscription",
    usedAt: (params.usedAt ?? new Date()).toISOString(),
    plan: params.quota.plan,
    releasesUsedAfterSubmit: params.quota.used + 1,
    releasesLimit: params.quota.includedLimit
  };
}

export function buildStandalonePaymentUsage(params?: {
  orderId?: string;
  usedAt?: Date;
}): ReleasePaymentUsage {
  return {
    type: "standalone_payment",
    usedAt: (params?.usedAt ?? new Date()).toISOString(),
    orderId: params?.orderId
  };
}

export function buildPartnerCodePaymentUsage(params: {
  partnerCode: string;
  partnerCodeId?: string;
  usedAt?: Date;
}): ReleasePaymentUsage {
  return {
    type: "partner_code",
    usedAt: (params.usedAt ?? new Date()).toISOString(),
    partnerCode: params.partnerCode,
    partnerCodeId: params.partnerCodeId
  };
}

export function getReleasePaymentDisplayFromRoles(roles: unknown): {
  kind: "paid" | "subscription" | "unpaid" | "partner_code";
  label: string;
  usage: ReleasePaymentUsage | null;
} {
  const usage = getReleasePaymentUsageFromRoles(roles);
  if (usage?.type === "subscription") {
    return {
      kind: "subscription",
      label: "Включено в подписку",
      usage
    };
  }
  if (usage?.type === "standalone_payment") {
    return {
      kind: "paid",
      label: "Оплачено отдельно",
      usage
    };
  }
  if (usage?.type === "partner_code") {
    return {
      kind: "partner_code",
      label: usage.partnerCode ? `Партнёрский код ${usage.partnerCode}` : "Оплачено партнёром",
      usage
    };
  }
  return {
    kind: "paid",
    label: "Оплачен",
    usage: null
  };
}

export async function getUserReleaseQuota(
  userId: string,
  client: QuotaPrismaClient = defaultPrisma
): Promise<UserReleaseQuota> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      isSubscribed: true,
      subscribeLevel: true,
      expiresAt: true
    }
  });

  const now = new Date();
  const expiresAt = user?.expiresAt ?? null;
  const plan = mapSubscribeLevelToPlan(user?.subscribeLevel);
  const isActive = Boolean(user?.isSubscribed && expiresAt && expiresAt.getTime() > now.getTime());
  const includedLimit = includedLimitForPlan(plan, isActive);
  const period = isActive && expiresAt ? resolveCurrentSubscriptionPeriod(expiresAt, now) : null;
  const periodEnd = period?.periodEnd ?? null;
  const periodStart = period?.periodStart ?? null;

  if (!isActive || !periodStart || !periodEnd) {
    return {
      plan,
      isActive: false,
      includedLimit: 0,
      used: 0,
      remaining: 0,
      requiresPaymentForNextRelease: true,
      periodStart: null,
      periodEnd: null
    };
  }

  const [releases, releaseOrders] = await Promise.all([
    client.release.findMany({
      where: {
        userId,
        confirmed: true
      },
      select: {
        id: true,
        date: true,
        roles: true
      }
    }),
    client.orders.findMany({
      where: {
        userId,
        type: "release",
        confirmed: true
      },
      select: {
        metadata: true
      }
    })
  ]);

  const standalonePaidReleaseIds = new Set(
    releaseOrders
      .map((order) => readReleaseIdFromOrderMetadata(order.metadata))
      .filter((id): id is string => Boolean(id))
  );

  let used = 0;
  for (const release of releases) {
    const usage = getReleasePaymentUsageFromRoles(release.roles);
    if (usage?.type === "standalone_payment") continue;
    if (usage?.type === "partner_code") continue;
    if (standalonePaidReleaseIds.has(release.id)) continue;

    if (usage?.type === "subscription") {
      const usedAt = parseDate(usage.usedAt) ?? release.date;
      if (isInsidePeriod(usedAt, periodStart, periodEnd)) used += 1;
      continue;
    }

    // Legacy fallback for releases submitted before paymentUsage existed.
    if (isInsidePeriod(release.date, periodStart, periodEnd)) used += 1;
  }

  const remaining = includedLimit == null ? null : Math.max(0, includedLimit - used);
  return {
    plan,
    isActive,
    includedLimit,
    used,
    remaining,
    requiresPaymentForNextRelease: includedLimit != null && used >= includedLimit,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString()
  };
}
