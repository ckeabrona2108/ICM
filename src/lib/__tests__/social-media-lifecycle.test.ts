import assert from "node:assert/strict";
import test from "node:test";

import { encodeStructuredPostContent } from "@/lib/collaboration";
import { listUnreferencedSocialMediaKeys } from "@/lib/social-media-lifecycle";

test("shared post and comment media is retained while orphaned media is eligible for cleanup", () => {
  const shared = "artist-social/user/shared.webp";
  const poster = "artist-social/user/poster.webp";
  const orphan = "artist-social/user/orphan.webp";
  assert.deepEqual(listUnreferencedSocialMediaKeys({
    candidateKeys: [shared, poster, orphan, orphan],
    posts: [{
      media_key: null,
      content: encodeStructuredPostContent({
        content: "shared",
        collaboration: null,
        mediaItems: [{ mediaType: "video", mediaKey: shared, mediaName: "shared", role: "standard", posterKey: poster }]
      })
    }],
    comments: [{ media_key: shared }]
  }), [orphan]);
});
