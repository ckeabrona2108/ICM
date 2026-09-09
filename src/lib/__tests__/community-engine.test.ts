import assert from "node:assert/strict";
import test from "node:test";

import { buildCommunityDiscovery, createUnavailableCommunityDiscovery } from "@/lib/community-engine";
import type { FeedPostItem, FeedReleaseItem } from "@/lib/feed-contract";

function makePost(params: {
  id: string;
  authorId: string;
  publishedAt: string;
  content?: string;
  collaboration?: FeedPostItem["collaboration"];
}): FeedPostItem {
  return {
    id: `post_${params.id}`,
    sourceId: params.id,
    kind: "post",
    publishedAt: params.publishedAt,
    permalink: `/feed/post_${params.id}`,
    author: {
      id: params.authorId,
      slug: params.id,
      displayName: params.id,
      avatarUrl: null,
      profileType: "artist",
      verified: true,
      followingByViewer: false,
      ownedByViewer: false
    },
    likesCount: 0,
    commentsCount: 0,
    likedByViewer: false,
    viewerReaction: null,
    reactionSummary: { total: 0, counts: { heart: 0, fire: 0, laugh: 0, wow: 0, sad: 0, thumbs: 0, party: 0, diamond: 0 }, viewerReaction: null },
    postType: params.collaboration ? "collaboration" : "standard",
    content: params.content ?? params.id,
    updatedAt: params.publishedAt,
    editedAt: null,
    mediaType: null,
    mediaUrl: null,
    mediaName: null,
    mediaItems: [],
    comments: [],
    responsesCount: 0,
    linkedRelease: null,
    collaboration: params.collaboration ?? null
  };
}

function makeRelease(params: { id: string; authorId: string; publishedAt: string }): FeedReleaseItem {
  return {
    id: `release_${params.id}`,
    sourceId: params.id,
    kind: "release",
    publishedAt: params.publishedAt,
    permalink: `/feed/release_${params.id}`,
    author: {
      id: params.authorId,
      slug: params.id,
      displayName: params.id,
      avatarUrl: null,
      profileType: "artist",
      verified: true,
      followingByViewer: false,
      ownedByViewer: false
    },
    likesCount: 0,
    commentsCount: 0,
    likedByViewer: false,
    viewerReaction: null,
    reactionSummary: { total: 0, counts: { heart: 0, fire: 0, laugh: 0, wow: 0, sad: 0, thumbs: 0, party: 0, diamond: 0 }, viewerReaction: null },
    releaseId: params.id,
    title: params.id,
    coverUrl: "/cover.jpg",
    audioUrl: "/audio.mp3",
    playCount: 0,
    comments: [],
    sceneHref: `/feed/release_${params.id}`
  };
}

