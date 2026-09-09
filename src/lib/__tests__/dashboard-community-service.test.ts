import assert from "node:assert/strict";
import test from "node:test";

import {
  collectOwnedCommunitySeedSlugs,
  getDashboardCommunityPayload,
  isMissingCommunityCommentReactionTable,
  isMissingPostAudienceColumn,
  listRecentCommunityFeedSeedSlugs,
  loadCommunityPosts,
  loadCommunityPostCommentsWithFallback,
  loadCommunityReleaseCommentsWithFallback
} from "@/lib/dashboard-community-service";
import { buildPersonalProfileSlug } from "@/lib/artist-profile-shared";

test("community comment reaction fallback detects missing legacy likes tables", () => {
  assert.equal(
    isMissingCommunityCommentReactionTable(
      new Error("The table `icecream.scene_release_comment_likes` does not exist in the current database.")
    ),
    true
  );
  assert.equal(
    isMissingCommunityCommentReactionTable(
      new Error("The table `icecream.artist_profile_post_comment_likes` does not exist in the current database.")
    ),
    true
  );
  assert.equal(
    isMissingCommunityCommentReactionTable(
      new Error("The table `icecream.some_other_table` does not exist in the current database.")
    ),
    false
  );
});

test("community audience fallback detects missing legacy post audience column", () => {
  assert.equal(
    isMissingPostAudienceColumn(
      new Error("The column `artist_profile_posts.audience` does not exist in the current database.")
    ),
    true
  );
  assert.equal(
    isMissingPostAudienceColumn(
      new Error("The column `j1.audience` does not exist in the current database.")
    ),
    true
  );
  assert.equal(
    isMissingPostAudienceColumn(
      new Error("The column `artist_profile_posts.release_id` does not exist in the current database.")
    ),
    false
  );
});

test("community post comments retry without reactions when legacy comment likes table is missing", async () => {
  let calls = 0;
  const prisma = {
    artist_profile_post_comments: {
      findMany: async ({ select }: { select: Record<string, unknown> }) => {
        calls += 1;
        if (select.reactions) {
          throw new Error("The table `icecream.artist_profile_post_comment_likes` does not exist in the current database.");
        }
        return [{
          id: "comment-1",
          post_id: "post-1",
          user_id: "user-1",
          parent_id: null,
          content: "Legacy post comment",
          created_at: new Date("2026-08-23T16:00:00.000Z"),
          updated_at: null,
          edited_at: null,
          deleted_at: null,
          author: { id: "user-1", name: "User", avatar: null, isVerifiedAuthor: false }
        }];
      }
    }
  } as never;

  const rows = await loadCommunityPostCommentsWithFallback(prisma, {
    postIds: ["post-1"],
    suppressedPeerIds: []
  });

  assert.equal(calls, 2);
  assert.deepEqual(rows[0]?.reactions, []);
  assert.equal(rows[0]?.content, "Legacy post comment");
});

test("community release comments retry without reactions when legacy comment likes table is missing", async () => {
  let calls = 0;
  const prisma = {
    scene_release_comments: {
      findMany: async ({ select }: { select: Record<string, unknown> }) => {
        calls += 1;
        if (select.reactions) {
          throw new Error("The table `icecream.scene_release_comment_likes` does not exist in the current database.");
        }
        return [{
          id: "comment-1",
          release_id: "release-1",
          user_id: "user-1",
          parent_id: null,
          content: "Legacy release comment",
          media_key: null,
          media_name: null,
          created_at: new Date("2026-08-23T16:00:00.000Z"),
          updated_at: null,
          edited_at: null,
          deleted_at: null,
          author: { id: "user-1", name: "User", avatar: null, isVerifiedAuthor: false }
        }];
      }
    }
  } as never;

  const rows = await loadCommunityReleaseCommentsWithFallback(prisma, {
    releaseIds: ["release-1"],
    suppressedPeerIds: []
  });

  assert.equal(calls, 2);
  assert.deepEqual(rows[0]?.reactions, []);
  assert.equal(rows[0]?.content, "Legacy release comment");
});

