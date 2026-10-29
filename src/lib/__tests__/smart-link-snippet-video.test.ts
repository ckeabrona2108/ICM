import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSnippetVideoUrl } from "@/lib/smart-link-service";

const OWNER = "744619c3-ea55-40cd-9c51-506a1c63c0d7";

test("accepts an MP4 from the artist's own uploads folder", () => {
  const url = `/api/uploads/object/uploads/${OWNER}/1793226200724-snippet-story.mp4`;
  assert.equal(normalizeSnippetVideoUrl(url), url);
});

test("rejects external links, other folders and non-MP4 files", () => {
  assert.equal(normalizeSnippetVideoUrl("https://evil.example/video.mp4"), "");
  assert.equal(normalizeSnippetVideoUrl(`/api/uploads/object/private/${OWNER}/clip.mp4`), "");
  assert.equal(normalizeSnippetVideoUrl(`/api/uploads/object/uploads/${OWNER}/cover.png`), "");
  assert.equal(normalizeSnippetVideoUrl(`/api/uploads/object/uploads/${OWNER}/../x.mp4`), "");
  assert.equal(normalizeSnippetVideoUrl(null), "");
});