test("community engine ranks live, trending, releases, collaborations and post of week from real signals", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const livePost = makePost({ id: "post-live", authorId: "author-a", publishedAt: "2026-08-03T11:20:00.000Z", content: "live" });
  const popularPost = makePost({ id: "post-popular", authorId: "author-b", publishedAt: "2026-08-02T15:00:00.000Z", content: "popular" });
  const collabPost = makePost({
    id: "post-collab",
    authorId: "author-c",
    publishedAt: "2026-08-03T09:00:00.000Z",
    content: "need producer",
    collaboration: {
      intent: "find_producer",
      role: "artist",
      status: "open",
      workflow: "seeking",
      customIntentLabel: "",
      genres: ["hyperpop", "drill"],
      preference: "remote",
      city: "",
      bio: "demo",
      label: "Ищу продюсера",
      rawIntent: "find_producer",
      intentCategory: "LOOKING_FOR_PERSON",
      displayIntent: "Ищу продюсера",
      rawRole: "artist",
      displayRole: "Артист"
    }
  });
  const release = makeRelease({ id: "release-new", authorId: "author-d", publishedAt: "2026-08-03T08:00:00.000Z" });

  const discovery = buildCommunityDiscovery({
    now,
    items: [livePost, popularPost, collabPost, release],
    signals: {
      postReactions: [
        { postId: "post-live", visitorId: "listener-1", createdAt: new Date("2026-08-03T11:35:00.000Z") },
        { postId: "post-live", visitorId: "listener-2", createdAt: new Date("2026-08-03T11:38:00.000Z") },
        { postId: "post-popular", visitorId: "listener-3", createdAt: new Date("2026-08-03T10:20:00.000Z") },
        { postId: "post-popular", visitorId: "listener-4", createdAt: new Date("2026-08-03T10:40:00.000Z") },
        { postId: "post-popular", visitorId: "listener-5", createdAt: new Date("2026-08-02T19:00:00.000Z") },
        { postId: "post-collab", visitorId: "producer-1", createdAt: new Date("2026-08-03T09:30:00.000Z") }
      ],
      postComments: [
        { postId: "post-live", userId: "listener-2", parentId: null, createdAt: new Date("2026-08-03T11:40:00.000Z"), deletedAt: null },
        { postId: "post-live", userId: "listener-3", parentId: "root-1", createdAt: new Date("2026-08-03T11:44:00.000Z"), deletedAt: null },
        { postId: "post-popular", userId: "listener-4", parentId: null, createdAt: new Date("2026-08-03T10:45:00.000Z"), deletedAt: null },
        { postId: "post-popular", userId: "listener-5", parentId: null, createdAt: new Date("2026-08-03T10:50:00.000Z"), deletedAt: null },
        { postId: "post-popular", userId: "listener-6", parentId: "root-2", createdAt: new Date("2026-08-03T10:55:00.000Z"), deletedAt: null },
        { postId: "post-collab", userId: "producer-2", parentId: null, createdAt: new Date("2026-08-03T09:45:00.000Z"), deletedAt: null }
      ],
      releaseReactions: [
        { releaseId: "release-new", visitorId: "listener-7", createdAt: new Date("2026-08-03T09:10:00.000Z") }
      ],
      releaseComments: [
        { releaseId: "release-new", userId: "listener-8", parentId: null, createdAt: new Date("2026-08-03T09:20:00.000Z"), deletedAt: null }
      ],
      releasePlays: [
        { releaseId: "release-new", visitorId: "listener-7", createdAt: new Date("2026-08-03T09:30:00.000Z") },
        { releaseId: "release-new", visitorId: "listener-8", createdAt: new Date("2026-08-03T09:35:00.000Z") },
        { releaseId: "release-new", visitorId: "listener-9", createdAt: new Date("2026-08-03T09:40:00.000Z") }
      ]
    }
  });

  assert.equal(discovery.live[0]?.item.sourceId, "post-live");
  assert.equal(discovery.trending.some((entry) => entry.item.sourceId === "post-popular"), true);
  assert.equal(discovery.popular[0]?.item.sourceId, "post-popular");
  assert.equal(discovery.collaborations[0]?.item.sourceId, "post-collab");
  assert.equal(discovery.releases[0]?.item.releaseId, "release-new");
  assert.equal(discovery.releaseWindow, "today");
  assert.equal(discovery.postOfWeek?.item.sourceId, "post-popular");
  assert.equal(discovery.summary.publicPostsToday, 2);
  assert.equal(discovery.summary.releasesToday, 1);
  assert.equal(discovery.summary.collaborationsToday, 1);
});

test("community engine does not assign post of week below threshold", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const smallPost = makePost({ id: "small-post", authorId: "author-a", publishedAt: "2026-08-03T10:00:00.000Z" });

  const discovery = buildCommunityDiscovery({
    now,
    items: [smallPost],
    signals: {
      postReactions: [{ postId: "small-post", visitorId: "listener-1", createdAt: new Date("2026-08-03T10:10:00.000Z") }],
      postComments: [],
      releaseReactions: [],
      releaseComments: [],
      releasePlays: []
    }
  });

  assert.equal(discovery.postOfWeek, null);
});

test("community engine falls back to recent releases when last 24 hours are empty", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const oldRelease = makeRelease({ id: "release-old", authorId: "author-z", publishedAt: "2026-07-28T10:00:00.000Z" });

  const discovery = buildCommunityDiscovery({
    now,
    items: [oldRelease],
    signals: {
      postReactions: [],
      postComments: [],
      releaseReactions: [],
      releaseComments: [],
      releasePlays: [{ releaseId: "release-old", visitorId: "listener-1", createdAt: new Date("2026-08-02T11:00:00.000Z") }]
    }
  });

  assert.equal(discovery.releaseWindow, "recent");
  assert.equal(discovery.releases[0]?.item.releaseId, "release-old");
});

test("community engine ignores self-engagement and requires real external participation", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const selfOnly = makePost({ id: "self-only", authorId: "author-a", publishedAt: "2026-08-03T11:00:00.000Z" });
  const external = makePost({ id: "external", authorId: "author-b", publishedAt: "2026-08-03T11:00:00.000Z" });

  const discovery = buildCommunityDiscovery({
    now,
    items: [selfOnly, external],
    signals: {
      postReactions: [
        { postId: "self-only", visitorId: "author-a", createdAt: new Date("2026-08-03T11:20:00.000Z") },
        { postId: "external", visitorId: "listener-1", createdAt: new Date("2026-08-03T11:20:00.000Z") },
        { postId: "external", visitorId: "listener-2", createdAt: new Date("2026-08-03T11:22:00.000Z") }
      ],
      postComments: [
        { postId: "self-only", userId: "author-a", parentId: null, createdAt: new Date("2026-08-03T11:24:00.000Z"), deletedAt: null },
        { postId: "external", userId: "listener-2", parentId: null, createdAt: new Date("2026-08-03T11:24:00.000Z"), deletedAt: null }
      ],
      releaseReactions: [],
      releaseComments: [],
      releasePlays: []
    }
  });

  assert.equal(discovery.live.some((entry) => entry.item.sourceId === "self-only"), false);
  assert.equal(discovery.live[0]?.item.sourceId, "external");
  assert.equal(discovery.popular.some((entry) => entry.item.sourceId === "self-only"), false);
});

