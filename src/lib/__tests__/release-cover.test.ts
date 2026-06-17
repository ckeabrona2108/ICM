import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { buildReleaseCoverCandidateUrls, getReleaseCoverAsset } from "@/lib/release-cover";

test("normalizes upload-backed covers to previews", async () => {
  const asset = await getReleaseCoverAsset({
    id: "rel_1",
    preview: "jpg",
    roles: {
      submissionData: {
        coverUpload: {
          storageKey: "uploads/user_1/release-cover.jpg"
        }
      }
    }
  });

  assert.equal(asset.url, null);
  assert.equal(asset.source, "not_found");
  assert.equal(asset.candidateUrls[0], "/api/uploads/object/uploads/user_1/release-cover.jpg");
});

test("does not generate preview key from bare extension", async () => {
  const asset = await getReleaseCoverAsset({
    id: "rel_2",
    preview: "jpg",
    roles: {}
  });

  assert.equal(asset.url, null);
  assert.deepEqual(asset.candidateUrls, []);
  assert.equal(asset.source, "not_found");
});

test("normalizes direct cover urls to previews when they reference uploads", async () => {
  const asset = await getReleaseCoverAsset({
    id: "rel_3",
    preview: "jpg",
    roles: {
      submissionData: {
        cover: "https://cdn.example/uploads/release-cover.jpg"
      }
    }
  });

  assert.equal(asset.url, null);
  assert.equal(asset.source, "not_found");
  assert.equal(asset.candidateUrls[0], "/api/uploads/object/uploads/release-cover.jpg");
});


test("normalizes public root cover urls to previews when they reference storage", async () => {
  const asset = await getReleaseCoverAsset({
    id: "rel_4",
    preview: "jpg",
    roles: {
      submissionData: {
        cover: "https://s3.icecreammusic.net/previews/rel_4.jpg"
      }
    }
  });

  assert.equal(asset.url, null);
  assert.equal(asset.source, "not_found");
  assert.equal(asset.candidateUrls[0], "/api/uploads/object/previews/rel_4.jpg");
});

test("does not return already normalized app-route covers when object is missing", async () => {
  const asset = await getReleaseCoverAsset({
    id: "rel_5",
    preview: "/api/uploads/object/previews/rel_5.jpg",
    roles: {}
  });

  assert.equal(asset.url, null);
  assert.equal(asset.source, "not_found");
  assert.ok(asset.candidateUrls.includes("/api/uploads/object/previews/rel_5.jpg"));
});

test("does not create candidates from extension-only preview values", () => {
  const candidates = buildReleaseCoverCandidateUrls({
    id: "rel_6",
    preview: "jpeg",
    roles: {}
  });

  assert.deepEqual(candidates, []);
});

test("keeps already normalized cover urls first and adds variants after them", () => {
  const candidates = buildReleaseCoverCandidateUrls({
    id: "rel_8",
    preview: "/api/uploads/object/previews/rel_8.jpeg",
    roles: {}
  });

  assert.equal(candidates[0], "/api/uploads/object/previews/rel_8.jpeg");
  assert.equal(candidates[1], "/api/uploads/object/previews/rel_8.jpg");
  assert.ok(candidates.includes("/api/uploads/object/previews/rel_8.JPEG"));
});

test("keeps null when probes cannot confirm any variant", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("", { status: 404 }));

  try {
    const asset = await getReleaseCoverAsset({
      id: "rel_7",
      preview: "jpeg",
      roles: {}
    });

    assert.equal(asset.url, null);
    assert.equal(asset.source, "not_found");
  } finally {
    fetchMock.mock.restore();
  }
});

test("does not report exact source when preview candidate does not exist", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("", { status: 404 }));

  try {
    const asset = await getReleaseCoverAsset({
      id: "rel_missing",
      preview: "/api/uploads/object/previews/rel_missing.jpeg",
      roles: {}
    });

    assert.notEqual(asset.source, "exact");
    assert.equal(asset.existsInS3, false);
  } finally {
    fetchMock.mock.restore();
  }
});

test("prefers related asset cover fields over stale preview values", async () => {
  const asset = await getReleaseCoverAsset({
    id: "rel_9",
    preview: "/api/uploads/object/previews/stale-missing.jpeg",
    roles: {
      submissionData: {
        assets: {
          cover: {
            storageKey: "contracts/covers/rel_9.WEBP"
          }
        }
      }
    }
  });

  assert.equal(asset.url, null);
  assert.equal(asset.source, "not_found");
  assert.equal(asset.sourceField, "submissionData.assets.cover");
});

test("accepts artwork and image alias fields for release covers", async () => {
  const asset = await getReleaseCoverAsset({
    id: "rel_10",
    roles: {
      submissionData: {
        artworkUrl: "https://s3.icecreammusic.net/contracts/previews/rel_10.JPEG"
      }
    }
  });

  assert.equal(asset.url, null);
  assert.equal(asset.source, "not_found");
  assert.equal(asset.sourceField, "submissionData.artworkUrl");
});
