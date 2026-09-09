import assert from "node:assert/strict";
import test from "node:test";

import type { PublicFeedItem } from "@/lib/feed-contract";
import { splitGlobalSearchFeedItems } from "@/lib/global-search-service";
import { buildReleaseDetailHref } from "@/lib/release-route";

const baseAuthor = {
  id: "user-1",
  slug: "artist-1",
  displayName: "Artist One",
  avatarUrl: null,
  profileType: "artist" as const,
  verified: true,
  followingByViewer: false,
  ownedByViewer: false
};

function releaseItem(id: string, title: string, sceneHref?: string | null): PublicFeedItem {
  return {
    id,
    sourceId: id,
    kind: "release",
    publishedAt: "2026-08-02T00:00:00.000Z",
    permalink: `/feed/${id}`,
    author: baseAuthor,
    likesCount: 0,
    commentsCount: 0,
    likedByViewer: false,
    viewerReaction: null,
    reactionSummary: {
      total: 0,
      viewerReaction: null,
      counts: { heart: 0, fire: 0, laugh: 0, wow: 0, sad: 0, thumbs: 0, party: 0, diamond: 0 }
    },
    releaseId: id,
    title,
    coverUrl: null,
    audioUrl: null,
    playCount: 0,
    comments: [],
    sceneHref: sceneHref ?? null
  };
}

function postItem(id: string, content: string): PublicFeedItem {
  return {
    id,
    sourceId: id,
    kind: "post",
    publishedAt: "2026-08-02T00:00:00.000Z",
    permalink: `/feed/${id}`,
    author: baseAuthor,
    likesCount: 0,
    commentsCount: 0,
    likedByViewer: false,
    viewerReaction: null,
    reactionSummary: {
      total: 0,
      viewerReaction: null,
      counts: { heart: 0, fire: 0, laugh: 0, wow: 0, sad: 0, thumbs: 0, party: 0, diamond: 0 }
    },
    postType: "standard",
    content,
    updatedAt: "2026-08-02T00:00:00.000Z",
    editedAt: null,
    mediaType: null,
    mediaUrl: null,
    mediaName: null,
    mediaItems: [],
    comments: [],
    responsesCount: 0,
    linkedRelease: null,
    collaboration: null
  };
}

test("global search splits releases from publications and keeps canonical release href", () => {
  const result = splitGlobalSearchFeedItems([
    releaseItem("release-1", "Blue Echo"),
    postItem("post-1", "Новая история"),
    releaseItem("release-2", "Signal Bloom", "/feed/release_release-2")
  ], 5);

  assert.deepEqual(result.releases.map((item) => item.id), ["release-1", "release-2"]);
  assert.deepEqual(result.publications.map((item) => item.id), ["post-1"]);
  assert.equal(result.releases[0]?.href, buildReleaseDetailHref("release-1"));
  assert.equal(result.releases[1]?.href, "/feed/release_release-2");
});
