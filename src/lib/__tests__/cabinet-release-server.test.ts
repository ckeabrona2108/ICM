// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { mapReleaseToCabinetRelease } from "@/lib/cabinet-release-server";

function baseRelease(status: "ARCHIVED" | "MODERATION" | "DRAFT" | "CHANGES_REQUIRED") {
  const submissionData = {
    title: "Submission Title",
    genre: "Synth Pop",
    label: "Label X",
    upc: "123456789012",
    preorderDate: "2026-04-20",
    startDate: "2026-04-25",
    releaseDate: "2026-04-25",
    territoryMode: "selected",
    territoryCountries: ["ES", "FR"],
    platformMode: "selected",
    platforms: ["spotify"],
    persons: [{ name: "Nova Echo", role: "Исполнитель" }],
    cover: "https://example.com/cover.jpg"
  };

  return {
    id: "rel_1",
    userId: "usr_1",
    artistProfileId: null,
    title: "Fallback Title",
    subtitle: null,
    slug: "fallback-title",
    genre: "Pop",
    subgenre: null,
    language: "Русский",
    releaseKind: "STANDARD",
    platformMode: "ALL",
    platforms: null,
    partnerCode: null,
    rightsYear: null,
    date: new Date("2026-04-28T00:00:00.000Z"),
    startDate: new Date("2026-04-25T00:00:00.000Z"),
    preorderDate: new Date("2026-04-20T00:00:00.000Z"),
    releaseDate: new Date("2026-04-28T00:00:00.000Z"),
    type: "SINGLE",
    status,
    confirmed: true,
    explicit: false,
    priority: false,
    upc: "123456789012",
    isrc: null,
    lyrics: null,
    moderationComment: null,
    moderationRemarks: [
      {
        section: "Релиз",
        field: "cover",
        message: "Проверьте обложку."
      }
    ],
    moderationReturnedAt: new Date("2026-04-28T12:00:00.000Z"),
    moderationCancelledAt: null,
    moderationStartedAt: null,
    coverMeta: null,
    preview: "https://example.com/cover.jpg",
    performer: "Nova Echo",
    labelName: "Label X",
    roles: {
      submissionData
    },
    submissionData,
    createdAt: new Date("2026-04-20T00:00:00.000Z"),
    updatedAt: new Date("2026-04-20T00:00:00.000Z"),
    track: [],
    tracks: [
      {
        id: "trk_1",
        releaseId: "rel_1",
        title: "Track 1",
        subtitle: null,
        durationSec: 185,
        trackNumber: 1,
        isrc: "USRC17607839",
        partnerCode: null,
        hasAudio: true,
        metadataLanguage: "Русский",
        previewStart: null,
        instantGratification: false,
        focusTrack: false,
        versionExplicit: false,
        versionLive: false,
        versionCover: false,
        versionRemix: false,
        versionInstrumental: false,
        lyrics: null,
        ringtoneDurationSec: null,
        copyrightPct: null,
        relatedRightsPct: null,
        contributors: null,
        createdAt: new Date("2026-04-20T00:00:00.000Z")
      }
    ],
    user: {
      name: "Fallback Artist"
    },
    coverImage: {
      url: "https://example.com/cover.jpg"
    }
  } as const;
}

test("mapReleaseToCabinetRelease maps status and remarks from DB data", async () => {
  const release = await mapReleaseToCabinetRelease(
    baseRelease("ARCHIVED") as never,
    3
  );

  assert.equal(release.number, 3);
  assert.equal(release.status, "approved");
  assert.equal(release.title, "Fallback Title");
  assert.equal(release.artist, "Nova Echo");
  assert.equal(release.coverUrl, "");
});

test("mapReleaseToCabinetRelease maps priority flag for card badge", async () => {
  const source = {
    ...baseRelease("MODERATION"),
    priority: true
  };

  const release = await mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.priority, true);
});

