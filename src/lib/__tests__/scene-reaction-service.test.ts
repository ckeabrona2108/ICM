import assert from "node:assert/strict";
import test from "node:test";

import {
  hashSceneVisitorIp,
  getSceneReactionSummaries,
  isSceneReaction,
  normalizeSceneVisitorId,
  toggleSceneReaction
} from "@/lib/scene-reaction-service";
import type { PrismaClient } from "@prisma/client";

test("scene visitor keeps a valid anonymous UUID and replaces invalid values", () => {
  const valid = "550e8400-e29b-41d4-a716-446655440000";
  assert.equal(normalizeSceneVisitorId(valid), valid);
  assert.match(normalizeSceneVisitorId("release-1"), /^[0-9a-f-]{36}$/u);
});

test("scene reactions only allow known public reaction types", () => {
  assert.equal(isSceneReaction("playlist"), true);
  assert.equal(isSceneReaction("hit"), true);
  assert.equal(isSceneReaction("cover"), true);
  assert.equal(isSceneReaction("admin"), false);
});

test("scene IP fingerprint is salted and never stores the raw address", () => {
  const previous = process.env.SCENE_REACTION_SECRET;
  process.env.SCENE_REACTION_SECRET = "test-secret";
  try {
    const hash = hashSceneVisitorIp("203.0.113.10");
    assert.equal(hash?.length, 64);
    assert.notEqual(hash, "203.0.113.10");
    assert.equal(hashSceneVisitorIp("203.0.113.10"), hash);
  } finally {
    if (previous === undefined) delete process.env.SCENE_REACTION_SECRET;
    else process.env.SCENE_REACTION_SECRET = previous;
  }
});

function createReactionPrisma(existingId: string | null = null) {
  const calls: string[] = [];
  const tx = {
    scene_release_reactions: {
      findUnique: async () => existingId ? { id: existingId } : null,
      delete: async () => { calls.push("delete"); },
      deleteMany: async (args: { where: { reaction: { in: string[] } } }) => {
        calls.push(`deleteMany:${args.where.reaction.in.join(",")}`);
      },
      create: async (args: { data: { reaction: string } }) => {
        calls.push(`create:${args.data.reaction}`);
      }
    }
  };
  const prisma = {
    release: {
      findUnique: async () => ({
        id: "550e8400-e29b-41d4-a716-446655440001",
        status: "moderating",
        confirmed: true,
        upc: "5063635044004",
        date: new Date(),
        roles: {
          lifecycleState: "approved",
          sceneShowcase: {
            enabled: true,
            previewAsset: { storageKey: "scene/preview.mp3" }
          }
        }
      })
    },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
  };
  return { prisma: prisma as unknown as PrismaClient, calls };
}

test("choosing hit replaces an existing playlist vote", async () => {
  const { prisma, calls } = createReactionPrisma();
  const result = await toggleSceneReaction({
    prisma,
    releaseId: "550e8400-e29b-41d4-a716-446655440001",
    visitorId: "550e8400-e29b-41d4-a716-446655440000",
    reaction: "hit",
    ipHash: null
  });

  assert.deepEqual(calls, ["deleteMany:playlist", "create:hit"]);
  assert.deepEqual(result, { active: true });
});

test("clicking the selected reaction removes it without creating another vote", async () => {
  const { prisma, calls } = createReactionPrisma("550e8400-e29b-41d4-a716-446655440002");
  const result = await toggleSceneReaction({
    prisma,
    releaseId: "550e8400-e29b-41d4-a716-446655440001",
    visitorId: "550e8400-e29b-41d4-a716-446655440000",
    reaction: "playlist",
    ipHash: null
  });

  assert.deepEqual(calls, ["delete"]);
  assert.deepEqual(result, { active: false });
});

test("reaction summary exposes separate weekly and today's activity", async () => {
  let groupByCall = 0;
  const prisma = {
    scene_release_reactions: {
      groupBy: async () => {
        groupByCall += 1;
        if (groupByCall === 1) {
          return [{ release_id: "release-1", reaction: "playlist", _count: { _all: 12 } }];
        }
        if (groupByCall === 2) return [{ release_id: "release-1", _count: { _all: 7 } }];
        return [{ release_id: "release-1", _count: { _all: 3 } }];
      },
      findMany: async (args: { distinct?: string[] }) => args.distinct
        ? [
            { release_id: "release-1", visitor_id: "visitor-1" },
            { release_id: "release-1", visitor_id: "visitor-2" }
          ]
        : [{ release_id: "release-1", reaction: "playlist" }]
    }
  } as unknown as PrismaClient;

  const summaries = await getSceneReactionSummaries({
    prisma,
    releaseIds: ["release-1"],
    visitorId: "550e8400-e29b-41d4-a716-446655440000",
    now: new Date("2026-07-18T10:00:00.000Z")
  });

  assert.deepEqual(summaries["release-1"], {
    counts: { playlist: 12, hit: 0, cover: 0 },
    active: ["playlist"],
    weeklyScore: 7,
    weeklyUniqueListeners: 2,
    todayPlaylistCount: 3
  });
});
