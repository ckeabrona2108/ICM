import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSocialPostAudienceWhere,
  canViewSocialPost,
  normalizeSocialPostAudience
} from "@/lib/social-post-access";

test("social post audience is deny-by-default for non-public values", () => {
  assert.equal(normalizeSocialPostAudience("PUBLIC"), "PUBLIC");
  assert.equal(normalizeSocialPostAudience("FOLLOWERS"), "FOLLOWERS");
  assert.equal(normalizeSocialPostAudience("PRIVATE"), "PRIVATE");
  assert.equal(normalizeSocialPostAudience(undefined), "PUBLIC");
  assert.equal(normalizeSocialPostAudience("unexpected"), "PRIVATE");
  assert.equal(canViewSocialPost({ audience: "PRIVATE", authorUserId: "owner", viewerUserId: "other" }), false);
  assert.equal(canViewSocialPost({ audience: "PRIVATE", authorUserId: "owner", viewerUserId: "owner" }), true);
  assert.equal(canViewSocialPost({ audience: "FOLLOWERS", authorUserId: "owner", viewerUserId: "fan", followsAuthorProfile: true }), true);
  assert.equal(canViewSocialPost({ audience: "FOLLOWERS", authorUserId: "owner", viewerUserId: "fan" }), false);
  assert.equal(canViewSocialPost({ audience: "PUBLIC", authorUserId: "owner" }), true);
});

test("audience query includes public, own, and explicitly followed profile posts only", () => {
  assert.deepEqual(buildSocialPostAudienceWhere({ viewerUserId: null }), { OR: [{ audience: "PUBLIC" }] });
  assert.deepEqual(buildSocialPostAudienceWhere({
    viewerUserId: "viewer",
    followedProfiles: [{ user_id: "artist", profile_key: "main" }]
  }), {
    OR: [
      { audience: "PUBLIC" },
      { user_id: "viewer" },
      { audience: "FOLLOWERS", OR: [{ user_id: "artist", profile_key: "main" }] }
    ]
  });
});
