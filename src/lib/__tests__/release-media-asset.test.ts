import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { resolveTrackAudioAsset } from "@/lib/release-media-asset";

test("resolveTrackAudioAsset falls through to uppercase contracts upload candidate", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/uploads/object/contracts/uploads/track-1.WAV")) {
      return new Response("", { status: 200 });
    }
    return new Response("", { status: 404 });
  });

  try {
    const asset = await resolveTrackAudioAsset({
      trackId: "track-1",
      track: "wav",
      audioUrl: null,
      audioFile: null,
      audioUpload: null,
      audio: null,
      releaseId: "rel_1"
    });

    assert.equal(asset.url, "/api/uploads/object/contracts/uploads/track-1.WAV");
    assert.equal(asset.source, "legacy");
  } finally {
    fetchMock.mock.restore();
  }
});

test("resolveTrackAudioAsset keeps normalized audio url when probes cannot confirm any variant", async () => {
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("", { status: 404 }));

  try {
    const asset = await resolveTrackAudioAsset({
      trackId: "track-2",
      track: "wav",
      audioUrl: null,
      audioFile: null,
      audioUpload: null,
      audio: null,
      releaseId: "rel_2"
    });

    assert.equal(asset.url, "/api/uploads/object/tracks/track-2.wav");
    assert.notEqual(asset.url, null);
  } finally {
    fetchMock.mock.restore();
  }
});
