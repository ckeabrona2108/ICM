import assert from "node:assert/strict";
import test from "node:test";

import { resolveSceneArtistNames, resolveScenePreviewAudioUrl } from "@/lib/scene-service";
import type { SceneShowcaseState } from "@/lib/scene-showcase-state";

const state: SceneShowcaseState = {
  enabled: true,
  trackIndex: 1,
  previewAsset: {
    storageKey: "uploads/user-id/release-preview.wav",
    fileName: "release-preview.wav",
    contentType: "audio/wav",
    size: 1024,
    durationSec: 30
  },
  publishedAt: "2026-07-18T08:00:00.000Z"
};

test("scene preview uses the saved storage key when the object exists", async () => {
  assert.equal(
    await resolveScenePreviewAudioUrl(state, async () => true),
    "/api/uploads/object/uploads/user-id/release-preview.wav"
  );
});

test("scene preview remains usable when storage probing is unavailable", async () => {
  assert.equal(
    await resolveScenePreviewAudioUrl(state, async () => null),
    "/api/uploads/object/uploads/user-id/release-preview.wav"
  );
});

test("scene preview is hidden only when storage confirms it is missing", async () => {
  assert.equal(await resolveScenePreviewAudioUrl(state, async () => false), null);
});

test("release artist uses the track performer nickname instead of the account fallback", () => {
  assert.deepEqual(resolveSceneArtistNames({
    performer: "Иван",
    fallbackArtistName: "Label Account",
    roles: {
      submissionData: {
        persons: [{ role: "исполнитель", name: "Иван" }],
        tracks: [{
          trackPersons: [{ role: "Исполнитель", name: "Ckeabrona" }]
        }]
      }
    }
  }), ["Ckeabrona"]);
});

test("release artist extracts public nicknames from track performer legal names", () => {
  assert.deepEqual(resolveSceneArtistNames({
    performer: null,
    roles: {
      submissionData: {
        tracks: [{
          trackPersons: [
            { role: "Исполнитель", name: "Шведов Андрей Александрович(YUNG$HVED)" },
            { role: "Исполнитель", name: "Ульянов Иван Иванович(Evianway)" }
          ]
        }]
      }
    }
  }), ["YUNG$HVED", "Evianway"]);
});

test("legacy track roles override the account owner name", () => {
  assert.deepEqual(resolveSceneArtistNames({
    performer: "Иван",
    roles: {},
    trackRoles: [[
      { role: "Исполнитель", name: "Tripowy" }
    ]],
    fallbackArtistName: "Иван"
  }), ["Tripowy"]);
});

test("explicit release nickname overrides legal performer names from track credits", () => {
  assert.deepEqual(resolveSceneArtistNames({
    performer: "FATAL'",
    roles: {
      submissionData: {
        tracks: [{
          trackPersons: [
            { role: "Исполнитель", name: "Лебедева Татьяна Эдуардовна" },
            { role: "Исполнитель", name: "Руфанова Анна Валерьевна" }
          ]
        }]
      }
    }
  }), ["FATAL'"]);
});

test("current submission nickname overrides a legacy legal release performer", () => {
  assert.deepEqual(resolveSceneArtistNames({
    performer: "Лебедева Татьяна Эдуардовна, Руфанова Анна Валерьевна",
    roles: {
      submissionData: {
        performer: "FATAL'"
      }
    }
  }), ["FATAL'"]);
});

test("release performer person overrides a legacy legal performer field", () => {
  assert.deepEqual(resolveSceneArtistNames({
    performer: "Лебедева Татьяна Эдуардовна, Руфанова Анна Валерьевна",
    roles: {
      submissionData: {
        persons: [{ role: "Исполнитель", name: "FATAL'" }]
      }
    }
  }), ["FATAL'"]);
});

test("public artist roles include co-performers, featuring artists and remixers", () => {
  assert.deepEqual(resolveSceneArtistNames({
    performer: "Legacy Account",
    roles: {
      submissionData: {
        persons: [
          { role: "Соисполнитель", name: "Artist One" },
          { role: "feat.", name: "Artist Two" },
          { role: "Remixer", name: "Artist Three" }
        ]
      }
    }
  }), ["Artist One", "Artist Two", "Artist Three"]);
});
