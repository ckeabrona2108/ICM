import assert from "node:assert/strict";
import test from "node:test";

import {
  FeedAuthRequiredError,
  assertFeedScopeAccess,
  shouldIncludePlatformNewsForScope
} from "@/lib/public-feed-service";
import {
  buildCollaborationResponseCountMap,
  expandDashboardCommunityFollowScopeSlugs,
  dedupeDashboardCommunitySlugs,
  resolveDashboardCommunityScope,
  selectDashboardCommunityNewReleases
} from "@/lib/dashboard-community-service";

test("guest following scope requires auth instead of silently falling back to all", () => {
  assert.throws(() => assertFeedScopeAccess("following", null), FeedAuthRequiredError);

  const resolved = resolveDashboardCommunityScope({
    scope: "following",
    viewerAuthenticated: false,
    followedSlugs: ["followed-artist"],
    publicSlugs: ["public-a", "public-b"]
  });

  assert.equal(resolved.scope, "following");
  assert.equal(resolved.requiresAuth, true);
  assert.deepEqual(resolved.slugs, []);
});

test("authenticated following scope returns only subscribed artist slugs", () => {
  assert.doesNotThrow(() => assertFeedScopeAccess("following", "user-1"));

  const resolved = resolveDashboardCommunityScope({
    scope: "following",
    viewerAuthenticated: true,
    followedSlugs: ["followed-a", "followed-b", "followed-a"],
    publicSlugs: ["public-a", "public-b"]
  });

  assert.equal(resolved.scope, "following");
  assert.equal(resolved.requiresAuth, false);
  assert.deepEqual(resolved.slugs, ["followed-a", "followed-b"]);
});

test("empty following scope stays empty and does not mix with public all-scope items", () => {
  const resolved = resolveDashboardCommunityScope({
    scope: "following",
    viewerAuthenticated: true,
    followedSlugs: [],
    publicSlugs: ["public-a", "public-b"]
  });

  assert.equal(resolved.scope, "following");
  assert.equal(resolved.requiresAuth, false);
  assert.deepEqual(resolved.slugs, []);
});

test("invalid session behaves like guest for following scope", () => {
  assert.throws(() => assertFeedScopeAccess("following", ""), FeedAuthRequiredError);
});

test("all scope keeps public artist list untouched", () => {
  const resolved = resolveDashboardCommunityScope({
    scope: "all",
    viewerAuthenticated: false,
    followedSlugs: ["followed-a"],
    publicSlugs: ["public-a", "public-b", "public-a"]
  });

  assert.equal(resolved.scope, "all");
  assert.equal(resolved.requiresAuth, false);
  assert.deepEqual(resolved.slugs, ["public-a", "public-b"]);
});

test("dashboard community slug dedupe keeps the full profile set instead of truncating it", () => {
  const slugs = Array.from({ length: 12 }, (_, index) => `artist-${index + 1}`);
  const deduped = dedupeDashboardCommunitySlugs([...slugs, "artist-3", "artist-7"]);

  assert.equal(deduped.length, 12);
  assert.deepEqual(deduped, slugs);
});

test("following scope expands to every public profile owned by a followed user", () => {
  const expanded = expandDashboardCommunityFollowScopeSlugs({
    followedOwnerIds: ["11111111-1111-4111-8111-111111111111"],
    publicArtistSlugs: [
      "artist-one-11111111111141118111111111111111",
      "artist-two-11111111111141118111111111111111",
      "artist-three-22222222222242228222222222222222"
    ],
    publicPersonalSlugs: [
      "user-owner-11111111111141118111111111111111",
      "user-other-33333333333343338333333333333333"
    ]
  });

  assert.deepEqual(expanded, [
    "artist-one-11111111111141118111111111111111",
    "artist-two-11111111111141118111111111111111",
    "user-owner-11111111111141118111111111111111"
  ]);
});

test("dashboard community new releases keeps the full sorted list", () => {
  const releases = Array.from({ length: 6 }, (_, index) => ({
    id: `release-${index + 1}`,
    createdAt: `2026-08-0${index + 1}T12:00:00.000Z`
  }));

  const selected = selectDashboardCommunityNewReleases(releases);

  assert.equal(selected.length, 6);
  assert.deepEqual(selected.map((item) => item.id), [
    "release-6",
    "release-5",
    "release-4",
    "release-3",
    "release-2",
    "release-1"
  ]);
});

test("collaboration response counts are keyed by post id from groupBy rows", () => {
  const counts = buildCollaborationResponseCountMap([
    { post_id: "post-1", _count: { _all: 2 } },
    { post_id: "post-2", _count: { _all: 1 } }
  ]);

  assert.equal(counts.get("post-1"), 2);
  assert.equal(counts.get("post-2"), 1);
  assert.equal(counts.get("post-3") ?? 0, 0);
});


test("following scope excludes platform news regardless of filter", () => {
  assert.equal(shouldIncludePlatformNewsForScope("following", "all", "all"), false);
  assert.equal(shouldIncludePlatformNewsForScope("following", "news", "all"), false);
  assert.equal(shouldIncludePlatformNewsForScope("all", "news", "all"), true);
  assert.equal(shouldIncludePlatformNewsForScope("all", "news", "only"), false);
});