test("community posts retry without audience when legacy audience column is missing", async () => {
  let calls = 0;
  const prisma = {
    artist_profile_posts: {
      findMany: async ({ select }: { select: Record<string, unknown> }) => {
        calls += 1;
        if (select.audience) {
          throw new Error("The column `artist_profile_posts.audience` does not exist in the current database.");
        }
        return [{
          id: "post-1",
          user_id: "user-1",
          profile_key: "__personal__",
          content: "Legacy post",
          media_type: null,
          media_key: null,
          media_name: null,
          created_at: new Date("2026-08-23T16:00:00.000Z"),
          author: { id: "user-1", name: "User", avatar: null, isVerifiedAuthor: false },
          _count: { likes: 0 }
        }];
      }
    }
  } as never;

  const rows = await loadCommunityPosts(
    prisma,
    [{ user_id: "user-1", profile_key: "__personal__" }],
    { OR: [{ audience: "PUBLIC" }] }
  );

  assert.equal(calls, 2);
  assert.equal(rows[0]?.audience, "PUBLIC");
  assert.equal(rows[0]?.content, "Legacy post");
});

test("community feed always seeds viewer owned public profiles even outside directory limits", () => {
  assert.deepEqual(
    collectOwnedCommunitySeedSlugs([
      {
        slug: "user-owner-1",
        settings: { enabled: true },
        adminHidden: false
      },
      {
        slug: "artist-hidden",
        settings: { enabled: true },
        adminHidden: true
      },
      {
        slug: "artist-disabled",
        settings: { enabled: false },
        adminHidden: false
      }
    ]),
    ["user-owner-1"]
  );
});

test("community payload rethrows pool timeout for critical collaboration feed loads", async () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const name = "Owner";
  const personalSlug = buildPersonalProfileSlug(name, userId);
  const prisma = {
    user: {
      findUnique: async () => ({
        id: userId,
        name,
        avatar: null,
        emailVerified: new Date("2026-08-30T18:00:00.000Z"),
        personalSiteUrl: null,
        vk: null,
        telegram: null,
        artistProfileType: "artist",
        release: []
      })
    },
    artist_profile_posts: {
      findMany: async () => {
        throw new Error("Timed out fetching a new connection from the connection pool.");
      }
    }
  } as never;

  await assert.rejects(
    () => getDashboardCommunityPayload({
      prisma,
      scope: "all",
      filter: "all",
      collaborationFilter: "only",
      seedSlugs: [personalSlug],
      skipDirectoryLoad: true
    }),
    /connection pool/i
  );
});

test("recent feed seed slugs include personal post authors outside directory seed limits", async () => {
  const ownerId = "11111111-1111-4111-8111-111111111111";
  const ownerName = "Олег";
  const ownerSlug = buildPersonalProfileSlug(ownerName, ownerId);
  const prisma = {
    artist_profile_posts: {
      findMany: async () => ([
        {
          user_id: ownerId,
          profile_key: "__personal__",
          author: { name: ownerName }
        }
      ])
    }
  } as never;

  const slugs = await listRecentCommunityFeedSeedSlugs({
    prisma,
    audienceWhere: { OR: [{ audience: "PUBLIC" }] },
    resolveOwnerProfiles: async () => []
  });

  assert.deepEqual(slugs, [ownerSlug]);
});

test("recent feed seed slugs resolve non-personal profile posts through owner settings", async () => {
  const ownerId = "22222222-2222-4222-8222-222222222222";
  const artistKey = "main";
  const prisma = {
    artist_profile_posts: {
      findMany: async () => ([
        {
          user_id: ownerId,
          profile_key: artistKey,
          author: { name: "Ignored for artist profile" }
        }
      ])
    }
  } as never;

  const slugs = await listRecentCommunityFeedSeedSlugs({
    prisma,
    audienceWhere: { OR: [{ audience: "PUBLIC" }] },
    resolveOwnerProfiles: async (userId) => userId === ownerId
      ? [{
          artistKey,
          slug: "artist-owner-main",
          enabled: true,
          adminHidden: false
        }]
      : []
  });

  assert.deepEqual(slugs, ["artist-owner-main"]);
});
