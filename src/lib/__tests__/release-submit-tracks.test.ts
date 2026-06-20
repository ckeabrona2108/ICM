import assert from "node:assert/strict";
import test from "node:test";

import type { ReleaseSubmissionData } from "@/lib/release-policy";
import {
  buildSubmitTrackDiagnostics,
  buildTrackCreateManyInput,
  readReleaseTypeFromSubmissionData
} from "@/lib/release-submit-tracks";

function validSubmission(): ReleaseSubmissionData {
  return {
    cover: "https://example.com/cover.jpg",
    coverUpload: {
      storageKey: "uploads/user_1/cover.jpg",
      url: "https://example.com/uploads/user_1/cover.jpg",
      fileName: "cover.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1024,
      width: 3000,
      height: 3000
    },
    coverMeta: {
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      width: 3000,
      height: 3000,
      dpi: 72
    },
    language: "Русский",
    title: "Новый релиз",
    subtitle: "",
    genre: "Pop",
    subgenre: "Synth Pop",
    type: "single",
    releaseKind: "standard",
    label: "ICECREAMMUSIC",
    persons: [{ name: "Nova Echo", role: "Исполнитель" }],
    upc: "",
    partnerCode: "REL-001",
    rightsYear: "2026",
    preorderDate: "2026-05-01",
    startDate: "2026-05-01",
    releaseDate: "2026-04-20",
    territoryMode: "all",
    territoryCountries: [],
    platformMode: "all",
    platforms: [],
    tracks: [
      {
        fileName: "track-01.wav",
        hasAudio: true,
        audioFile: {
          storageKey: "uploads/user_1/track-01.wav",
          url: "https://example.com/uploads/user_1/track-01.wav",
          fileName: "track-01.wav",
          contentType: "audio/wav",
          sizeBytes: 2048
        },
        durationSec: 185,
        title: "Track 01",
        subtitle: "",
        isrc: "USRC17607839",
        partnerCode: "TRK-001",
        metadataLanguage: "Русский",
        trackPersons: [
          { name: "Nova Echo", role: "Исполнитель" },
          { name: "Ivan Ivanov", role: "Автор музыки" },
          { name: "Ivan Ivanov", role: "Автор слов" }
        ],
        copyrightPct: "100",
        relatedRightsPct: "100",
        previewStart: "00:30",
        instantGratification: true,
        focusTrack: true,
        versionExplicit: false,
        versionLive: false,
        versionCover: false,
        versionRemix: false,
        versionInstrumental: false,
        lyrics: "Lyrics",
        ringtoneDurationSec: "",
        syncedLyricsFile: {
          storageKey: "uploads/user_1/track-01.lrc",
          url: "https://example.com/uploads/user_1/track-01.lrc",
          fileName: "track-01.lrc"
        }
      }
    ],
    moderatorComment: "",
    realTimeDelivery: true,
    yandexPreReleaseDate: "2026-04-24"
  };
}

test("readReleaseTypeFromSubmissionData uses canonical type from submission payload", () => {
  assert.equal(readReleaseTypeFromSubmissionData({ type: "album" }), "album");
  assert.equal(readReleaseTypeFromSubmissionData({ releaseType: "ep" }), "ep");
  assert.equal(readReleaseTypeFromSubmissionData({}), "single");
});

test("buildTrackCreateManyInput persists audio refs and single track metadata", () => {
  const submission = validSubmission();
  const rows = buildTrackCreateManyInput({
    releaseId: "6687ff3c-d2c9-4aaa-bbad-193e4c989934",
    releaseLanguage: submission.language,
    startDate: new Date("2026-05-01T00:00:00.000Z"),
    tracks: submission.tracks
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.releaseId, "6687ff3c-d2c9-4aaa-bbad-193e4c989934");
  assert.equal(rows[0]?.track, "03:05");
  assert.equal(rows[0]?.language, "Русский");
  assert.equal(
    new Date(rows[0]?.instant_gratification_date ?? "").toISOString(),
    "2026-05-01T00:00:00.000Z"
  );
  assert.equal(rows[0]?.text_sync, "uploads/user_1/track-01.lrc");
  assert.equal(
    (rows[0]?.roles as { audioFile?: { storageKey?: string } } | undefined)?.audioFile?.storageKey,
    "uploads/user_1/track-01.wav"
  );
});

test("buildSubmitTrackDiagnostics reports payload and created track counts", () => {
  const submission = validSubmission();
  const diagnostics = buildSubmitTrackDiagnostics({
    releaseId: "rel_1",
    payloadData: { tracks: submission.tracks },
    submissionData: submission,
    createdTracksCount: 1
  });

  assert.deepEqual(diagnostics, {
    releaseId: "rel_1",
    payloadTracksCount: 1,
    submissionDataTracksCount: 1,
    createdTracksCount: 1,
    trackAudioKeys: ["uploads/user_1/track-01.wav"]
  });
});
