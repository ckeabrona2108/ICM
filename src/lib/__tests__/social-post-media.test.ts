import assert from "node:assert/strict";
import test from "node:test";

import { isOwnedArtistSocialMediaKey, normalizeSocialPostMediaItems } from "@/lib/social-post-media";

test("social media keys are scoped to the authenticated owner", () => {
  assert.equal(isOwnedArtistSocialMediaKey("user-1", "artist-social/user-1/file.webp"), true);
  assert.equal(isOwnedArtistSocialMediaKey("user-1", "artist-social/user-2/file.webp"), false);
  assert.equal(isOwnedArtistSocialMediaKey("user-1", "artist-social/user-1/../user-2/file.webp"), false);
  assert.equal(isOwnedArtistSocialMediaKey("user-1", "artist-social/user-1/"), false);
});

test("preserves every structured social post media item in source order", () => {
  const items = normalizeSocialPostMediaItems({
    mediaItems: [
      { id: "image-1", mediaType: "image", mediaUrl: "/image-1.jpg", mediaName: "image-1.jpg", role: "standard" },
      { id: "video-1", mediaType: "video", mediaUrl: "/video-1.mp4", mediaName: "video-1.mp4", role: "standard" },
      { id: "audio-1", mediaType: "audio", mediaUrl: "/audio-1.mp3", mediaName: "audio-1.mp3", role: "demo" }
    ],
    mediaType: "image",
    mediaUrl: "/legacy.jpg",
    mediaName: "legacy.jpg"
  });

  assert.deepEqual(items.map((item) => item.id), ["image-1", "video-1", "audio-1"]);
});

test("falls back to the legacy single attachment contract", () => {
  assert.deepEqual(normalizeSocialPostMediaItems({
    mediaItems: [],
    mediaType: "audio",
    mediaUrl: "/legacy.mp3",
    mediaName: "legacy.mp3"
  }), [{
    id: "/legacy.mp3",
    mediaType: "audio",
    mediaUrl: "/legacy.mp3",
    mediaName: "legacy.mp3",
    role: "standard",
    width: null,
    height: null,
    posterUrl: null
  }]);
});

test("drops media records that cannot be rendered", () => {
  assert.deepEqual(normalizeSocialPostMediaItems({
    mediaItems: [
      { id: "missing", mediaType: "image", mediaUrl: "", mediaName: null, role: "standard" }
    ],
    mediaType: null,
    mediaUrl: null,
    mediaName: null
  }), []);
});
