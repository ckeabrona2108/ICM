// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import {
  SubscriptionPlan,
  SubscriptionStatus,
  type SubscriptionPlan as SubscriptionPlanValue,
  type SubscriptionStatus as SubscriptionStatusValue
} from "@/lib/legacy-business-enums";
import { addMonths } from "date-fns";

import {
  checkPriorityReleaseAccess,
  checkReleaseCreationLimit,
  getSubscriptionOverview
} from "@/lib/subscription-limits";

function createMockPrisma(params: {
  subscription:
    | {
        id: string;
        plan: SubscriptionPlanValue;
        status: SubscriptionStatusValue;
        startedAt: Date;
        renewalAt: Date | null;
      }
    | null;
  usage?: {
    id: string;
    releasesUsed: number;
    aiRequestsUsedDay: number;
    aiRequestsUsedMonth: number;
    lastAiResetDay: Date;
    periodStart: Date;
    periodEnd: Date;
  } | null;
  releaseCount?: number;
}) {
  const state = {
    subscription: params.subscription,
    usage: params.usage ?? null,
    releaseCount: params.releaseCount ?? 0
  };

  const tx = {
    subscription: {
      findUnique: async () => state.subscription,
      update: async ({ data }: { data: Partial<typeof state.subscription> }) => {
        state.subscription = {
          ...(state.subscription as NonNullable<typeof state.subscription>),
          ...data
        };
        return state.subscription;
      }
    },
    subscriptionUsage: {
      findUnique: async () => state.usage,
      create: async ({ data }: { data: NonNullable<typeof state.usage> }) => {
        state.usage = data;
        return data;
      },
      update: async ({
        data
      }: {
        data: Partial<NonNullable<typeof state.usage>>;
      }) => {
        state.usage = {
          ...(state.usage as NonNullable<typeof state.usage>),
          ...data
        };
        return state.usage;
      }
    },
    release: {
      count: async () => state.releaseCount
    },
    analyticsAiInsight: {
      count: async () => 0
    }
  };

  return {
    state,
    prisma: {
      subscription: tx.subscription,
      subscriptionUsage: tx.subscriptionUsage,
      release: tx.release,
      analyticsAiInsight: tx.analyticsAiInsight,
      $transaction: async <T>(handler: (innerTx: typeof tx) => Promise<T>) => handler(tx)
    } as unknown as Parameters<typeof checkReleaseCreationLimit>[0]
  };
}

function makePeriod() {
  const now = new Date();
  const startedAt = new Date(now);
  startedAt.setUTCDate(Math.max(1, startedAt.getUTCDate() - 2));
  const renewalAt = addMonths(startedAt, 1);
  return { startedAt, renewalAt };
}

test("user has 10 old releases and STANDARD subscription: included limit starts from 0/2", async () => {
  const { startedAt, renewalAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_1",
      plan: SubscriptionPlan.STANDARD,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt
    },
    usage: {
      id: "usage_1",
      releasesUsed: 0,
      aiRequestsUsedDay: 0,
      aiRequestsUsedMonth: 0,
      lastAiResetDay: new Date(nowStart()),
      periodStart: startedAt,
      periodEnd: renewalAt
    },
    releaseCount: 10
  });

  const decision = await checkReleaseCreationLimit(prisma, "user_1");

  assert.equal(decision.plan, "STANDARD");
  assert.equal(decision.limits.releasesLimit, 2);
  assert.equal(decision.usage.releasesUsed, 0);
  assert.equal(decision.allowed, true);
});

test("user has 10 old releases and PRO subscription: included limit starts from 0/6", async () => {
  const { startedAt, renewalAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_2",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt
    },
    usage: {
      id: "usage_2",
      releasesUsed: 0,
      aiRequestsUsedDay: 0,
      aiRequestsUsedMonth: 0,
      lastAiResetDay: new Date(nowStart()),
      periodStart: startedAt,
      periodEnd: renewalAt
    },
    releaseCount: 10
  });

  const decision = await checkReleaseCreationLimit(prisma, "user_1");

  assert.equal(decision.plan, "PRO");
  assert.equal(decision.limits.releasesLimit, 6);
  assert.equal(decision.usage.releasesUsed, 0);
  assert.equal(decision.allowed, true);
});

test("STANDARD allows two included releases before payment is required", async () => {
  const { startedAt, renewalAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_3",
      plan: SubscriptionPlan.STANDARD,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt
    },
    usage: {
      id: "usage_3",
      releasesUsed: 2,
      aiRequestsUsedDay: 0,
      aiRequestsUsedMonth: 0,
      lastAiResetDay: new Date(nowStart()),
      periodStart: startedAt,
      periodEnd: renewalAt
    }
  });

  const decision = await checkReleaseCreationLimit(prisma, "user_1");

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "release_limit_reached");
  assert.equal(decision.usage.releasesUsed, 2);
});

