// @ts-nocheck
import {
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { addDays, addMonths } from "date-fns";
import { getSubscriptionEffectiveEndDate } from "@/lib/subscription-service";

export type EffectivePlan = "STANDARD" | "PRO" | "ENTERPRISE";

export interface PlanLimits {
  releasesLimit: number | null;
  aiDayLimit: number | null;
  aiMonthLimit: number | null;
  aiEnabled: boolean;
}

export interface PlanPricing {
  release: number;
  text: number;
  karaokeText: number;
  videoShot: number;
  videoClip: number;
}

export interface SubscriptionOverview {
  plan: EffectivePlan;
  currentPlan: EffectivePlan | null;
  hasActiveSubscription: boolean;
  status: "active" | "none";
  startedAt: string | null;
  endsAt: string | null;
  countdownDays: number | null;
  shouldNotifyExpiry: boolean;
  usage: {
    periodStart: string | null;
    periodEnd: string | null;
    releasesUsed: number;
    aiDayUsed: number;
    aiMonthUsed: number;
    lastAiResetDay: string | null;
  };
  limits: PlanLimits;
  pricing: PlanPricing;
}

export interface LimitDecision {
  allowed: boolean;
  plan: EffectivePlan;
  reason?: string;
  code?: "release_limit_reached" | "ai_unavailable" | "ai_limit_reached";
  payAsYouGoPricing?: PlanPricing;
  limits: PlanLimits;
  usage: {
    releasesUsed: number;
    aiDayUsed: number;
    aiMonthUsed: number;
  };
}

type SubscriptionPlan = "STANDARD" | "PRO" | "ENTERPRISE" | "LABEL";
type SubscriptionStatus = "ACTIVE" | "TRIALING" | "CANCELED";

const PAYG_PRICING: PlanPricing = {
  release: 350,
  text: 75,
  karaokeText: 75,
  videoShot: 75,
  videoClip: 100
};

function getDelegate<T = Record<string, unknown>>(tx: TxClient, name: string): T | null {
  const delegate = (tx as Record<string, unknown>)[name];
  if (!delegate || typeof delegate !== "object") return null;
  return delegate as T;
}

function normalizePlan(plan: SubscriptionPlan | null | undefined): EffectivePlan {
  if (plan === "PRO") return "PRO";
  if (plan === "ENTERPRISE" || plan === "LABEL") return "ENTERPRISE";
  if (plan === "STANDARD") return "STANDARD";
  return "STANDARD";
}

function mapSubscribeLevelToPlan(level: string | null | undefined): SubscriptionPlan {
  if (level === "professional") return "PRO";
  if (level === "premium" || level === "enterprise") return "ENTERPRISE";
  return "STANDARD";
}

function getPlanLimits(plan: EffectivePlan, hasActiveSubscription: boolean): PlanLimits {
  if (plan === "ENTERPRISE") {
    return {
      releasesLimit: null,
      aiDayLimit: null,
      aiMonthLimit: null,
      aiEnabled: true
    };
  }

  if (plan === "PRO") {
    return {
      releasesLimit: 6,
      aiDayLimit: 3,
      aiMonthLimit: 100,
      aiEnabled: true
    };
  }

  if (plan === "STANDARD") {
    return {
      releasesLimit: hasActiveSubscription ? 1 : 0,
      aiDayLimit: 0,
      aiMonthLimit: 0,
      aiEnabled: false
    };
  }

  return {
    releasesLimit: 0,
    aiDayLimit: 0,
    aiMonthLimit: 0,
    aiEnabled: false
  };
}

function getWindowFromAnchor(anchor: Date, now: Date): { start: Date; end: Date } {
  if (anchor.getTime() > now.getTime()) {
    return { start: anchor, end: addMonths(anchor, 1) };
  }

  let start = new Date(anchor);
  let end = addMonths(start, 1);

  while (end.getTime() <= now.getTime()) {
    start = end;
    end = addMonths(start, 1);
  }

  return { start, end };
}

function dayStart(date: Date): Date {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

type TxClient = Prisma.TransactionClient | PrismaClient;

type SubscriptionUsageRow = {
  id: string;
  releases_used: number;
  ai_requests_used_day: number;
  ai_requests_used_month: number;
  last_ai_reset_day: Date;
  period_start: Date;
  period_end: Date;
};

function isSubscriptionUsageTableMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("subscription_usage") &&
    (message.includes("does not exist") || message.includes("P2021"))
  );
}

function isAnalyticsAiInsightsTableMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("analytics_ai_insights") &&
    (message.includes("does not exist") || message.includes("P2021"))
  );
}

async function buildFallbackUsage(params: {
  tx: TxClient;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  todayStart: Date;
}): Promise<{
  id: null;
  releasesUsed: number;
  aiRequestsUsedDay: number;
  aiRequestsUsedMonth: number;
  lastAiResetDay: Date;
  periodStart: Date;
  periodEnd: Date;
}> {
  const releasesUsed = await params.tx.release.count({
    where: {
      userId: params.userId,
      date: {
        gte: params.periodStart,
        lt: params.periodEnd
      }
    }
  });

  const analyticsRepo = getDelegate<{ count: (args: unknown) => Promise<number> }>(
    params.tx,
    "analytics_ai_insights"
  );
  if (!analyticsRepo?.count) {
    return {
      id: null,
      releasesUsed,
      aiRequestsUsedDay: 0,
      aiRequestsUsedMonth: 0,
      lastAiResetDay: params.todayStart,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd
    };
  }

  const aiMonthPromise = analyticsRepo
    .count({
      where: {
        user_id: params.userId,
        created_at: {
          gte: params.periodStart,
          lt: params.periodEnd
        }
      }
    })
    .catch((error: unknown) => {
      if (isAnalyticsAiInsightsTableMissing(error)) {
        return 0;
      }
      throw error;
    });

  const aiDayPromise = analyticsRepo
    .count({
      where: {
        user_id: params.userId,
        created_at: {
          gte: params.todayStart
        }
      }
    })
    .catch((error: unknown) => {
      if (isAnalyticsAiInsightsTableMissing(error)) {
        return 0;
      }
      throw error;
    });

  const [aiRequestsUsedMonth, aiRequestsUsedDay] = await Promise.all([aiMonthPromise, aiDayPromise]);

  return {
    id: null,
    releasesUsed,
    aiRequestsUsedDay,
    aiRequestsUsedMonth,
    lastAiResetDay: params.todayStart,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd
  };
}

async function getUserSubscriptionRecord(tx: TxClient, userId: string): Promise<{
  id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  startedAt: Date;
  ends_at: Date | null;
  renewalAt: Date | null;
} | null> {
  const subscriptionRepo = getDelegate<{
    findUnique: (args: unknown) => Promise<{
      id: string;
      plan: SubscriptionPlan;
      status: SubscriptionStatus;
      startedAt: Date;
      ends_at: Date | null;
      renewalAt: Date | null;
    } | null>;
  }>(tx, "subscription");
  if (subscriptionRepo?.findUnique) {
    const subscription = await subscriptionRepo.findUnique({
      where: { userId },
      select: {
        id: true,
        plan: true,
        status: true,
        startedAt: true,
        ends_at: true,
        renewalAt: true
      }
    });
    if (!subscription) return null;
    return subscription;
  }

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isSubscribed: true,
      subscribeLevel: true,
      expiresAt: true
    }
  });
  if (!user) return null;

  const now = new Date();
  const effectiveEnd = user.expiresAt ?? null;
  if (!user.isSubscribed || !effectiveEnd || effectiveEnd.getTime() <= now.getTime()) {
    return null;
  }

  const plan = mapSubscribeLevelToPlan(
    typeof user.subscribeLevel === "string" ? user.subscribeLevel : null
  );
  const startedAt = addMonths(effectiveEnd, -1);
  return {
    id: user.id,
    plan,
    status: "ACTIVE",
    startedAt,
    ends_at: effectiveEnd,
    renewalAt: effectiveEnd
  };
}

