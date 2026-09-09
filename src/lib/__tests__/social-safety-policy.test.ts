import assert from "node:assert/strict";
import test from "node:test";

import {
  SocialInteractionBlockedError,
  assertSocialInteractionAllowed,
  blockSocialUser,
  createSocialReport,
  listBlockedPeerIds,
  socialReportInputSchema
} from "../social-safety-policy";

test("block policy is symmetric for interactions", async () => {
  const prisma = {
    social_user_blocks: {
      count: async ({ where }: { where: { OR: unknown[] } }) => where.OR.length === 2 ? 1 : 0
    }
  } as never;

  await assert.rejects(
    () => assertSocialInteractionAllowed(prisma, "user-a", "user-b"),
    SocialInteractionBlockedError
  );
});

test("block policy permits self-owned work and unrelated peers", async () => {
  let queries = 0;
  const prisma = {
    social_user_blocks: {
      count: async () => { queries += 1; return 0; }
    }
  } as never;

  await assertSocialInteractionAllowed(prisma, "user-a", "user-a");
  await assertSocialInteractionAllowed(prisma, "user-a", "user-c");
  assert.equal(queries, 1);
});

test("blocked peer list includes both directions without duplicates", async () => {
  const prisma = {
    social_user_blocks: {
      findMany: async () => [
        { blocker_user_id: "user-a", blocked_user_id: "user-b" },
        { blocker_user_id: "user-c", blocked_user_id: "user-a" },
        { blocker_user_id: "user-a", blocked_user_id: "user-b" }
      ]
    }
  } as never;

  assert.deepEqual(await listBlockedPeerIds(prisma, "user-a"), ["user-b", "user-c"]);
});

test("missing social block table is treated as no blocked peers", async () => {
  const prisma = {
    social_user_blocks: {
      findMany: async () => {
        throw new Error("The table `icecream.social_user_blocks` does not exist in the current database.");
      }
    }
  } as never;

  assert.deepEqual(await listBlockedPeerIds(prisma, "user-a"), []);
});

test("missing social block table permits interactions instead of throwing", async () => {
  const prisma = {
    social_user_blocks: {
      count: async () => {
        throw new Error("The table `icecream.social_user_blocks` does not exist in the current database.");
      }
    }
  } as never;

  await assert.doesNotReject(() => assertSocialInteractionAllowed(prisma, "user-a", "user-b"));
});

test("pool timeout in social block storage degrades to empty result instead of crashing community", async () => {
  const prisma = {
    social_user_blocks: {
      findMany: async () => {
        const error = new Error("Timed out fetching a new connection from the connection pool.");
        throw error;
      },
      count: async () => {
        const error = new Error("Timed out fetching a new connection from the connection pool.");
        throw error;
      }
    }
  } as never;

  assert.deepEqual(await listBlockedPeerIds(prisma, "user-a"), []);
  await assert.doesNotReject(() => assertSocialInteractionAllowed(prisma, "user-a", "user-b"));
});

test("blocking removes follow edges in both directions in one transaction", async () => {
  const deletes: unknown[] = [];
  let upserted = false;
  const tx = {
    user: { findUnique: async () => ({ id: "user-b" }) },
    social_user_blocks: {
      upsert: async () => { upserted = true; return { id: "block-1" }; }
    },
    artist_profile_followers: {
      deleteMany: async ({ where }: { where: unknown }) => { deletes.push(where); return { count: 1 }; }
    }
  };
  const prisma = { $transaction: async (work: (value: typeof tx) => unknown) => work(tx) } as never;

  const result = await blockSocialUser(prisma, "user-a", "user-b");
  assert.equal(result.blocked, true);
  assert.equal(upserted, true);
  assert.equal(deletes.length, 1);
  assert.deepEqual(deletes[0], {
    OR: [
      { profile_user_id: "user-a", follower_user_id: "user-b" },
      { profile_user_id: "user-b", follower_user_id: "user-a" }
    ]
  });
});

test("report input is bounded and report persistence is idempotent", async () => {
  assert.equal(socialReportInputSchema.safeParse({ targetType: "post", targetId: "not-a-uuid", reason: "spam" }).success, false);
  assert.equal(socialReportInputSchema.safeParse({ targetType: "post", targetId: "00000000-0000-4000-8000-000000000001", reason: "spam", details: "x".repeat(1001) }).success, false);

  let upserts = 0;
  const prisma = {
    artist_profile_posts: {
      findUnique: async () => ({ user_id: "user-b" })
    },
    social_reports: {
      upsert: async () => {
        upserts += 1;
        return { id: "report-1", status: "pending" };
      }
    }
  } as never;
  const input = {
    targetType: "post" as const,
    targetId: "00000000-0000-4000-8000-000000000001",
    reason: "spam" as const,
    details: "duplicate campaign"
  };

  assert.deepEqual(await createSocialReport(prisma, "user-a", input), { id: "report-1", status: "pending" });
  assert.deepEqual(await createSocialReport(prisma, "user-a", input), { id: "report-1", status: "pending" });
  assert.equal(upserts, 2);
});
