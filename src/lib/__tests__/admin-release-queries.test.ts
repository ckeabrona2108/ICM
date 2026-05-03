import assert from "node:assert/strict";
import test from "node:test";

import { resolveAdminReleaseCoverUrl } from "@/lib/admin-release-queries";

test("resolveAdminReleaseCoverUrl prefers latest submission cover", () => {
  const coverUrl = resolveAdminReleaseCoverUrl({
    sourceCoverUrl: "https://example.com/old-cover.jpg",
    submissionCover: "data:image/png;base64,NEW"
  });
  assert.equal(coverUrl, "data:image/png;base64,NEW");
});

test("resolveAdminReleaseCoverUrl falls back to stored cover and default", () => {
  const stored = resolveAdminReleaseCoverUrl({
    sourceCoverUrl: "https://example.com/cover.jpg",
    submissionCover: ""
  });
  const fallback = resolveAdminReleaseCoverUrl({
    sourceCoverUrl: "",
    submissionCover: ""
  });

  assert.equal(stored, "https://example.com/cover.jpg");
  assert.equal(fallback, "/hero/drop.png");
});