async function getOrResetUsage(params: {
  tx: TxClient;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
}): Promise<{
  id: string | null;
  releasesUsed: number;
  aiRequestsUsedDay: number;
  aiRequestsUsedMonth: number;
  lastAiResetDay: Date;
  periodStart: Date;
  periodEnd: Date;
}> {
  const now = new Date();
  const todayStart = dayStart(now);

  const select = {
    id: true,
    releases_used: true,
    ai_requests_used_day: true,
    ai_requests_used_month: true,
    last_ai_reset_day: true,
    period_start: true,
    period_end: true
  } as const;

  const mapUsageRow = (row: SubscriptionUsageRow) => ({
    id: row.id,
    releasesUsed: row.releases_used,
    aiRequestsUsedDay: row.ai_requests_used_day,
    aiRequestsUsedMonth: row.ai_requests_used_month,
    lastAiResetDay: row.last_ai_reset_day,
    periodStart: row.period_start,
    periodEnd: row.period_end
  });

  let existing:
    | SubscriptionUsageRow
    | null = null;
  const usageRepo = getDelegate<{
    findUnique: (args: unknown) => Promise<SubscriptionUsageRow | null>;
    create: (args: unknown) => Promise<SubscriptionUsageRow>;
    update: (args: unknown) => Promise<SubscriptionUsageRow>;
  }>(params.tx, "subscription_usage");
  if (!usageRepo?.findUnique || !usageRepo.create || !usageRepo.update) {
    return buildFallbackUsage({
      tx: params.tx,
      userId: params.userId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      todayStart
    });
  }

  try {
    existing = await usageRepo.findUnique({
      where: { user_id: params.userId },
      select
    });
  } catch (error) {
    if (isSubscriptionUsageTableMissing(error)) {
      return buildFallbackUsage({
        tx: params.tx,
        userId: params.userId,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        todayStart
      });
    }
    throw error;
  }

  if (!existing) {
    try {
      const created = await usageRepo.create({
        data: {
          id: randomUUID(),
          user_id: params.userId,
          period_start: params.periodStart,
          period_end: params.periodEnd,
          releases_used: 0,
          ai_requests_used_day: 0,
          ai_requests_used_month: 0,
          last_ai_reset_day: todayStart,
          updated_at: now
        },
        select
      });
      return mapUsageRow(created);
    } catch (error) {
      if (isSubscriptionUsageTableMissing(error)) {
        return buildFallbackUsage({
          tx: params.tx,
          userId: params.userId,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          todayStart
        });
      }
      throw error;
    }
  }

  const newPeriod =
    existing.period_start.getTime() !== params.periodStart.getTime() ||
    existing.period_end.getTime() !== params.periodEnd.getTime();
  const newDay = existing.last_ai_reset_day.getTime() !== todayStart.getTime();

  if (!newPeriod && !newDay) {
    return mapUsageRow(existing);
  }

  try {
    const updated = await usageRepo.update({
      where: { id: existing.id },
      data: {
        period_start: params.periodStart,
        period_end: params.periodEnd,
        releases_used: newPeriod ? 0 : existing.releases_used,
        ai_requests_used_month: newPeriod ? 0 : existing.ai_requests_used_month,
        ai_requests_used_day: newDay || newPeriod ? 0 : existing.ai_requests_used_day,
        last_ai_reset_day: newDay || newPeriod ? todayStart : existing.last_ai_reset_day,
        updated_at: now
      },
      select
    });
    return mapUsageRow(updated);
  } catch (error) {
    if (isSubscriptionUsageTableMissing(error)) {
      return buildFallbackUsage({
        tx: params.tx,
        userId: params.userId,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        todayStart
      });
    }
    throw error;
  }
}

