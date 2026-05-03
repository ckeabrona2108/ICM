import {
  SubscriptionPlan,
  SubscriptionStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { addDays, addMonths } from "date-fns";

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

const PAYG_PRICING: PlanPricing = {
  release: 350,
  text: 75,
  karaokeText: 75,
  videoShot: 75,
  videoClip: 100
};

function normalizePlan(plan: SubscriptionPlan | null | undefined): EffectivePlan {
  if (plan === SubscriptionPlan.PRO) return "PRO";
  if (plan === SubscriptionPlan.ENTERPRISE || plan === SubscriptionPlan.LABEL) return "ENTERPRISE";
  if (plan === SubscriptionPlan.STANDARD) return "STANDARD";
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
      createdAt: {
        gte: params.periodStart,
        lt: params.periodEnd
      }
    }
  });

  const aiMonthPromise = params.tx.analyticsAiInsight
    .count({
      where: {
        userId: params.userId,
        createdAt: {
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

  const aiDayPromise = params.tx.analyticsAiInsight
    .count({
      where: {
        userId: params.userId,
        createdAt: {
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
  renewalAt: Date | null;
} | null> {
  const subscription = await tx.subscription.findUnique({
    where: { userId },
    select: {
      id: true,
      plan: true,
      status: true,
      startedAt: true,
      renewalAt: true
    }
  });

  if (!subscription) return null;

  return subscription;
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
    releasesUsed: true,
    aiRequestsUsedDay: true,
    aiRequestsUsedMonth: true,
    lastAiResetDay: true,
    periodStart: true,
    periodEnd: true
  } as const;

  let existing:
    | {
        id: string;
        releasesUsed: number;
        aiRequestsUsedDay: number;
        aiRequestsUsedMonth: number;
        lastAiResetDay: Date;
        periodStart: Date;
        periodEnd: Date;
      }
    | null = null;

  try {
    existing = await params.tx.subscriptionUsage.findUnique({
      where: { userId: params.userId },
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
      return await params.tx.subscriptionUsage.create({
        data: {
          userId: params.userId,
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          releasesUsed: 0,
          aiRequestsUsedDay: 0,
          aiRequestsUsedMonth: 0,
          lastAiResetDay: todayStart
        },
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
  }

  const newPeriod =
    existing.periodStart.getTime() !== params.periodStart.getTime() ||
    existing.periodEnd.getTime() !== params.periodEnd.getTime();
  const newDay = existing.lastAiResetDay.getTime() !== todayStart.getTime();

  if (!newPeriod && !newDay) {
    return existing;
  }

  try {
    return await params.tx.subscriptionUsage.update({
      where: { id: existing.id },
      data: {
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        releasesUsed: newPeriod ? 0 : existing.releasesUsed,
        aiRequestsUsedMonth: newPeriod ? 0 : existing.aiRequestsUsedMonth,
        aiRequestsUsedDay: newDay || newPeriod ? 0 : existing.aiRequestsUsedDay,
        lastAiResetDay: newDay || newPeriod ? todayStart : existing.lastAiResetDay
      },
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
  const hasFutureEnd = Boolean(
    subscription.renewalAt && subscription.renewalAt.getTime() > now.getTime()
  );
  const hasActiveSubscription =
    (subscription.status === SubscriptionStatus.ACTIVE ||
      subscription.status === SubscriptionStatus.TRIALING) &&
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
    endsAt: hasActiveSubscription ? subscription.renewalAt : null,
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

    await tx.subscriptionUsage.update({
      where: { id: runtime.usage.id },
      data: {
        releasesUsed: {
          increment: 1
        }
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

    await tx.subscriptionUsage.update({
      where: { id: runtime.usage.id },
      data: {
        aiRequestsUsedDay: {
          increment: 1
        },
        aiRequestsUsedMonth: {
          increment: 1
        },
        lastAiResetDay: dayStart(new Date())
      }
    });
  });
}

export async function applySubscriptionUpgrade(params: {
  tx: Prisma.TransactionClient;
  userId: string;
  plan: SubscriptionPlan;
}): Promise<{ id: string; startedAt: Date; endsAt: Date }> {
  const existing = await params.tx.subscription.findUnique({
    where: { userId: params.userId },
    select: {
      id: true,
      startedAt: true,
      renewalAt: true
    }
  });

  const now = new Date();
  const currentEnd = existing?.renewalAt ?? null;
  const nextEnd = currentEnd && now.getTime() < currentEnd.getTime() ? addMonths(currentEnd, 1) : addMonths(now, 1);

  const updated = await params.tx.subscription.upsert({
    where: { userId: params.userId },
    create: {
      userId: params.userId,
      plan: params.plan,
      status: SubscriptionStatus.ACTIVE,
      startedAt: now,
      renewalAt: nextEnd
    },
    update: {
      plan: params.plan,
      status: SubscriptionStatus.ACTIVE,
      startedAt: existing?.startedAt ?? now,
      renewalAt: nextEnd
    },
    select: {
      id: true,
      startedAt: true,
      renewalAt: true
    }
  });

  const window = getWindowFromAnchor(updated.startedAt, now);
  try {
    await params.tx.subscriptionUsage.upsert({
      where: { userId: params.userId },
      create: {
        userId: params.userId,
        periodStart: window.start,
        periodEnd: window.end,
        releasesUsed: 0,
        aiRequestsUsedDay: 0,
        aiRequestsUsedMonth: 0,
        lastAiResetDay: dayStart(now)
      },
      update: {
        periodStart: window.start,
        periodEnd: window.end,
        releasesUsed: 0,
        aiRequestsUsedDay: 0,
        aiRequestsUsedMonth: 0,
        lastAiResetDay: dayStart(now)
      }
    });
  } catch (error) {
    if (!isSubscriptionUsageTableMissing(error)) {
      throw error;
    }
  }

  return {
    id: updated.id,
    startedAt: updated.startedAt,
    endsAt: updated.renewalAt ?? addDays(now, 30)
  };
}

export function mapTariffToPlan(tariffId: "standard" | "pro" | "enterprise"): SubscriptionPlan {
  if (tariffId === "pro") return SubscriptionPlan.PRO;
  if (tariffId === "enterprise") return SubscriptionPlan.ENTERPRISE;
  return SubscriptionPlan.STANDARD;
}
