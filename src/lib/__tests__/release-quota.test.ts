import assert from "node:assert/strict";
import test from "node:test";

import { withExtrasSupplement, withExtrasSupplementPaid } from "@/lib/release-extras-supplement";
import {
  extrasIncludedInSubscription,
  getUserReleaseQuota,
  mergeReleaseRolesPaymentUsage,
  type ReleasePaymentUsage
} from "@/lib/release-quota";

function createClient(params: {
  user: {
    isSubscribed: boolean;
    subscribeLevel: "standard" | "professional" | "enterprise" | null;
    expiresAt: Date | null;
  } | null;
  releases?: Array<{ id: string; date: Date; confirmed?: boolean; roles: unknown }>;
  orders?: Array<{ metadata: unknown }>;
}) {
  return {
    user: {
      findUnique: async () => params.user
    },
    release: {
      findMany: async () => params.releases ?? []
    },
    orders: {
      findMany: async () => params.orders ?? []
    }
  } as unknown as Parameters<typeof getUserReleaseQuota>[1];
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function usage(type: ReleasePaymentUsage["type"], usedAt = new Date()): unknown {
  return mergeReleaseRolesPaymentUsage(null, {
    type,
    usedAt: usedAt.toISOString(),
    plan: type === "subscription" ? "STANDARD" : undefined,
    releasesLimit: type === "subscription" ? 2 : undefined,
    releasesUsedAfterSubmit: type === "subscription" ? 1 : undefined
  });
}

test("STANDARD allows three included releases before payment is required", async () => {
  const client = createClient({
    user: {
      isSubscribed: true,
      subscribeLevel: "standard",
      expiresAt: daysFromNow(20)
    },
    releases: [{ id: "rel_1", date: new Date(), roles: usage("subscription") }]
  });

  const quota = await getUserReleaseQuota("user_1", client);
  assert.equal(quota.plan, "STANDARD");
  assert.equal(quota.includedLimit, 3);
  assert.equal(quota.used, 1);
  assert.equal(quota.remaining, 2);
  assert.equal(quota.requiresPaymentForNextRelease, false);
});

test("PRO allows six included releases", async () => {
  const client = createClient({
    user: {
      isSubscribed: true,
      subscribeLevel: "professional",
      expiresAt: daysFromNow(20)
    },
    releases: Array.from({ length: 5 }, (_, index) => ({
      id: `rel_${index}`,
      date: new Date(),
      roles: usage("subscription")
    }))
  });

  const quota = await getUserReleaseQuota("user_1", client);
  assert.equal(quota.plan, "PRO");
  assert.equal(quota.includedLimit, 6);
  assert.equal(quota.used, 5);
  assert.equal(quota.remaining, 1);
  assert.equal(quota.requiresPaymentForNextRelease, false);
});

test("ENTERPRISE remains unlimited while active", async () => {
  const client = createClient({
    user: {
      isSubscribed: true,
      subscribeLevel: "enterprise",
      expiresAt: daysFromNow(20)
    },
    releases: Array.from({ length: 20 }, (_, index) => ({
      id: `rel_${index}`,
      date: new Date(),
      roles: usage("subscription")
    }))
  });

  const quota = await getUserReleaseQuota("user_1", client);
  assert.equal(quota.plan, "ENTERPRISE");
  assert.equal(quota.includedLimit, null);
  assert.equal(quota.remaining, null);
  assert.equal(quota.requiresPaymentForNextRelease, false);
});

test("inactive subscription requires standalone payment", async () => {
  const client = createClient({
    user: {
      isSubscribed: true,
      subscribeLevel: "professional",
      expiresAt: daysFromNow(-1)
    }
  });

  const quota = await getUserReleaseQuota("user_1", client);
  assert.equal(quota.isActive, false);
  assert.equal(quota.includedLimit, 0);
  assert.equal(quota.requiresPaymentForNextRelease, true);
});

test("standalone paid release does not consume subscription quota", async () => {
  const client = createClient({
    user: {
      isSubscribed: true,
      subscribeLevel: "standard",
      expiresAt: daysFromNow(20)
    },
    releases: [{ id: "rel_paid", date: new Date(), roles: usage("standalone_payment") }],
    orders: [{ metadata: { releaseId: "rel_paid" } }]
  });

  const quota = await getUserReleaseQuota("user_1", client);
  assert.equal(quota.used, 0);
  assert.equal(quota.remaining, 3);
  assert.equal(quota.requiresPaymentForNextRelease, false);
});

test("partner-code paid release does not consume subscription quota", async () => {
  const client = createClient({
    user: {
      isSubscribed: true,
      subscribeLevel: "standard",
      expiresAt: daysFromNow(20)
    },
    releases: [{ id: "rel_partner", date: new Date(), roles: usage("partner_code") }]
  });

  const quota = await getUserReleaseQuota("user_1", client);
  assert.equal(quota.used, 0);
  assert.equal(quota.remaining, 3);
  assert.equal(quota.requiresPaymentForNextRelease, false);
});

test("a STANDARD release waiting for its extras payment holds its slot, a paid supplement keeps it", async () => {
  const waiting = withExtrasSupplement(usage("subscription") as Record<string, unknown>, {
    paid: { lyrics: 0, karaoke: 0, video: 0 },
    amountRub: 150
  });
  const paid = withExtrasSupplementPaid(waiting, { orderId: "order_extras" });
  const client = createClient({
    user: { isSubscribed: true, subscribeLevel: "standard", expiresAt: daysFromNow(20) },
    releases: [
      { id: "rel_waiting", date: new Date(), confirmed: false, roles: waiting },
      { id: "rel_paid_extras", date: new Date(), confirmed: true, roles: paid },
      { id: "rel_unpaid_other", date: new Date(), confirmed: false, roles: usage("subscription") }
    ],
    orders: [{ metadata: { releaseId: "rel_paid_extras", extrasSupplement: true } }]
  });

  const quota = await getUserReleaseQuota("user_1", client);
  assert.equal(quota.used, 2);
  assert.equal(quota.remaining, 1);
});

test("extras are included on PRO and ENTERPRISE only", () => {
  assert.equal(extrasIncludedInSubscription({ plan: "STANDARD", isActive: true }), false);
  assert.equal(extrasIncludedInSubscription({ plan: "PRO", isActive: true }), true);
  assert.equal(extrasIncludedInSubscription({ plan: "ENTERPRISE", isActive: true }), true);
  assert.equal(extrasIncludedInSubscription({ plan: "ENTERPRISE", isActive: false }), false);
});