test("community engine uses stable ties and keeps deterministic popular ordering", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const alpha = makePost({ id: "alpha", authorId: "author-a", publishedAt: "2026-08-03T10:00:00.000Z" });
  const beta = makePost({ id: "beta", authorId: "author-b", publishedAt: "2026-08-03T10:00:00.000Z" });

  const discovery = buildCommunityDiscovery({
    now,
    items: [beta, alpha],
    signals: {
      postReactions: [
        { postId: "alpha", visitorId: "listener-1", createdAt: new Date("2026-08-03T10:10:00.000Z") },
        { postId: "beta", visitorId: "listener-1", createdAt: new Date("2026-08-03T10:10:00.000Z") }
      ],
      postComments: [
        { postId: "alpha", userId: "listener-2", parentId: null, createdAt: new Date("2026-08-03T10:15:00.000Z"), deletedAt: null },
        { postId: "beta", userId: "listener-2", parentId: null, createdAt: new Date("2026-08-03T10:15:00.000Z"), deletedAt: null }
      ],
      releaseReactions: [],
      releaseComments: [],
      releasePlays: []
    }
  });

  assert.deepEqual(discovery.popular.map((entry) => entry.item.sourceId), ["alpha", "beta"]);
});

test("community engine marks unavailable separately from an honest empty result", () => {
  const unavailable = createUnavailableCommunityDiscovery();
  const empty = buildCommunityDiscovery({
    now: new Date("2026-08-03T12:00:00.000Z"),
    items: [],
    signals: {
      postReactions: [],
      postComments: [],
      releaseReactions: [],
      releaseComments: [],
      releasePlays: []
    }
  });

  assert.equal(unavailable.status, "unavailable");
  assert.equal(empty.status, "ready");
  assert.deepEqual(empty.live, []);
});

test("community engine requires velocity for trending and does not promote stale popular posts", () => {
  const now = new Date("2026-08-03T12:00:00.000Z");
  const stalePopular = makePost({ id: "stale-popular", authorId: "author-a", publishedAt: "2026-08-02T09:00:00.000Z" });
  const surging = makePost({ id: "surging", authorId: "author-b", publishedAt: "2026-08-03T08:00:00.000Z" });

  const discovery = buildCommunityDiscovery({
    now,
    items: [stalePopular, surging],
    signals: {
      postReactions: [
        { postId: "stale-popular", visitorId: "listener-1", createdAt: new Date("2026-08-03T01:00:00.000Z") },
        { postId: "stale-popular", visitorId: "listener-2", createdAt: new Date("2026-08-03T01:05:00.000Z") },
        { postId: "stale-popular", visitorId: "listener-3", createdAt: new Date("2026-08-03T07:30:00.000Z") },
        { postId: "surging", visitorId: "listener-4", createdAt: new Date("2026-08-03T11:10:00.000Z") },
        { postId: "surging", visitorId: "listener-5", createdAt: new Date("2026-08-03T11:15:00.000Z") },
        { postId: "surging", visitorId: "listener-6", createdAt: new Date("2026-08-03T11:20:00.000Z") }
      ],
      postComments: [
        { postId: "stale-popular", userId: "listener-7", parentId: null, createdAt: new Date("2026-08-03T01:10:00.000Z"), deletedAt: null },
        { postId: "surging", userId: "listener-8", parentId: null, createdAt: new Date("2026-08-03T11:25:00.000Z"), deletedAt: null },
        { postId: "surging", userId: "listener-9", parentId: "root-1", createdAt: new Date("2026-08-03T11:28:00.000Z"), deletedAt: null }
      ],
      releaseReactions: [],
      releaseComments: [],
      releasePlays: []
    }
  });

  assert.equal(discovery.popular.some((entry) => entry.item.sourceId === "stale-popular"), true);
  assert.equal(discovery.trending.some((entry) => entry.item.sourceId === "stale-popular"), false);
  assert.equal(discovery.trending[0]?.item.sourceId, "surging");
});
