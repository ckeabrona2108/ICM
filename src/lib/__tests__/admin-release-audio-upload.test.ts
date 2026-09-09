import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminReleaseAudioStorageKey,
  resolveAdminAudioSubmissionTrackIndex
} from "@/lib/admin-release-audio-upload";

test("admin audio maps one-based database track indexes to zero-based submission positions", () => {
  const index = resolveAdminAudioSubmissionTrackIndex({
    trackId: "db-track-1",
    databaseTracks: [{ id: "db-track-1" }, { id: "db-track-2" }],
    submissionTracks: [{ title: "Первый" }, { title: "Второй" }]
  });

  assert.equal(index, 0);
});

test("admin audio prefers an exact stable submission track id", () => {
  const index = resolveAdminAudioSubmissionTrackIndex({
    trackId: "shared-track-id",
    databaseTracks: [{ id: "db-track-1" }, { id: "shared-track-id" }],
    submissionTracks: [{ id: "shared-track-id" }, { id: "other-track-id" }]
  });

  assert.equal(index, 0);
});

test("admin audio uses a new storage key for every replacement", () => {
  const first = buildAdminReleaseAudioStorageKey({
    trackId: "track-1",
    extension: ".wav",
    version: "version-1"
  });
  const second = buildAdminReleaseAudioStorageKey({
    trackId: "track-1",
    extension: ".wav",
    version: "version-2"
  });

  assert.equal(first, "tracks/track-1/version-1.wav");
  assert.equal(second, "tracks/track-1/version-2.wav");
  assert.notEqual(first, second);
});
