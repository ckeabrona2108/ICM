import assert from "node:assert/strict";
import test from "node:test";

import {
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
  releases?: Array<{ id: string; date: Date; roles: unknown }>;
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
    releasesLimit: type === "subscription" ? 1 : undefined,
    releasesUsedAfterSubmit: type === "subscription" ? 1 : undefined
  });
}

test("STANDARD allows one included release and then requires payment", async () => {
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
  assert.equal(quota.includedLimit, 1);
  assert.equal(quota.used, 1);
  assert.equal(quota.remaining, 0);
  assert.equal(quota.requiresPaymentForNextRelease, true);
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
  assert.equal(quota.remaining, 1);
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
  assert.equal(quota.remaining, 1);
  assert.equal(quota.requiresPaymentForNextRelease, false);
});