async function resolveSubscriptionRuntime(tx: TxClient, userId: string): Promise<{
  plan: EffectivePlan;
  currentPlan: EffectivePlan | null;
  status: "active" | "none";
  hasActiveSubscription: boolean;
  startedAt: Date | null;
  endsAt: Date | null;
  limits: PlanLimits;
  usage: {
    id: string | null;
    periodStart: Date | null;
    periodEnd: Date | null;
    releasesUsed: number;
    aiRequestsUsedDay: number;
    aiRequestsUsedMonth: number;
    lastAiResetDay: Date | null;
  };
}> {
  const subscription = await getUserSubscriptionRecord(tx, userId);

  if (!subscription) {
    return {
      plan: "STANDARD",
      currentPlan: null,
      status: "none",
      hasActiveSubscription: false,
      startedAt: null,
      endsAt: null,
      limits: getPlanLimits("STANDARD", false),
      usage: {
        id: null,
        periodStart: null,
        periodEnd: null,
        releasesUsed: 0,
        aiRequestsUsedDay: 0,
        aiRequestsUsedMonth: 0,
        lastAiResetDay: null
      }
    };
  }

  const normalizedPlan = normalizePlan(subscription.plan);
  const now = new Date();
  const effectiveEnd = getSubscriptionEffectiveEndDate(subscription);
  const hasFutureEnd = Boolean(effectiveEnd && effectiveEnd.getTime() > now.getTime());
  const hasActiveSubscription =
    (subscription.status === "ACTIVE" || subscription.status === "TRIALING") &&
    hasFutureEnd;
  const currentPlan: EffectivePlan | null = hasActiveSubscription ? normalizedPlan : null;
  const plan: EffectivePlan = currentPlan ?? "STANDARD";
  const status: "active" | "none" = hasActiveSubscription ? "active" : "none";

  const anchor = hasActiveSubscription ? subscription.startedAt : new Date();
  const window = getWindowFromAnchor(anchor, now);
  const usage = await getOrResetUsage({
    tx,
    userId,
    periodStart: window.start,
    periodEnd: window.end
  });

  return {
    plan,
    currentPlan,
    status,
    hasActiveSubscription,
    startedAt: subscription.startedAt,
    endsAt: hasActiveSubscription ? effectiveEnd : null,
    limits: getPlanLimits(plan, hasActiveSubscription),
    usage: {
      id: usage.id,
      periodStart: usage.periodStart,
      periodEnd: usage.periodEnd,
      releasesUsed: usage.releasesUsed,
      aiRequestsUsedDay: usage.aiRequestsUsedDay,
      aiRequestsUsedMonth: usage.aiRequestsUsedMonth,
      lastAiResetDay: usage.lastAiResetDay
    }
  };
}

export async function getSubscriptionOverview(prisma: PrismaClient, userId: string): Promise<SubscriptionOverview> {
  const runtime = await resolveSubscriptionRuntime(prisma, userId);
  const now = new Date();
  const countdownDays =
    runtime.endsAt && runtime.endsAt.getTime() > now.getTime()
      ? Math.ceil((runtime.endsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : null;

  return {
    plan: runtime.plan,
    currentPlan: runtime.currentPlan,
    hasActiveSubscription: runtime.hasActiveSubscription,
    status: runtime.status,
    startedAt: runtime.startedAt ? runtime.startedAt.toISOString() : null,
    endsAt: runtime.endsAt ? runtime.endsAt.toISOString() : null,
    countdownDays,
    shouldNotifyExpiry: countdownDays != null && countdownDays <= 3,
    usage: {
      periodStart: runtime.usage.periodStart ? runtime.usage.periodStart.toISOString() : null,
      periodEnd: runtime.usage.periodEnd ? runtime.usage.periodEnd.toISOString() : null,
      releasesUsed: runtime.usage.releasesUsed,
      aiDayUsed: runtime.usage.aiRequestsUsedDay,
      aiMonthUsed: runtime.usage.aiRequestsUsedMonth,
      lastAiResetDay: runtime.usage.lastAiResetDay ? runtime.usage.lastAiResetDay.toISOString() : null
    },
    limits: runtime.limits,
    pricing: PAYG_PRICING
  };
}

export async function checkReleaseCreationLimit(prisma: PrismaClient, userId: string): Promise<LimitDecision> {
  return prisma.$transaction(async (tx) => {
    const runtime = await resolveSubscriptionRuntime(tx, userId);

    if (runtime.limits.releasesLimit == null) {
      return {
        allowed: true,
        plan: runtime.plan,
        limits: runtime.limits,
        usage: {
          releasesUsed: runtime.usage.releasesUsed,
          aiDayUsed: runtime.usage.aiRequestsUsedDay,
          aiMonthUsed: runtime.usage.aiRequestsUsedMonth
        }
      };
    }

    if (runtime.usage.releasesUsed >= runtime.limits.releasesLimit) {
      const reason =
        runtime.plan === "STANDARD" && !runtime.hasActiveSubscription
          ? "На STANDARD без активной подписки релизы создаются платно."
          : "Вы использовали все релизы в этом месяце.";
      return {
        allowed: false,
        plan: runtime.plan,
        code: "release_limit_reached",
        reason,
        payAsYouGoPricing: PAYG_PRICING,
        limits: runtime.limits,
        usage: {
          releasesUsed: runtime.usage.releasesUsed,
          aiDayUsed: runtime.usage.aiRequestsUsedDay,
          aiMonthUsed: runtime.usage.aiRequestsUsedMonth
        }
      };
    }

    return {
      allowed: true,
      plan: runtime.plan,
      limits: runtime.limits,
      usage: {
        releasesUsed: runtime.usage.releasesUsed,
        aiDayUsed: runtime.usage.aiRequestsUsedDay,
        aiMonthUsed: runtime.usage.aiRequestsUsedMonth
      }
    };
  });
}

export async function incrementReleaseUsage(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const runtime = await resolveSubscriptionRuntime(tx, userId);
    if (!runtime.usage.id) return;
    const usageRepo = getDelegate<{ update: (args: unknown) => Promise<unknown> }>(
      tx,
      "subscription_usage"
    );
    if (!usageRepo?.update) return;

    await usageRepo.update({
      where: { id: runtime.usage.id },
      data: {
        releases_used: {
          increment: 1
        },
        updated_at: new Date()
      }
    });
  });
}

