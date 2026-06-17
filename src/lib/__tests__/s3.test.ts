import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
  buildLegacyImageCandidateUrls,
  classifyStorageProbe,
  createPresignedDownload,
  createPresignedUpload,
  getBaseNameWithoutExtension,
  isAllowedMediaExtension,
  isAllowedAudioFile,
  isAllowedImageFile,
  isAllowedMediaFile,
  isAllowedS3Prefix,
  resolveFirstReachableStoredFileCandidateFromCandidates,
  resolveRenderableStoredFileUrl,
  resolveStoredFileUrl
} from "@/lib/s3";

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


test("buildLegacyImageCandidateUrls prefers storageKey over transient url", () => {
  const candidates = buildLegacyImageCandidateUrls({
    url: "https://temporary.example.com/presigned?X-Amz-Signature=expired",
    storageKey: "uploads/user_1/release-cover.jpg"
  });

  assert.equal(candidates[0], "/api/uploads/object/uploads/user_1/release-cover.jpg");
});


test("resolve stored urls normalize storage-host and preview routes to the local object path", () => {
  assert.equal(
    resolveStoredFileUrl({ url: "https://s3.icecreammusic.net/contracts/previews/bd668e33-4b28-4dbb-bf5e-272718687f5f.png", storageKey: null }),
    "/api/uploads/object/previews/bd668e33-4b28-4dbb-bf5e-272718687f5f.png"
  );
  assert.equal(
    resolveRenderableStoredFileUrl({ url: "/api/storage/preview?key=uploads%2Flegacy-cover.png&contentType=image%2Fpng", storageKey: null }),
    "/api/uploads/object/uploads/legacy-cover.png"
  );
});

test("resolve stored urls normalize public root storage urls to the local object path", () => {
  assert.equal(
    resolveStoredFileUrl({ url: "https://s3.icecreammusic.net/previews/8eba6bc5-54fb-4a66-92ad-6f7593c555e6.JPEG", storageKey: null }),
    "/api/uploads/object/previews/8eba6bc5-54fb-4a66-92ad-6f7593c555e6.JPEG"
  );
  assert.equal(
    resolveRenderableStoredFileUrl({ url: "https://s3.icecreammusic.net/tracks/7ce2c9f2-52a3-46a2-93ab-7f5fe80d844a.wav", storageKey: null }),
    "/api/uploads/object/tracks/7ce2c9f2-52a3-46a2-93ab-7f5fe80d844a.wav"
  );
  assert.equal(
    resolveRenderableStoredFileUrl({ url: "https://s3.icecreammusic.net/uploads/7a6c02e3-351f-4516-942d-dbeda82ba3ed/1781597413132-_-1.wav", storageKey: null }),
    "/api/uploads/object/uploads/7a6c02e3-351f-4516-942d-dbeda82ba3ed/1781597413132-_-1.wav"
  );
  assert.equal(
    resolveRenderableStoredFileUrl({ url: "https://s3.icecreammusic.net/covers/7a6c02e3-351f-4516-942d-dbeda82ba3ed/release-cover.png", storageKey: null }),
    "/api/uploads/object/covers/7a6c02e3-351f-4516-942d-dbeda82ba3ed/release-cover.png"
  );
});

test("allowed S3 helpers accept configured prefixes and case-insensitive media extensions", () => {
  assert.equal(isAllowedS3Prefix("contracts/covers/release-cover.WEBP"), true);
  assert.equal(isAllowedS3Prefix("tracks/track-1.wav"), false);
  assert.equal(isAllowedImageFile("contracts/previews/release-cover.JPEG"), true);
  assert.equal(isAllowedImageFile("contracts/previews/release-cover.gif"), false);
  assert.equal(isAllowedAudioFile("contracts/uploads/track-1.WAV"), true);
  assert.equal(isAllowedAudioFile("contracts/uploads/track-1.mp3"), false);
  assert.equal(isAllowedMediaFile("covers/release-cover.PNG"), true);
  assert.equal(isAllowedMediaFile("uploads/track-1.txt"), false);
});

test("media extension and basename helpers normalize nested keys", () => {
  assert.equal(
    getBaseNameWithoutExtension("contracts/covers/e2014753-3abd-484b-acef-637fc8564235.webp"),
    "e2014753-3abd-484b-acef-637fc8564235"
  );
  assert.equal(
    getBaseNameWithoutExtension("previews/b927ca71-133f-4df0-a7d7-69ae3ced92bd/1780941267894-release-cover.jpg"),
    "1780941267894-release-cover"
  );
  assert.equal(isAllowedMediaExtension("contracts/uploads/track-1.WAV"), true);
  assert.equal(isAllowedMediaExtension("contracts/uploads/track-1.mp3"), false);
});

test("classifyStorageProbe treats 403 as access denied unless head proves missing", () => {
  assert.equal(
    classifyStorageProbe({
      publicHttpStatus: 403,
      sdkHeadExists: null,
      appRouteHttpStatus: 403,
      hasStorageKey: true
    }),
    "access_denied"
  );

  assert.equal(
    classifyStorageProbe({
      publicHttpStatus: 403,
      sdkHeadExists: false,
      appRouteHttpStatus: 404,
      hasStorageKey: true
    }),
    "missing_file"
  );
});

test("strict stored-file candidate resolver skips broken storage urls and keeps searching", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("missing.jpg")) {
      return new Response("", { status: 404 });
    }
    if (url.includes("next.jpg")) {
      return new Response("", { status: 200 });
    }
    return new Response("", { status: 404 });
  });

  try {
    const result = await resolveFirstReachableStoredFileCandidateFromCandidates([
      "https://s3.icecreammusic.net/previews/missing.jpg",
      "https://cdn.example/next.jpg"
    ]);

    assert.equal(result.url, "https://cdn.example/next.jpg");
    assert.equal(result.failedReason, null);
  } finally {
    fetchMock.mock.restore();
  }
});

test("strict stored-file candidate resolver does not fall back to a broken storage url", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("", { status: 404 }));

  try {
    const result = await resolveFirstReachableStoredFileCandidateFromCandidates([
      "https://s3.icecreammusic.net/previews/missing-again.jpg"
    ]);

    assert.equal(result.url, null);
    assert.match(result.failedReason ?? "", /not-reachable|no-reachable-candidates|not-found/);
  } finally {
    fetchMock.mock.restore();
  }
});
