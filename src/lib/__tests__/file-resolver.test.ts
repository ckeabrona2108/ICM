import assert from "node:assert/strict";
import test from "node:test";

import { buildStoredFileRouteUrl, normalizeStoredFileKey } from "@/lib/file-resolver";

test("keeps non-storage external urls as direct renderable urls", () => {
  const url = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&q=80";
  assert.equal(normalizeStoredFileKey(url), null);
  assert.equal(buildStoredFileRouteUrl(url), url);
});

test("still normalizes known storage absolute urls into local object routes", () => {
  const url = "https://s3.icecreammusic.net/uploads/user_1/avatar.jpg";
  assert.equal(normalizeStoredFileKey(url), "uploads/user_1/avatar.jpg");
  assert.equal(buildStoredFileRouteUrl(url), "/api/uploads/object/uploads/user_1/avatar.jpg");
});

test("normalizes localhost object-route urls into storage keys", () => {
  const url = "http://localhost:3001/api/uploads/object/previews/user_1/release-cover.jpg";
  assert.equal(normalizeStoredFileKey(url), "previews/user_1/release-cover.jpg");
  assert.equal(buildStoredFileRouteUrl(url), url);
});
