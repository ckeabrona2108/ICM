// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { ReleaseStatus, ReleaseType } from "@prisma/client";

import { mapReleaseToCabinetRelease } from "@/lib/cabinet-release-server";

function baseRelease(status: ReleaseStatus) {
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
    releaseDate: new Date("2026-04-28T00:00:00.000Z"),
    type: ReleaseType.SINGLE,
    status,
    explicit: false,
    priority: false,
    upc: null,
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
    submissionData: {
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
      persons: [{ name: "Nova Echo", role: "Исполнитель" }]
    },
    createdAt: new Date("2026-04-20T00:00:00.000Z"),
    updatedAt: new Date("2026-04-20T00:00:00.000Z"),
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

test("mapReleaseToCabinetRelease maps status and remarks from DB data", () => {
  const release = mapReleaseToCabinetRelease(
    baseRelease(ReleaseStatus.ARCHIVED) as never,
    3
  );

  assert.equal(release.number, 3);
  assert.equal(release.status, "archived");
  assert.equal(release.title, "Submission Title");
  assert.equal(release.artist, "Nova Echo");
  assert.equal(release.coverUrl, "https://example.com/cover.jpg");
  assert.equal(release.moderationRemarks?.[0]?.field, "cover");
  assert.equal(release.territoriesCount, 2);
  assert.equal(release.platformsCount, 1);
});

test("mapReleaseToCabinetRelease maps priority flag for card badge", () => {
  const source = {
    ...baseRelease(ReleaseStatus.MODERATION),
    priority: true
  };

  const release = mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.priority, true);
});

test("mapReleaseToCabinetRelease falls back to submission cover when cover image is absent", () => {
  const source = {
    ...baseRelease(ReleaseStatus.MODERATION),
    coverImage: null,
    submissionData: {
      ...(baseRelease(ReleaseStatus.MODERATION).submissionData as Record<string, unknown>),
      cover: "data:image/png;base64,AAA"
    }
  };

  const release = mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.coverUrl, "data:image/png;base64,AAA");
});

test("mapReleaseToCabinetRelease prefers latest submission cover over stored cover image", () => {
  const source = {
    ...baseRelease(ReleaseStatus.MODERATION),
    coverImage: {
      url: "https://example.com/old-cover.jpg"
    },
    submissionData: {
      ...(baseRelease(ReleaseStatus.MODERATION).submissionData as Record<string, unknown>),
      cover: "data:image/png;base64,NEW"
    }
  };

  const release = mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.coverUrl, "data:image/png;base64,NEW");
});

test("mapReleaseToCabinetRelease does not fallback to account name when persons are missing", () => {
  const source = {
    ...baseRelease(ReleaseStatus.DRAFT),
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
  };

  const release = mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.artist, "Не указан");
});

test("mapReleaseToCabinetRelease handles incomplete draft fields with safe fallbacks", () => {
  const source = {
    ...baseRelease(ReleaseStatus.DRAFT),
    title: null,
    genre: null,
    releaseDate: null,
    submissionData: {},
    tracks: [],
    coverImage: null
  };

  const release = mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.title, "Без названия");
  assert.equal(release.genre, "Не указан");
  assert.equal(release.releaseDate, "Дата не выбрана");
  assert.equal(release.startDate, "Дата не выбрана");
  assert.equal(release.preorderDate, "Дата не выбрана");
  assert.equal(release.coverUrl, "");
});

test("mapReleaseToCabinetRelease keeps moderation comment as rejection reason for changes_required", () => {
  const source = {
    ...baseRelease(ReleaseStatus.CHANGES_REQUIRED),
    moderationComment: "Нужно заменить обложку: плохое качество изображения."
  };

  const release = mapReleaseToCabinetRelease(source as never, 1);
  assert.equal(release.status, "changes_required");
  assert.equal(
    release.rejectionReason,
    "Нужно заменить обложку: плохое качество изображения."
  );
});
