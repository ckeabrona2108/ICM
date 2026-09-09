import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCommunityCoverUrl,
  resolveCommunityTrackAudio,
  sanitizeCommunityAvatarUrl,
  selectDashboardCommunityPage
} from "../dashboard-community-service";

test("community payload never repeats embedded data-uri avatars", () => {
  assert.equal(
    sanitizeCommunityAvatarUrl("data:image/jpeg;base64," + "a".repeat(10_000)),
    "/brand/default-user-avatar.png"
  );
  assert.equal(
    sanitizeCommunityAvatarUrl("/api/uploads/object/data%3Aimage/jpeg%3Bbase64%2Coversized"),
    "/brand/default-user-avatar.png"
  );
  assert.equal(
    sanitizeCommunityAvatarUrl("/api/uploads/object/avatars/user.jpeg"),
    "/api/uploads/object/avatars/user.jpeg"
  );
});

test("community page selection is bounded and exposes a stable continuation cursor", () => {
  const items = Array.from({ length: 25 }, (_, index) => ({
    id: `item-${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 11, 12, 0, 25 - index)).toISOString()
  }));

  const first = selectDashboardCommunityPage(items, { limit: 20, cursor: null });
  assert.equal(first.items.length, 20);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextCursor, "item-19");

  const second = selectDashboardCommunityPage(items, { limit: 20, cursor: first.nextCursor });
  assert.deepEqual(second.items.map((item) => item.id), ["item-20", "item-21", "item-22", "item-23", "item-24"]);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextCursor, null);
});

test("community media resolution is deterministic without storage probes", async () => {
  assert.equal(resolveCommunityCoverUrl({ id: "release-0", preview: "data:image/jpeg;base64,abc" }), null);
  assert.equal(resolveCommunityCoverUrl({ id: "release-1", preview: "png" }), "/api/uploads/object/previews/release-1.png");
  assert.equal(resolveCommunityCoverUrl({ id: "release-2", preview: "covers/custom.webp" }), "/api/uploads/object/covers/custom.webp");

  const audio = await resolveCommunityTrackAudio({ trackId: "track-1", audioFile: "uploads/custom.wav" });
  assert.equal(audio.url, "/api/uploads/object/uploads/custom.wav");
  assert.equal(audio.candidateUrls.includes("/api/uploads/object/tracks/track-1.wav"), true);
});

test("community track resolver preserves non-wav release audio variants", async () => {
  const audio = await resolveCommunityTrackAudio({
    trackId: "track-4",
    track: "mp3"
  });

  assert.equal(audio.url, "/api/uploads/object/tracks/track-4.mp3");
  assert.equal(audio.candidateUrls.includes("/api/uploads/object/tracks/track-4.mp3"), true);
  assert.equal(audio.candidateUrls.includes("/api/uploads/object/uploads/track-4.mp3"), true);
});
