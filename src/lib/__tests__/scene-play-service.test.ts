import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { recordSceneReleasePlay } from "@/lib/scene-play-service";

function makePrisma(recentPlay: { id: string } | null) {
  let creates = 0;
  let locks = 0;
  const tx = {
    release: {
      findUnique: async () => ({
        id: "550e8400-e29b-41d4-a716-446655440001",
        title: "Release",
        date: new Date("2026-07-18T00:00:00.000Z"),
        status: "moderating",
        confirmed: true,
        roles: {
          lifecycleState: "approved",
          sceneShowcase: {
            enabled: true,
            previewAsset: { storageKey: "scene/release.wav" }
          }
        },
        track: []
      })
    },
    scene_release_plays: {
      findFirst: async () => recentPlay,
      create: async () => {
        creates += 1;
        return { id: "play-id" };
      },
      count: async () => 7
    },
    $executeRaw: async () => {
      locks += 1;
      return 1;
    }
  };
  const prisma = {
    ...tx,
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx)
  } as unknown as PrismaClient;
  return { prisma, getCreates: () => creates, getLocks: () => locks };
}

test("records a public preview play and returns the aggregate count", async () => {
  const { prisma, getCreates, getLocks } = makePrisma(null);
  const result = await recordSceneReleasePlay({
    prisma,
    releaseId: "550e8400-e29b-41d4-a716-446655440001",
    visitorId: "550e8400-e29b-41d4-a716-446655440002",
    ipHash: null,
    now: new Date("2026-07-18T12:00:00.000Z")
  });

  assert.deepEqual(result, { count: 7, counted: true });
  assert.equal(getCreates(), 1);
  assert.equal(getLocks(), 1);
});

test("does not count the same visitor twice inside the deduplication window", async () => {
  const { prisma, getCreates, getLocks } = makePrisma({ id: "recent" });
  const result = await recordSceneReleasePlay({
    prisma,
    releaseId: "550e8400-e29b-41d4-a716-446655440001",
    visitorId: "550e8400-e29b-41d4-a716-446655440002",
    ipHash: null,
    now: new Date("2026-07-18T12:00:00.000Z")
  });

  assert.deepEqual(result, { count: 7, counted: false });
  assert.equal(getCreates(), 0);
  assert.equal(getLocks(), 1);
});

test("counts play when showcase is enabled and first track audio is reachable even without previewAsset", async () => {
  const { prisma, getCreates, getLocks } = makePrisma(null);
  (prisma as any).release.findUnique = async () => ({
    id: "550e8400-e29b-41d4-a716-446655440001",
    title: "Release",
    date: new Date("2026-07-18T00:00:00.000Z"),
    status: "moderating",
    confirmed: true,
    roles: {
      lifecycleState: "approved",
      sceneShowcase: {
        enabled: true,
        previewAsset: null
      },
      submissionData: {
        tracks: [
          {
            id: "track-1",
            audioFile: "uploads/release.wav"
          }
        ]
      }
    },
    track: [
      {
        id: "track-1",
        index: 1,
        title: "Track 1",
        track: null,
        roles: {}
      }
    ]
  });

  const result = await recordSceneReleasePlay({
    prisma,
    releaseId: "550e8400-e29b-41d4-a716-446655440001",
    visitorId: "550e8400-e29b-41d4-a716-446655440002",
    ipHash: null,
    now: new Date("2026-07-18T12:00:00.000Z"),
    resolveTrackAudio: async () => ({
      storageKey: "uploads/release.wav",
      url: "/api/uploads/object/uploads/release.wav",
      downloadUrl: "/api/uploads/object/uploads/release.wav",
      candidateUrls: ["/api/uploads/object/uploads/release.wav"],
      source: "exact"
    })
  });

  assert.deepEqual(result, { count: 7, counted: true });
  assert.equal(getCreates(), 1);
  assert.equal(getLocks(), 1);
});
