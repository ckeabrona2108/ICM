import assert from "node:assert/strict";
import test from "node:test";

import { buildTrackQuickPreviewData } from "@/lib/track-quick-preview";
import type { CabinetRelease } from "@/lib/cabinet-types";

function createRelease(overrides?: Partial<CabinetRelease>): CabinetRelease {
  return {
    id: "rel_1",
    number: 1,
    coverUrl: "",
    title: "Release",
    artist: "Artist",
    upc: "5063635661195",
    isrc: "",
    label: "Label",
    createdAt: "2026-05-01",
    preorderDate: "2026-05-01",
    releaseDate: "2026-05-01",
    startDate: "2026-05-01",
    territories: "Все страны",
    platforms: "Все площадки",
    genre: "Rock",
    status: "approved",
    paid: true,
    tracks: [{ num: 1, title: "Track 1", duration: "03:00" }],
    ...overrides
  };
}

test("buildTrackQuickPreviewData maps roles and excludes legacy author roles", () => {
  const release = createRelease({
    submissionData: {
      tracks: [
        {
          title: "Track 1",
          subtitle: "Sub",
          isrc: "USXXX1234567",
          partnerCode: "P-001",
          trackPersons: [
            { name: "Main", role: "Исполнитель" },
            { name: "Feat", role: "feat." },
            { name: "Remix", role: "Remixer" },
            { name: "Co", role: "Соисполнитель" },
            { name: "Prod", role: "Продюсер" },
            { name: "Composer", role: "Автор музыки" },
            { name: "Lyric", role: "Автор слов" },
            { name: "Legacy", role: "Автор" },
            { name: "Legacy2", role: "Автор текста" }
          ],
          copyrightPct: "150",
          relatedRightsPct: "-5",
          previewStart: "00:30",
          focusTrack: true,
          versionExplicit: true,
          metadataLanguage: "Русский"
        }
      ]
    }
  });

  const details = buildTrackQuickPreviewData(release, 1);
  assert.ok(details);
  assert.deepEqual(details?.roles.performer, ["Main"]);
  assert.deepEqual(details?.roles.feat, ["Feat"]);
  assert.deepEqual(details?.roles.remixer, ["Remix"]);
  assert.deepEqual(details?.roles.coPerformer, ["Co"]);
  assert.deepEqual(details?.roles.producer, ["Prod"]);
  assert.deepEqual(details?.roles.musicAuthor, ["Composer"]);
  assert.deepEqual(details?.roles.lyricsAuthor, ["Lyric"]);
  assert.equal(details?.rights.copyrightPct, "100,00 %");
  assert.equal(details?.rights.relatedRightsPct, "0,00 %");
});

test("buildTrackQuickPreviewData returns fallbacks when data is missing", () => {
  const release = createRelease({
    isrc: "",
    submissionData: {
      tracks: [{ title: "", trackPersons: [] }]
    }
  });

  const details = buildTrackQuickPreviewData(release, 1);
  assert.ok(details);
  assert.equal(details?.identification.isrc, "Данные не указаны");
  assert.equal(details?.identification.partnerCode, "Данные не указаны");
  assert.equal(details?.additional.language, "Данные не указаны");
});

test("buildTrackQuickPreviewData falls back to cabinet track metadata when submission track is incomplete", () => {
  const release = createRelease({
    tracks: [
      {
        num: 1,
        title: "Track 1",
        duration: "03:00",
        isrc: "USRC17607839",
        partnerCode: "DB-PARTNER-01",
        trackPersons: [
          { name: "Main Artist", role: "Исполнитель" },
          { name: "Producer", role: "Продюсер" },
          { name: "Composer", role: "Автор музыки" },
          { name: "Lyricist", role: "Автор слов" }
        ],
        copyrightPct: "80",
        relatedRightsPct: "20",
        previewStart: "00:45",
        focusTrack: true,
        versionExplicit: true,
        metadataLanguage: "Русский"
      }
    ],
    submissionData: {
      tracks: [{ title: "Track 1", trackPersons: [] }]
    }
  });

  const details = buildTrackQuickPreviewData(release, 1);
  assert.ok(details);
  assert.equal(details?.identification.isrc, "USRC17607839");
  assert.equal(details?.identification.partnerCode, "DB-PARTNER-01");
  assert.deepEqual(details?.roles.performer, ["Main Artist"]);
  assert.deepEqual(details?.roles.producer, ["Producer"]);
  assert.deepEqual(details?.roles.musicAuthor, ["Composer"]);
  assert.deepEqual(details?.roles.lyricsAuthor, ["Lyricist"]);
  assert.equal(details?.rights.copyrightPct, "80,00 %");
  assert.equal(details?.rights.relatedRightsPct, "20,00 %");
  assert.equal(details?.additional.previewStart, "00:45");
  assert.equal(details?.additional.focusTrack, true);
  assert.equal(details?.additional.explicit, true);
  assert.equal(details?.additional.language, "Русский");
});

test("buildTrackQuickPreviewData returns null for missing track", () => {
  const release = createRelease();
  const details = buildTrackQuickPreviewData(release, 5);
  assert.equal(details, null);
});

