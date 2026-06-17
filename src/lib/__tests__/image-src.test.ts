import assert from "node:assert/strict";
import test from "node:test";

import { buildCoverImageSrcCandidates, normalizeNextImageSrc } from "@/lib/image-src";

test("terminal release image routes are not expanded into legacy guesses", () => {
  const src = "/api/uploads/object/uploads/user_1/release-cover.png";
  const candidates = buildCoverImageSrcCandidates(src);

  assert.deepEqual(candidates, [src]);
  assert.equal(normalizeNextImageSrc(src), src);
});

test("storage preview and admin download routes stay terminal", () => {
  const preview = "/api/storage/preview?key=uploads%2Frelease-cover.png&contentType=image%2Fpng";
  const download = "/api/admin/releases/rel_1/files/cover/download";

  assert.deepEqual(buildCoverImageSrcCandidates(preview), ["/api/uploads/object/uploads/release-cover.png"]);
  assert.deepEqual(buildCoverImageSrcCandidates(download), [download]);
});

test("legacy jpeg variants remain terminal", () => {
  const src = "/api/uploads/object/uploads/user_1/release-cover.jfif";
  const candidates = buildCoverImageSrcCandidates(src);

  assert.deepEqual(candidates, [src]);
  assert.equal(normalizeNextImageSrc(src), src);
});

test("public root storage urls normalize to local object routes", () => {
  const cover = "https://s3.icecreammusic.net/previews/8eba6bc5-54fb-4a66-92ad-6f7593c555e6.JPEG";
  const track = "https://s3.icecreammusic.net/tracks/7ce2c9f2-52a3-46a2-93ab-7f5fe80d844a.wav";
  const uploadCover = "https://s3.icecreammusic.net/uploads/7a6c02e3-351f-4516-942d-dbeda82ba3ed/1781597413132-_-1.wav";

  assert.equal(normalizeNextImageSrc(cover), "/api/uploads/object/previews/8eba6bc5-54fb-4a66-92ad-6f7593c555e6.JPEG");
  assert.equal(buildCoverImageSrcCandidates(track)[0], "/api/uploads/object/tracks/7ce2c9f2-52a3-46a2-93ab-7f5fe80d844a.wav");
  assert.equal(
    normalizeNextImageSrc(uploadCover),
    "/api/uploads/object/uploads/7a6c02e3-351f-4516-942d-dbeda82ba3ed/1781597413132-_-1.wav"
  );
});

test("legacy cover candidates include contracts prefixes", () => {
  const candidates = buildCoverImageSrcCandidates("release-cover.PNG");

  assert.ok(candidates.includes("/api/uploads/object/contracts/previews/release-cover.PNG"));
  assert.ok(candidates.includes("/api/uploads/object/contracts/uploads/release-cover.PNG"));
  assert.ok(candidates.includes("/api/uploads/object/contracts/covers/release-cover.PNG"));
});
