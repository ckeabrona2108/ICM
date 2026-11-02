import assert from "node:assert/strict";
import test from "node:test";

import { checkHeaderVideoFile, checkHeaderVideoMetadata, HEADER_VIDEO_MAX_BYTES } from "@/lib/smart-link-header-video";
import { normalizeSnippetVideoUrl } from "@/lib/smart-link-service";

const OWNER = "744619c3-ea55-40cd-9c51-506a1c63c0d7";

test("accepts an MP4 within the size limit", () => {
  assert.equal(checkHeaderVideoFile({ name: "clip.mp4", type: "video/mp4", size: 10_000_000 }), null);
  assert.equal(checkHeaderVideoFile({ name: "CLIP.MP4", type: "", size: 10_000_000 }), null);
});

test("rejects other formats, empty and oversized files", () => {
  assert.notEqual(checkHeaderVideoFile({ name: "clip.mov", type: "video/quicktime", size: 1000 }), null);
  assert.notEqual(checkHeaderVideoFile({ name: "clip.webm", type: "video/webm", size: 1000 }), null);
  assert.notEqual(checkHeaderVideoFile({ name: "clip.mp4", type: "video/quicktime", size: 1000 }), null);
  assert.notEqual(checkHeaderVideoFile({ name: "clip.mp4", type: "video/mp4", size: 0 }), null);
  assert.notEqual(checkHeaderVideoFile({ name: "clip.mp4", type: "video/mp4", size: HEADER_VIDEO_MAX_BYTES + 1 }), null);
});

test("matches the frame shape to the slot", () => {
  const vertical = { duration: 15, width: 1080, height: 1920 };
  const wide = { duration: 15, width: 1920, height: 1080 };
  assert.equal(checkHeaderVideoMetadata("snippetVideoUrl", vertical), null);
  assert.equal(checkHeaderVideoMetadata("snippetVideoWideUrl", wide), null);
  assert.notEqual(checkHeaderVideoMetadata("snippetVideoUrl", wide), null);
  assert.notEqual(checkHeaderVideoMetadata("snippetVideoWideUrl", vertical), null);
  assert.notEqual(checkHeaderVideoMetadata("snippetVideoUrl", { duration: 15, width: 1080, height: 1080 }), null);
  // Slightly off ratios are cropped by the header, so they pass.
  assert.equal(checkHeaderVideoMetadata("snippetVideoUrl", { duration: 15, width: 1080, height: 2000 }), null);
});

test("enforces the length limits and unreadable videos", () => {
  assert.notEqual(checkHeaderVideoMetadata("snippetVideoUrl", { duration: 2, width: 1080, height: 1920 }), null);
  assert.notEqual(checkHeaderVideoMetadata("snippetVideoUrl", { duration: 61, width: 1080, height: 1920 }), null);
  assert.equal(checkHeaderVideoMetadata("snippetVideoUrl", { duration: 60, width: 1080, height: 1920 }), null);
  assert.notEqual(checkHeaderVideoMetadata("snippetVideoUrl", { duration: 15, width: 0, height: 0 }), null);
  assert.notEqual(checkHeaderVideoMetadata("snippetVideoUrl", { duration: Number.NaN, width: 1080, height: 1920 }), null);
});

test("an artist's own upload lands in a path the header accepts", () => {
  // Same key shape /api/uploads/presigned builds: uploads/<userId>/<timestamp>-<file>.
  const url = `/api/uploads/object/uploads/${OWNER}/1793226200724-My_clip_final.mp4`;
  assert.equal(normalizeSnippetVideoUrl(url), url);
});
