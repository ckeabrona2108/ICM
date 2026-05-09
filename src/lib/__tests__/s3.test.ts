import assert from "node:assert/strict";
import test from "node:test";

import { createPresignedDownload, createPresignedUpload } from "@/lib/s3";

test("createPresignedUpload falls back to local object storage when S3 is not configured", async () => {
  const result = await createPresignedUpload({
    key: "uploads/user_1/release-cover.jpg",
    contentType: "image/jpeg"
  });

  assert.equal(result.method, "PUT");
  assert.equal(result.mock, false);
  assert.match(result.url, /^\/api\/uploads\/object\/uploads\/user_1\/release-cover\.jpg$/);
});

test("createPresignedDownload falls back to local object storage when S3 is not configured", async () => {
  const result = await createPresignedDownload({
    key: "uploads/user_1/release-cover.jpg",
    responseContentDisposition: 'attachment; filename="release-cover.jpg"',
    responseContentType: "image/jpeg"
  });

  assert.equal(result.mock, false);
  assert.match(result.url, /^\/api\/uploads\/object\/uploads\/user_1\/release-cover\.jpg\?/);
  assert.match(result.url, /contentDisposition=/);
  assert.match(result.url, /contentType=image%2Fjpeg/);
});
