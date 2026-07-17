import assert from "node:assert/strict";
import test from "node:test";

import {
  canEditRelease,
  canCancelModeration,
  getFocusTrackLimit,
  groupReleaseValidationIssuesByStep,
  mapReleaseValidationStep,
  releaseSubmissionDataSchema,
  validateReleaseSubmission,
  type ReleaseSubmissionData
} from "@/lib/release-policy";

function validSubmission(): ReleaseSubmissionData {
  return {
    cover: "data:image/png;base64,AAA",
    coverMeta: {
      mimeType: "image/png",
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
    partnerCode: "INTERNAL-01",
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
        durationSec: 180,
        title: "Track 01",
        subtitle: "",
        isrc: "USRC17607839",
        partnerCode: "trk-001",
        metadataLanguage: "Русский",
        trackPersons: [
          { name: "Nova Echo", role: "Исполнитель" },
          { name: "Ivan Ivanov", role: "Автор музыки" },
          { name: "Ivan Ivanov", role: "Автор слов" }
        ],
        copyrightPct: "100",
        relatedRightsPct: "100",
        previewStart: "00:30",
        instantGratification: false,
        focusTrack: false,
        versionExplicit: false,
        versionLive: false,
        versionCover: false,
        versionRemix: false,
        versionInstrumental: false,
        versionDrugReference: false,
        aiAssistanceUsed: false,
        aiGeneratedFullTrack: false,
        aiGeneratedMusicOnly: false,
        aiGeneratedLyricsOnly: false,
        aiProcessedTrackOnly: false,
        lyrics: "",
        ringtoneDurationSec: ""
      }
    ],
    moderatorComment: "",
    earlyRussiaStart: true,
    realTimeDelivery: true,
    yandexPreReleaseDate: "2026-04-24"
  };
}

test("release submission preserves early Russia start", () => {
  const parsed = releaseSubmissionDataSchema.parse(validSubmission());
  assert.equal(parsed.earlyRussiaStart, true);
});

test("validateReleaseSubmission returns required-field errors", () => {
  const payload = validSubmission();
  payload.cover = null;
  payload.rightsYear = "";
  payload.tracks = [];

  const issues = validateReleaseSubmission(payload);

  assert.ok(issues.some((issue) => issue.field === "cover"));
  assert.ok(issues.some((issue) => issue.field === "rightsYear"));
  assert.ok(issues.some((issue) => issue.field === "tracks"));
});

test("validateReleaseSubmission checks cover metadata and UPC format", () => {
  const payload = validSubmission();
  payload.coverMeta = {
    mimeType: "image/gif",
    sizeBytes: 25 * 1024 * 1024,
    width: 800,
    height: 800,
    dpi: 60
  };
  payload.upc = "abc";

  const issues = validateReleaseSubmission(payload);

  assert.ok(issues.some((issue) => issue.field === "cover"));
  assert.ok(issues.some((issue) => issue.field === "upc"));
});

test("validateReleaseSubmission validates track authors and ISRC", () => {
  const payload = validSubmission();
  payload.tracks[0].trackPersons = [{ name: "NicknameOnly", role: "Автор слов" }];
  payload.tracks[0].isrc = "bad-isrc";

  const issues = validateReleaseSubmission(payload);

  assert.ok(issues.some((issue) => issue.field === "tracks.0.trackPersons"));
  assert.ok(issues.some((issue) => issue.field === "tracks.0.isrc"));
});

test("validateReleaseSubmission rejects track without both author roles", () => {
  const payload = validSubmission();
  payload.tracks[0].trackPersons = [{ name: "Nova Echo", role: "Исполнитель" }];

  const issues = validateReleaseSubmission(payload);
  assert.ok(issues.some((issue) => issue.field === "tracks.0.trackPersons"));
});

test("validateReleaseSubmission rejects track with only one author role", () => {
  const payloadMusicOnly = validSubmission();
  payloadMusicOnly.tracks[0].trackPersons = [
    { name: "Nova Echo", role: "Исполнитель" },
    { name: "Ivan Ivanov", role: "Автор музыки" }
  ];
  const musicOnlyIssues = validateReleaseSubmission(payloadMusicOnly);
  assert.ok(musicOnlyIssues.some((issue) => issue.field === "tracks.0.trackPersons"));

  const payloadLyricsOnly = validSubmission();
  payloadLyricsOnly.tracks[0].trackPersons = [
    { name: "Nova Echo", role: "Исполнитель" },
    { name: "Ivan Ivanov", role: "Автор слов" }
  ];
  const lyricsOnlyIssues = validateReleaseSubmission(payloadLyricsOnly);
  assert.ok(lyricsOnlyIssues.some((issue) => issue.field === "tracks.0.trackPersons"));
});