test("STANDARD over limit decision does not mutate usage counters", async () => {
  const { startedAt, renewalAt } = makePeriod();
  const { prisma, state } = createMockPrisma({
    subscription: {
      id: "sub_4",
      plan: SubscriptionPlan.STANDARD,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt
    },
    usage: {
      id: "usage_4",
      releasesUsed: 2,
      aiRequestsUsedDay: 0,
      aiRequestsUsedMonth: 0,
      lastAiResetDay: new Date(nowStart()),
      periodStart: startedAt,
      periodEnd: renewalAt
    }
  });

  const before = state.usage?.releasesUsed;
  const decision = await checkReleaseCreationLimit(prisma, "user_1");
  const after = state.usage?.releasesUsed;

  assert.equal(decision.allowed, false);
  assert.equal(before, 2);
  assert.equal(after, 2);
});

test("PRO after 6 included releases requires payment for next release", async () => {
  const { startedAt, renewalAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_5",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt
    },
    usage: {
      id: "usage_5",
      releasesUsed: 6,
      aiRequestsUsedDay: 0,
      aiRequestsUsedMonth: 0,
      lastAiResetDay: new Date(nowStart()),
      periodStart: startedAt,
      periodEnd: renewalAt
    }
  });

  const decision = await checkReleaseCreationLimit(prisma, "user_1");

  assert.equal(decision.allowed, false);
  assert.equal(decision.code, "release_limit_reached");
  assert.equal(decision.limits.releasesLimit, 6);
});

test("ENTERPRISE remains unlimited even with many old releases", async () => {
  const { startedAt, renewalAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_6",
      plan: SubscriptionPlan.ENTERPRISE,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt
    },
    usage: {
      id: "usage_6",
      releasesUsed: 100,
      aiRequestsUsedDay: 50,
      aiRequestsUsedMonth: 500,
      lastAiResetDay: new Date(nowStart()),
      periodStart: startedAt,
      periodEnd: renewalAt
    },
    releaseCount: 100
  });

  const decision = await checkReleaseCreationLimit(prisma, "user_1");

  assert.equal(decision.plan, "ENTERPRISE");
  assert.equal(decision.limits.releasesLimit, null);
  assert.equal(decision.allowed, true);
});

test("without active subscription user works in STANDARD pay-as-you-go (0 included releases)", async () => {
  const { startedAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_7",
      plan: SubscriptionPlan.STANDARD,
      status: SubscriptionStatus.EXPIRED,
      startedAt,
      renewalAt: null
    },
    usage: null
  });

  const decision = await checkReleaseCreationLimit(prisma, "user_1");

  assert.equal(decision.plan, "STANDARD");
  assert.equal(decision.limits.releasesLimit, 0);
  assert.equal(decision.allowed, false);
});

test("overview: user without subscription has no active plan", async () => {
  const { prisma } = createMockPrisma({
    subscription: null
  });

  const overview = await getSubscriptionOverview(prisma, "user_1");

  assert.equal(overview.hasActiveSubscription, false);
  assert.equal(overview.currentPlan, null);
  assert.equal(overview.status, "none");
  assert.equal(overview.endsAt, null);
});

test("overview: expired PRO is treated as no active subscription", async () => {
  const startedAt = new Date();
  startedAt.setUTCMonth(startedAt.getUTCMonth() - 2);
  const expiredAt = new Date();
  expiredAt.setUTCDate(expiredAt.getUTCDate() - 1);

  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_expired_pro",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt: expiredAt
    }
  });

  const overview = await getSubscriptionOverview(prisma, "user_1");

  assert.equal(overview.hasActiveSubscription, false);
  assert.equal(overview.currentPlan, null);
  assert.equal(overview.status, "none");
  assert.equal(overview.endsAt, null);
});

test("overview: active PRO has currentPlan=PRO", async () => {
  const { startedAt, renewalAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_active_pro",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt
    }
  });

  const overview = await getSubscriptionOverview(prisma, "user_1");

  assert.equal(overview.hasActiveSubscription, true);
  assert.equal(overview.currentPlan, "PRO");
  assert.equal(overview.status, "active");
});

test("overview: active STANDARD has currentPlan=STANDARD", async () => {
  const { startedAt, renewalAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_active_standard",
      plan: SubscriptionPlan.STANDARD,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt
    }
  });

  const overview = await getSubscriptionOverview(prisma, "user_1");

  assert.equal(overview.hasActiveSubscription, true);
  assert.equal(overview.currentPlan, "STANDARD");
  assert.equal(overview.status, "active");
});

test("STANDARD user cannot use priority release", async () => {
  const { startedAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_8",
      plan: SubscriptionPlan.STANDARD,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt: addMonths(startedAt, 1)
    }
  });

  const decision = await checkPriorityReleaseAccess(prisma, "user_1");
  assert.equal(decision.allowed, false);
});

test("PRO user can use priority release", async () => {
  const { startedAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_9",
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt: addMonths(startedAt, 1)
    }
  });

  const decision = await checkPriorityReleaseAccess(prisma, "user_1");
  assert.equal(decision.allowed, true);
});

test("ENTERPRISE user can use priority release", async () => {
  const { startedAt } = makePeriod();
  const { prisma } = createMockPrisma({
    subscription: {
      id: "sub_10",
      plan: SubscriptionPlan.ENTERPRISE,
      status: SubscriptionStatus.ACTIVE,
      startedAt,
      renewalAt: addMonths(startedAt, 1)
    }
  });

  const decision = await checkPriorityReleaseAccess(prisma, "user_1");
  assert.equal(decision.allowed, true);
});

function nowStart() {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now.toISOString();
}
