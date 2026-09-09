import assert from "node:assert/strict";
import test from "node:test";

import {
  listSocialFeedPreferences,
  setSocialFeedPreference,
  SocialFeedPreferenceSelfActionError,
  socialFeedPreferenceInputSchema
} from "@/lib/social-feed-preference-service";

test("feed preference input only accepts coherent hide and mute targets", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(socialFeedPreferenceInputSchema.safeParse({ action: "hide", targetType: "post", targetId: id }).success, true);
  assert.equal(socialFeedPreferenceInputSchema.safeParse({ action: "hide", targetType: "release", targetId: id }).success, true);
  assert.equal(socialFeedPreferenceInputSchema.safeParse({ action: "mute", targetType: "user", targetId: id }).success, true);
  assert.equal(socialFeedPreferenceInputSchema.safeParse({ action: "mute", targetType: "post", targetId: id }).success, false);
});

test("a viewer cannot mute their own account", async () => {
  const viewerUserId = "11111111-1111-4111-8111-111111111111";
  const prisma = {} as never;
  await assert.rejects(
    () => setSocialFeedPreference(prisma, viewerUserId, { action: "mute", targetType: "user", targetId: viewerUserId }),
    SocialFeedPreferenceSelfActionError
  );
});

test("feed preferences persist idempotently and return separated filters", async () => {
  const calls: unknown[] = [];
  const prisma = {
    social_feed_preferences: {
      upsert: async (args: unknown) => { calls.push(args); return { id: "preference-1" }; },
      findMany: async () => [
        { action: "hide", target_type: "post", target_id: "post-1" },
        { action: "hide", target_type: "release", target_id: "release-1" },
        { action: "mute", target_type: "user", target_id: "user-2" }
      ]
    },
    user: { findUnique: async () => ({ id: "user-2" }) },
    artist_profile_posts: { findUnique: async () => ({ id: "post-1" }) },
    release: { findUnique: async () => ({ id: "release-1" }) }
  } as never;

  const targetId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(await setSocialFeedPreference(prisma, "viewer-1", {
    action: "hide",
    targetType: "post",
    targetId
  }), { active: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(await listSocialFeedPreferences(prisma, "viewer-1"), {
    hiddenPostIds: ["post-1"],
    hiddenReleaseIds: ["release-1"],
    mutedUserIds: ["user-2"]
  });
});

test("missing feed preferences table returns empty filters", async () => {
  const prisma = {
    social_feed_preferences: {
      findMany: async () => {
        throw new Error("The table `icecream.social_feed_preferences` does not exist in the current database.");
      }
    }
  } as never;

  assert.deepEqual(await listSocialFeedPreferences(prisma, "viewer-1"), {
    hiddenPostIds: [],
    hiddenReleaseIds: [],
    mutedUserIds: []
  });
});

test("feed preferences pool timeout returns empty filters", async () => {
  const prisma = {
    social_feed_preferences: {
      findMany: async () => {
        const error = new Error("Timed out fetching a new connection from the connection pool.");
        Object.assign(error, { code: "P2024" });
        throw error;
      }
    }
  } as never;

  assert.deepEqual(await listSocialFeedPreferences(prisma, "viewer-1"), {
    hiddenPostIds: [],
    hiddenReleaseIds: [],
    mutedUserIds: []
  });
});
