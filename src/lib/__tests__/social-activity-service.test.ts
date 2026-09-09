import assert from "node:assert/strict";
import test from "node:test";

import { listSocialActivityPage, upsertSocialActivityEvent } from "@/lib/social-activity-service";

test("activity ledger uses published_at and id as a deterministic duplicate-timestamp keyset", async () => {
  const queries: Array<Record<string, unknown>> = [];
  const prisma = {
    artist_profile_followers: { findMany: async () => [] },
    social_activity_events: {
      findFirst: async () => ({ id: "event-c" }),
      findMany: async (args: Record<string, unknown>) => {
        queries.push(args);
        return [
          { id: "event-b", kind: "POST", source_id: "post-b", published_at: new Date("2026-08-19T12:00:00.000Z") },
          { id: "event-a", kind: "POST", source_id: "post-a", published_at: new Date("2026-08-19T12:00:00.000Z") }
        ];
      }
    }
  } as never;

  await listSocialActivityPage({
    prisma,
    limit: 2,
    cursor: { publishedAt: "2026-08-19T12:00:00.000Z", id: "event-c" }
  });

  const query = queries[0]!;
  assert.deepEqual(query.orderBy, [{ published_at: "desc" }, { id: "desc" }]);
  assert.equal(query.take, 3);
  assert.deepEqual(((query.where as { AND: unknown[] }).AND.at(-1)), {
    OR: [
      { published_at: { lt: new Date("2026-08-19T12:00:00.000Z") } },
      { published_at: new Date("2026-08-19T12:00:00.000Z"), id: { lt: "event-c" } }
    ]
  });
});

test("activity page is independent of profile discovery caps and exposes one-row lookahead", async () => {
  const rows = Array.from({ length: 4 }, (_, index) => ({
    id: `event-${index}`,
    kind: "POST",
    source_id: `post-${index}`,
    published_at: new Date(2026, 7, 19, 12, 0, 4 - index)
  }));
  const prisma = {
    artist_profile_followers: { findMany: async () => [] },
    social_activity_events: { findFirst: async () => null, findMany: async () => rows }
  } as never;

  const page = await listSocialActivityPage({ prisma, limit: 3 });
  assert.equal(page.rows.length, 3);
  assert.equal(page.hasMore, true);
});

test("activity ledger excludes blocked, muted, and hidden sources before applying its limit", async () => {
  const queries: Array<Record<string, unknown>> = [];
  const prisma = {
    artist_profile_followers: { findMany: async () => [] },
    social_user_blocks: { findMany: async () => [{ blocker_user_id: "viewer", blocked_user_id: "blocked" }] },
    social_feed_preferences: { findMany: async () => [
      { action: "mute", target_type: "user", target_id: "muted" },
      { action: "hide", target_type: "post", target_id: "hidden-post" },
      { action: "hide", target_type: "release", target_id: "hidden-release" }
    ] },
    social_activity_events: {
      findFirst: async () => ({ id: "cursor" }),
      findMany: async (args: Record<string, unknown>) => { queries.push(args); return []; }
    }
  } as never;

  await listSocialActivityPage({ prisma, viewerUserId: "viewer", limit: 20 });
  const serialized = JSON.stringify(queries[0]?.where);
  assert.match(serialized, /blocked/u);
  assert.match(serialized, /muted/u);
  assert.match(serialized, /hidden-post/u);
  assert.match(serialized, /hidden-release/u);
});

test("missing activity ledger table returns an empty valid unavailable page", async () => {
  const prisma = {
    artist_profile_followers: { findMany: async () => [] },
    social_activity_events: {
      findMany: async () => {
        throw new Error("The table `icecream.social_activity_events` does not exist in the current database.");
      }
    }
  } as never;

  assert.deepEqual(await listSocialActivityPage({ prisma, limit: 20 }), {
    rows: [],
    hasMore: false,
    cursorValid: true,
    unavailable: true
  });
});

test("activity ledger pool timeout returns an empty valid unavailable page", async () => {
  const prisma = {
    artist_profile_followers: { findMany: async () => [] },
    social_activity_events: {
      findMany: async () => {
        const error = new Error("Timed out fetching a new connection from the connection pool.");
        Object.assign(error, { code: "P2024" });
        throw error;
      }
    }
  } as never;

  assert.deepEqual(await listSocialActivityPage({ prisma, limit: 20 }), {
    rows: [],
    hasMore: false,
    cursorValid: true,
    unavailable: true
  });
});

test("activity ledger tolerates follower lookup pool timeout", async () => {
  const prisma = {
    artist_profile_followers: {
      findMany: async () => {
        const error = new Error("Timed out fetching a new connection from the connection pool.");
        Object.assign(error, { code: "P2024" });
        throw error;
      }
    },
    social_user_blocks: { findMany: async () => [] },
    social_feed_preferences: { findMany: async () => [] },
    social_activity_events: {
      findFirst: async () => null,
      findMany: async () => []
    }
  } as never;

  const page = await listSocialActivityPage({ prisma, viewerUserId: "viewer", limit: 20 });
  assert.equal(page.unavailable, false);
  assert.deepEqual(page.rows, []);
});

test("activity upsert stores collaboration search and presentation fields without changing index architecture", async () => {
  let createPayload: Record<string, unknown> | null = null;
  const prisma = {
    social_activity_events: {
      upsert: async (args: { create: Record<string, unknown> }) => {
        createPayload = args.create;
        return args;
      }
    }
  } as never;

  await upsertSocialActivityEvent({
    prisma,
    kind: "POST",
    sourceId: "post-1",
    actorUserId: "user-1",
    profileKey: "__personal__",
    audience: "PUBLIC",
    publishedAt: new Date("2026-08-28T12:00:00.000Z"),
    searchText: "find_artist Ищу артиста vocalist Вокалист",
    mediaKind: "AUDIO",
    isCollaboration: true,
    collaborationIntent: "find_artist",
    collaborationRole: "vocalist",
    linkedRelease: true,
    category: "collaboration"
  });

  if (!createPayload) throw new Error("missing upsert payload");
  const createRecord = createPayload as unknown as Record<string, unknown>;
  assert.equal(createRecord["search_text"], "find_artist Ищу артиста vocalist Вокалист");
  assert.equal(createRecord["media_kind"], "AUDIO");
  assert.equal(createRecord["is_collaboration"], true);
  assert.equal(createRecord["collaboration_intent"], "find_artist");
  assert.equal(createRecord["collaboration_role"], "vocalist");
  assert.equal(createRecord["linked_release"], true);
  assert.equal(createRecord["category"], "collaboration");
});