test("mapReleaseToCabinetRelease falls back to submission cover when cover image is absent", async () => {
  const source = {
    ...baseRelease("MODERATION"),
    preview: "",
    coverImage: null,
    submissionData: {
      ...(baseRelease("MODERATION").submissionData as Record<string, unknown>),
      cover: "uploads/user_1/release-cover.png"
    },
    roles: {
      submissionData: {
        ...(baseRelease("MODERATION").submissionData as Record<string, unknown>),
        cover: "uploads/user_1/release-cover.png"
      }
    }
  };

  const release = await mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.coverUrl, "");
});

test("mapReleaseToCabinetRelease prefers latest submission cover over stored cover image", async () => {
  const source = {
    ...baseRelease("MODERATION"),
    preview: "https://example.com/old-cover.jpg",
    coverImage: {
      url: "https://example.com/old-cover.jpg"
    },
    submissionData: {
      ...(baseRelease("MODERATION").submissionData as Record<string, unknown>),
      cover: "uploads/user_1/new-cover.png"
    },
    roles: {
      submissionData: {
        ...(baseRelease("MODERATION").submissionData as Record<string, unknown>),
        cover: "uploads/user_1/new-cover.png"
      }
    }
  };

  const release = await mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.coverUrl, "");
});

test("mapReleaseToCabinetRelease prefers storageKey-based cover uploads over transient urls", async () => {
  const source = {
    ...baseRelease("MODERATION"),
    preview: "https://temporary.example.com/presigned?X-Amz-Signature=expired",
    submissionData: {
      ...(baseRelease("MODERATION").submissionData as Record<string, unknown>),
      cover: "https://temporary.example.com/presigned?X-Amz-Signature=expired",
      coverUpload: {
        storageKey: "uploads/user_1/release-cover.jpg",
        url: "https://temporary.example.com/presigned?X-Amz-Signature=expired"
      }
    },
    roles: {
      submissionData: {
        ...(baseRelease("MODERATION").submissionData as Record<string, unknown>),
        cover: "https://temporary.example.com/presigned?X-Amz-Signature=expired",
        coverUpload: {
          storageKey: "uploads/user_1/release-cover.jpg",
          url: "https://temporary.example.com/presigned?X-Amz-Signature=expired"
        }
      }
    }
  };

  const release = await mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.coverUrl, "");
});

test("mapReleaseToCabinetRelease does not fallback to account name when persons are missing", async () => {
  const source = {
    ...baseRelease("DRAFT"),
    performer: null,
    submissionData: {
      title: "Submission Title",
      genre: "Synth Pop",
      label: "Label X",
      upc: "123456789012",
      preorderDate: "2026-04-20",
      startDate: "2026-04-25",
      releaseDate: "2026-04-25",
      territoryMode: "selected",
      territoryCountries: ["ES"],
      platformMode: "selected",
      platforms: ["spotify"],
      persons: []
    },
    roles: {
      submissionData: {
        title: "Submission Title",
        genre: "Synth Pop",
        label: "Label X",
        upc: "123456789012",
        preorderDate: "2026-04-20",
        startDate: "2026-04-25",
        releaseDate: "2026-04-25",
        territoryMode: "selected",
        territoryCountries: ["ES"],
        platformMode: "selected",
        platforms: ["spotify"],
        persons: []
      }
    }
  };

  const release = await mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.artist, "Не указан");
});

test("mapReleaseToCabinetRelease handles incomplete draft fields with safe fallbacks", async () => {
  const source = {
    ...baseRelease("DRAFT"),
    title: null,
    genre: null,
    submissionData: {},
    roles: {},
    track: [],
    tracks: [],
    coverImage: null,
    preview: ""
  };

  const release = await mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.title, "Без названия");
  assert.equal(release.genre, "Не указан");
  assert.equal(release.releaseDate, "2026-04-28");
  assert.equal(release.startDate, "2026-04-25");
  assert.equal(release.preorderDate, "2026-04-20");
  assert.equal(release.coverUrl, "");
});

test("mapReleaseToCabinetRelease keeps moderation comment as rejection reason for changes_required", async () => {
  const source = {
    ...baseRelease("CHANGES_REQUIRED"),
    upc: null,
    confirmed: false,
    moderationComment: "Нужно заменить обложку: плохое качество изображения.",
    roles: {}
  };

  const release = await mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.status, "draft");
  assert.equal(release.coverUrl, "");
});