test("validateReleaseSubmission blocks unsupported person roles", () => {
  const payload = validSubmission();
  payload.persons = [{ name: "Nova Echo", role: "BadRole" }];
  payload.tracks[0].trackPersons = [{ name: "Nova Echo", role: "UnsupportedRole" }];

  const issues = validateReleaseSubmission(payload);

  assert.ok(issues.some((issue) => issue.field === "persons"));
  assert.ok(issues.some((issue) => issue.field === "tracks.0.trackPersons"));
});

test("validateReleaseSubmission requires at least one main artist in release persons", () => {
  const payload = validSubmission();
  payload.persons = [{ name: "Ivan Ivanov", role: "Автор слов" }];

  const issues = validateReleaseSubmission(payload);

  assert.ok(issues.some((issue) => issue.field === "persons"));
});

test("validateReleaseSubmission blocks rights share above 100%", () => {
  const payload = validSubmission();
  payload.tracks[0].copyrightPct = "150";

  const issues = validateReleaseSubmission(payload);
  assert.ok(
    issues.some(
      (issue) =>
        issue.field === "tracks.0.copyrightPct" &&
        issue.message === "Доля не может быть больше 100%"
    )
  );
});

test("validateReleaseSubmission keeps focus track limits for single_maxi", () => {
  const payload = validSubmission();
  payload.type = "single";
  payload.releaseKind = "single_maxi";
  payload.tracks = [
    {
      ...payload.tracks[0],
      fileName: "track-01.wav",
      durationSec: 300,
      focusTrack: true
    },
    {
      ...payload.tracks[0],
      fileName: "track-02.wav",
      durationSec: 301,
      focusTrack: true
    },
    {
      ...payload.tracks[0],
      fileName: "track-03.wav",
      durationSec: 302,
      focusTrack: false
    }
  ];

  const issues = validateReleaseSubmission(payload);

  assert.ok(issues.some((issue) => issue.field === "tracks"));
  assert.equal(issues.some((issue) => issue.field === "type"), false);
});

test("validateReleaseSubmission allows album with one track", () => {
  const payload = validSubmission();
  payload.type = "album";

  const issues = validateReleaseSubmission(payload);

  assert.equal(issues.some((issue) => issue.field === "type"), false);
});

test("validateReleaseSubmission allows album with three tracks", () => {
  const payload = validSubmission();
  payload.type = "album";
  payload.tracks = [
    payload.tracks[0],
    {
      ...payload.tracks[0],
      fileName: "track-02.wav",
      title: "Track 02",
      isrc: "USRC17607840",
      partnerCode: "trk-002"
    },
    {
      ...payload.tracks[0],
      fileName: "track-03.wav",
      title: "Track 03",
      isrc: "USRC17607841",
      partnerCode: "trk-003"
    }
  ];

  const issues = validateReleaseSubmission(payload);

  assert.equal(issues.some((issue) => issue.field === "type"), false);
});

test("validateReleaseSubmission allows ep with seven tracks", () => {
  const payload = validSubmission();
  payload.type = "ep";
  payload.tracks = Array.from({ length: 7 }, (_, index) => ({
    ...payload.tracks[0],
    fileName: `track-0${index + 1}.wav`,
    title: `Track ${index + 1}`,
    isrc: `USRC1760784${index}`,
    partnerCode: `trk-00${index + 1}`
  }));

  const issues = validateReleaseSubmission(payload);

  assert.equal(issues.some((issue) => issue.field === "type"), false);
});

test("validateReleaseSubmission allows single with multiple tracks", () => {
  const payload = validSubmission();
  payload.type = "single";
  payload.tracks = [
    payload.tracks[0],
    {
      ...payload.tracks[0],
      fileName: "track-02.wav",
      title: "Track 02",
      isrc: "USRC17607840",
      partnerCode: "trk-002"
    }
  ];

  const issues = validateReleaseSubmission(payload);

  assert.equal(issues.some((issue) => issue.field === "type"), false);
});

test("validateReleaseSubmission blocks no-audio release with streaming platforms", () => {
  const payload = validSubmission();
  payload.platformMode = "selected";
  payload.platforms = ["spotify", "apple_music"];
  payload.tracks = [
    {
      ...payload.tracks[0],
      hasAudio: false,
      durationSec: null,
      fileName: "metadata-only"
    }
  ];

  const issues = validateReleaseSubmission(payload);
  assert.ok(issues.some((issue) => issue.field === "tracks.audio_file"));
  assert.ok(
    issues.some(
      (issue) =>
        issue.message ===
        "Добавьте аудиофайл хотя бы к одному треку или уберите стриминговые площадки."
    )
  );
});

