import assert from "node:assert/strict";
import test from "node:test";

import { mapCabinetReleaseToWizardSeed } from "@/lib/map-cabinet-to-wizard-seed";

test("mapCabinetReleaseToWizardSeed restores wizard data from submissionData", () => {
  const seed = mapCabinetReleaseToWizardSeed({
    id: "rel_1",
    number: 1,
    coverUrl: "/hero/drop.png",
    title: "Legacy",
    artist: "Legacy Artist",
    upc: "",
    label: "ICECREAMMUSIC",
    preorderDate: "—",
    releaseDate: "—",
    startDate: "—",
    territories: "Все страны",
    platforms: "Все площадки",
    genre: "Pop",
    status: "changes_required",
    paid: false,
    tracks: [],
    submissionData: {
      cover: "data:image/png;base64,AAA",
      coverMeta: {
        mimeType: "image/png",
        sizeBytes: 1024,
        width: 1400,
        height: 1400,
        dpi: 72
      },
      language: "Русский",
      title: "Submission Title",
      subtitle: "Deluxe",
      genre: "Pop",
      subgenre: "Synth Pop",
      type: "single",
      releaseKind: "standard",
      label: "LABEL X",
      persons: [{ name: "Nova Echo", role: "Исполнитель" }],
      upc: "123456789012",
      partnerCode: "PRT-1",
      rightsYear: "2026",
      preorderDate: "2026-04-20",
      startDate: "2026-04-25",
      releaseDate: "2026-04-25",
      territoryMode: "all",
      territoryCountries: [],
      platformMode: "all",
      platforms: [],
      tracks: [
        {
          fileName: "track.wav",
          hasAudio: true,
          audioFile: {
            storageKey: "uploads/release-1/track.wav",
            url: "https://cdn.example.com/uploads/release-1/track.wav",
            sizeBytes: 123456,
            contentType: "audio/wav"
          },
          durationSec: 180,
          title: "Track 1",
          subtitle: "",
          isrc: "USRC17607839",
          partnerCode: "TR-1",
          metadataLanguage: "Русский",
          trackPersons: [{ name: "Nova Echo", role: "Исполнитель" }],
          copyrightPct: "50",
          relatedRightsPct: "100",
          previewStart: "00:30",
          instantGratification: false,
          focusTrack: false,
          versionExplicit: false,
          versionLive: false,
          versionCover: false,
          versionRemix: false,
          versionInstrumental: false,
          versionDrugReference: true,
          aiAssistanceUsed: true,
          aiGeneratedFullTrack: false,
          aiGeneratedMusicOnly: true,
          aiGeneratedLyricsOnly: false,
          aiProcessedTrackOnly: true,
          lyrics: "",
          ringtoneDurationSec: ""
        }
      ],
      moderatorComment: "",
      realTimeDelivery: true,
      yandexPreReleaseDate: "2026-04-18"
    }
  });

  assert.equal(seed.title, "Submission Title");
  assert.equal(seed.releaseKind, "standard");
  assert.equal(seed.tracks?.length, 1);
  assert.equal(
    seed.tracks?.[0]?.audioUrl,
    "https://cdn.example.com/uploads/release-1/track.wav"
  );
  assert.equal(seed.tracks?.[0]?.audioUpload?.storageKey, "uploads/release-1/track.wav");
  assert.equal(seed.tracks?.[0]?.meta.title, "Track 1");
  assert.equal(seed.tracks?.[0]?.meta.trackPersons.length, 1);
  assert.equal(seed.tracks?.[0]?.meta.versionDrugReference, true);
  assert.equal(seed.tracks?.[0]?.meta.aiAssistanceUsed, true);
  assert.equal(seed.tracks?.[0]?.meta.aiGeneratedMusicOnly, true);
  assert.equal(seed.tracks?.[0]?.meta.aiProcessedTrackOnly, true);
});

test("mapCabinetReleaseToWizardSeed restores track audio from cabinet tracks when submissionData is missing", () => {
  const seed = mapCabinetReleaseToWizardSeed({
    id: "rel_2",
    number: 1,
    coverUrl: "/hero/drop.png",
    title: "Released",
    artist: "Released Artist",
    upc: "123456789012",
    label: "ICECREAMMUSIC",
    preorderDate: "2026-04-20",
    releaseDate: "2026-04-25",
    startDate: "2026-04-25",
    territories: "Все страны",
    platforms: "Все площадки",
    genre: "Pop",
    status: "approved",
    paid: true,
    tracks: [
      {
        num: 1,
        title: "Track 1",
        duration: "03:00",
        durationSec: 180,
        audioUrl: "/api/uploads/object/uploads/release-2/track.wav",
        isrc: "USRC17607839",
        partnerCode: "TR-1",
        trackPersons: [{ name: "Released Artist", role: "Исполнитель" }],
        metadataLanguage: "Русский"
      }
    ]
  });

  assert.equal(seed.tracks?.length, 1);
  assert.equal(seed.tracks?.[0]?.audioUrl, "/api/uploads/object/uploads/release-2/track.wav");
  assert.equal(seed.tracks?.[0]?.meta.title, "Track 1");
});