export async function checkAiAccess(prisma: PrismaClient, userId: string): Promise<LimitDecision> {
  return prisma.$transaction(async (tx) => {
    const runtime = await resolveSubscriptionRuntime(tx, userId);

    if (!runtime.limits.aiEnabled) {
      return {
        allowed: false,
        plan: runtime.plan,
        code: "ai_unavailable",
        reason: "AI доступен только на тарифе PRO и выше.",
        limits: runtime.limits,
        usage: {
          releasesUsed: runtime.usage.releasesUsed,
          aiDayUsed: runtime.usage.aiRequestsUsedDay,
          aiMonthUsed: runtime.usage.aiRequestsUsedMonth
        }
      };
    }

    if (
      runtime.limits.aiDayLimit != null &&
      runtime.usage.aiRequestsUsedDay >= runtime.limits.aiDayLimit
    ) {
      return {
        allowed: false,
        plan: runtime.plan,
        code: "ai_limit_reached",
        reason: "Лимит AI на сегодня исчерпан.",
        limits: runtime.limits,
        usage: {
          releasesUsed: runtime.usage.releasesUsed,
          aiDayUsed: runtime.usage.aiRequestsUsedDay,
          aiMonthUsed: runtime.usage.aiRequestsUsedMonth
        }
      };
    }

    if (
      runtime.limits.aiMonthLimit != null &&
      runtime.usage.aiRequestsUsedMonth >= runtime.limits.aiMonthLimit
    ) {
      return {
        allowed: false,
        plan: runtime.plan,
        code: "ai_limit_reached",
        reason: "Лимит AI на месяц исчерпан.",
        limits: runtime.limits,
        usage: {
          releasesUsed: runtime.usage.releasesUsed,
          aiDayUsed: runtime.usage.aiRequestsUsedDay,
          aiMonthUsed: runtime.usage.aiRequestsUsedMonth
        }
      };
    }

    return {
      allowed: true,
      plan: runtime.plan,
      limits: runtime.limits,
      usage: {
        releasesUsed: runtime.usage.releasesUsed,
        aiDayUsed: runtime.usage.aiRequestsUsedDay,
        aiMonthUsed: runtime.usage.aiRequestsUsedMonth
      }
    };
  });
}

export async function checkPriorityReleaseAccess(
  prisma: PrismaClient,
  userId: string
): Promise<{
  allowed: boolean;
  plan: EffectivePlan;
  reason?: string;
}> {
  return prisma.$transaction(async (tx) => {
    const runtime = await resolveSubscriptionRuntime(tx, userId);
    if (runtime.plan === "PRO" || runtime.plan === "ENTERPRISE") {
      return { allowed: true, plan: runtime.plan };
    }
    return {
      allowed: false,
      plan: runtime.plan,
      reason: "Приоритетный релиз доступен на тарифе PRO и выше."
    };
  });
}

export async function incrementAiUsage(prisma: PrismaClient, userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const runtime = await resolveSubscriptionRuntime(tx, userId);
    if (!runtime.usage.id) return;
    const usageRepo = getDelegate<{ update: (args: unknown) => Promise<unknown> }>(
      tx,
      "subscription_usage"
    );
    if (!usageRepo?.update) return;

    await usageRepo.update({
      where: { id: runtime.usage.id },
      data: {
        ai_requests_used_day: {
          increment: 1
        },
        ai_requests_used_month: {
          increment: 1
        },
        last_ai_reset_day: dayStart(new Date()),
        updated_at: new Date()
      }
    });
  });
}