test("validateReleaseSubmission accepts wav and flac mime types", () => {
  const wavPayload = validSubmission();
  wavPayload.tracks[0].audioFile = {
    storageKey: "uploads/user_1/track-01.wav",
    url: "/api/uploads/object/uploads/user_1/track-01.wav",
    fileName: "track-01.wav",
    contentType: "audio/wav",
    sizeBytes: 1024
  };

  const flacPayload = validSubmission();
  flacPayload.tracks[0].audioFile = {
    storageKey: "uploads/user_1/track-01.flac",
    url: "/api/uploads/object/uploads/user_1/track-01.flac",
    fileName: "track-01.flac",
    contentType: "audio/flac",
    sizeBytes: 1024
  };

  assert.equal(validateReleaseSubmission(wavPayload).some((issue) => issue.field === "tracks.0.audioFile"), false);
  assert.equal(validateReleaseSubmission(flacPayload).some((issue) => issue.field === "tracks.0.audioFile"), false);
});

test("validateReleaseSubmission rejects unsupported audio mime types", () => {
  const payload = validSubmission();
  payload.tracks[0].audioFile = {
    storageKey: "uploads/user_1/track-01.ogg",
    url: "/api/uploads/object/uploads/user_1/track-01.ogg",
    fileName: "track-01.ogg",
    contentType: "audio/ogg",
    sizeBytes: 1024
  };

  const issues = validateReleaseSubmission(payload);

  assert.ok(issues.some((issue) => issue.field === "tracks.0.audioFile"));
  assert.ok(
    issues.some(
      (issue) =>
        issue.message === "Аудиофайл трека №1 должен быть WAV, FLAC, MP3, AAC, M4A или AIFF."
    )
  );
});

test("mapReleaseValidationStep keeps audio+streaming errors on tracks step", () => {
  assert.equal(mapReleaseValidationStep("tracks.audio_file"), "tracks");
  assert.equal(mapReleaseValidationStep("selected_stores"), "stores");
});

test("groupReleaseValidationIssuesByStep groups errors by target step", () => {
  const grouped = groupReleaseValidationIssuesByStep([
    { code: "required", field: "cover", message: "cover" },
    { code: "required", field: "tracks.0.title", message: "track title" },
    { code: "required", field: "selected_stores", message: "stores" }
  ]);

  assert.equal(grouped.release_info.length, 1);
  assert.equal(grouped.tracks.length, 1);
  assert.equal(grouped.stores.length, 1);
  assert.equal(grouped.pricing.length, 0);
});

test("validateReleaseSubmission accepts valid payload", () => {
  const issues = validateReleaseSubmission(validSubmission());
  assert.equal(issues.length, 0);
});

test("canEditRelease blocks moderation and requires cancellation path", () => {
  const permission = canEditRelease({
    status: "moderation",
    moderationStarted: false
  });

  assert.equal(permission.allowed, false);
  assert.equal(permission.requiresCancellation, true);
});

test("canEditRelease blocks moderation already in review", () => {
  const permission = canEditRelease({
    status: "moderation",
    moderationStarted: true
  });

  assert.equal(permission.allowed, false);
});

test("canCancelModeration allows only moderation before start", () => {
  const allowed = canCancelModeration({
    status: "moderation",
    moderationStarted: false
  });
  const blocked = canCancelModeration({
    status: "moderation",
    moderationStarted: true
  });

  assert.equal(allowed.allowed, true);
  assert.equal(blocked.allowed, false);
});

test("canEditRelease allows distributed release via moderation copy", () => {
  const permission = canEditRelease({
    status: "distributed"
  });

  assert.equal(permission.allowed, true);
  assert.equal(permission.createsModerationCopy, true);
});

test("getFocusTrackLimit follows documented rules", () => {
  assert.equal(getFocusTrackLimit({ releaseType: "single", releaseKind: "standard", trackCount: 3 }), 0);
  assert.equal(getFocusTrackLimit({ releaseType: "album", releaseKind: "standard", trackCount: 4 }), 1);
  assert.equal(getFocusTrackLimit({ releaseType: "album", releaseKind: "standard", trackCount: 10 }), 2);
  assert.equal(getFocusTrackLimit({ releaseType: "album", releaseKind: "standard", trackCount: 11 }), 3);
});