export async function applySubscriptionUpgrade(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  plan: SubscriptionPlan;
}): Promise<{ id: string; startedAt: Date; endsAt: Date }> {
  const subscriptionRepo = getDelegate<{
    findUnique: (args: unknown) => Promise<{
      id: string;
      startedAt: Date;
      ends_at: Date | null;
      renewalAt: Date | null;
    } | null>;
    upsert: (args: unknown) => Promise<{
      id: string;
      startedAt: Date;
      ends_at: Date | null;
      renewalAt: Date | null;
    }>;
  }>(params.tx, "subscription");

  const existing = subscriptionRepo?.findUnique
    ? await subscriptionRepo.findUnique({
        where: { userId: params.userId },
        select: {
          id: true,
          startedAt: true,
          ends_at: true,
          renewalAt: true
        }
      })
    : null;

  const now = new Date();
  const currentEnd = existing
    ? getSubscriptionEffectiveEndDate({
        ends_at: existing.ends_at ?? null,
        renewalAt: existing.renewalAt ?? null
      })
    : null;
  const nextEnd = currentEnd && now.getTime() < currentEnd.getTime() ? addMonths(currentEnd, 1) : addMonths(now, 1);

  const mappedLevel =
    params.plan === "PRO"
      ? "professional"
      : params.plan === "ENTERPRISE" || params.plan === "LABEL"
        ? "enterprise"
        : "standard";

  const updated = subscriptionRepo?.upsert
    ? await subscriptionRepo.upsert({
        where: { userId: params.userId },
        create: {
          id: randomUUID(),
          userId: params.userId,
          plan: params.plan,
          status: "ACTIVE",
          startedAt: now,
          ends_at: nextEnd,
          renewalAt: nextEnd,
          updatedAt: now
        },
        update: {
          plan: params.plan,
          status: "ACTIVE",
          startedAt: existing?.startedAt ?? now,
          ends_at: nextEnd,
          renewalAt: nextEnd,
          updatedAt: now
        },
        select: {
          id: true,
          startedAt: true,
          ends_at: true,
          renewalAt: true
        }
      })
    : await params.tx.user.update({
        where: { id: params.userId },
        data: {
          isSubscribed: true,
          subscribeLevel: mappedLevel,
          expiresAt: nextEnd
        },
        select: {
          id: true,
          expiresAt: true
        }
      }).then((user) => ({
        id: user.id,
        startedAt: now,
        ends_at: user.expiresAt ?? nextEnd,
        renewalAt: user.expiresAt ?? nextEnd
      }));

  const window = getWindowFromAnchor(updated.startedAt, now);
  try {
    const usageRepo = getDelegate<{ upsert: (args: unknown) => Promise<unknown> }>(
      params.tx,
      "subscription_usage"
    );
    if (usageRepo?.upsert) {
      await usageRepo.upsert({
        where: { user_id: params.userId },
        create: {
          id: randomUUID(),
          user_id: params.userId,
          period_start: window.start,
          period_end: window.end,
          releases_used: 0,
          ai_requests_used_day: 0,
          ai_requests_used_month: 0,
          last_ai_reset_day: dayStart(now),
          updated_at: now
        },
        update: {
          period_start: window.start,
          period_end: window.end,
          releases_used: 0,
          ai_requests_used_day: 0,
          ai_requests_used_month: 0,
          last_ai_reset_day: dayStart(now),
          updated_at: now
        }
      });
    }
  } catch (error) {
    if (!isSubscriptionUsageTableMissing(error)) {
      throw error;
    }
  }

  return {
    id: updated.id,
    startedAt: updated.startedAt,
    endsAt: getSubscriptionEffectiveEndDate(updated) ?? addDays(now, 30)
  };
}

export function mapTariffToPlan(tariffId: "standard" | "pro" | "enterprise"): SubscriptionPlan {
  if (tariffId === "pro") return "PRO";
  if (tariffId === "enterprise") return "ENTERPRISE";
  return "STANDARD";
}
