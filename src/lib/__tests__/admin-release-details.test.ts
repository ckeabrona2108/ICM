// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import {
  mapAdminReleaseDetails,
  resolveAdminReleaseFileTargetFromRelease
} from "@/lib/admin-release-details";

test("mapAdminReleaseDetails includes tracks, stores, territories and moderation comment", () => {
  const details = mapAdminReleaseDetails({
    id: "rel_1",
    userId: "user_1",
    artistProfileId: null,
    title: "DB Title",
    subtitle: null,
    slug: "db-title",
    genre: "Rap",
    subgenre: null,
    language: "Russian",
    releaseKind: "STANDARD",
    platformMode: "ALL",
    platforms: null,
    partnerCode: null,
    rightsYear: null,
    releaseDate: new Date("2026-04-01T00:00:00.000Z"),
    type: "SINGLE",
    status: "MODERATION",
    explicit: false,
    upc: "123456789012",
    isrc: null,
    lyrics: null,
    moderationComment: "db-comment",
    moderationRemarks: null,
    moderationReturnedAt: null,
    moderationCancelledAt: null,
    moderationStartedAt: new Date("2026-04-02T00:00:00.000Z"),
    approvedAt: null,
    approvedBy: null,
    rejectedAt: null,
    rejectedBy: null,
    rejectionReason: null,
    priority: true,
    coverMeta: null,
    submissionData: {
      title: "Submission Title",
      cover: "https://cdn.example/cover.jpg",
      label: "ICM",
      upc: "5063635661195",
      genre: "Hip-Hop",
      releaseDate: "2026-04-05",
      startDate: "2026-04-04",
      territoryCountries: ["RU", "KZ"],
      platforms: ["spotify", "apple"],
      moderatorComment: "submission-comment",
      tracks: [
        {
          fileName: "track-01.wav",
          title: "Track 01",
          isrc: "USAAA2600001",
          metadataLanguage: "ru",
          versionExplicit: true,
          durationSec: 125,
          copyrightPct: "80",
          relatedRightsPct: "20",
          trackPersons: [{ name: "Artist", role: "Исполнитель" }]
        }
      ]
    },
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-03T00:00:00.000Z"),
    user: { id: "user_1", name: "Artist Name" },
    tracks: [
      {
        id: "trk_1",
        releaseId: "rel_1",
        title: "DB Track",
        subtitle: null,
        durationSec: 120,
        trackNumber: 1,
        isrc: null,
        partnerCode: null,
        hasAudio: true,
        metadataLanguage: null,
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
        createdAt: new Date("2026-04-01T00:00:00.000Z")
      }
    ],
    coverImage: {
      id: "cover_1",
      releaseId: "rel_1",
      storageKey: "covers/cover_1.jpg",
      url: "https://cdn.example/db-cover.jpg",
      width: 3000,
      height: 3000,
      createdAt: new Date("2026-04-01T00:00:00.000Z")
    },
    releaseFile: {
      id: "rf_1",
      releaseId: "rel_1",
      storageKey: "releases/release_file.zip",
      url: "https://cdn.example/release.zip",
      mimeType: "application/zip",
      sizeBytes: 123,
      checksum: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z")
    },
    distributionStatus: [
      {
        id: "dist_1",
        releaseId: "rel_1",
        platformId: "pl_1",
        status: "PENDING",
        note: null,
        deliveredAt: null,
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
        platform: {
          code: "spotify",
          name: "Spotify"
        }
      }
    ],
    artistProfile: null,
    royalties: [],
    campaigns: [],
    analyticsReportSnapshots: [],
    analyticsDailySummaries: [],
    resolvedUnmatchedAnalyticsImports: [],
    analyticsAiInsights: []
  } as never);

  assert.equal(details.release.title, "Submission Title");
  assert.equal(details.cover.url, "https://cdn.example/cover.jpg");
  assert.equal(details.release.platforms.selected_codes[0], "spotify");
  assert.equal(details.release.territories.countries[0], "RU");
  assert.equal(details.comment, "db-comment");
  assert.equal(details.tracks[0]?.files.audio.file_name, "track-01.wav");
  assert.equal(details.tracks[0]?.rights.copyright_pct, "80");
});

test("resolveAdminReleaseFileTargetFromRelease resolves known file ids only", () => {
  const release = {
    tracks: [{ id: "trk_1", trackNumber: 1 }],
    submissionData: {
      tracks: [
        {
          textFile: {
            url: "https://cdn.example/text.txt"
          }
        }
      ]
    },
    coverImage: { storageKey: "covers/1.jpg", url: "https://cdn.example/covers/1.jpg" },
    releaseFile: { storageKey: "releases/1.zip", url: "https://cdn.example/releases/1.zip" }
  };

  const cover = resolveAdminReleaseFileTargetFromRelease({
    fileId: "cover",
    release
  });
  assert.equal(cover?.kind, "cover");

  const audio = resolveAdminReleaseFileTargetFromRelease({
    fileId: "audio",
    release
  });
  assert.equal(audio?.kind, "release-file");

  const text = resolveAdminReleaseFileTargetFromRelease({
    fileId: "track-trk_1-text",
    release
  });
  assert.equal(text?.kind, "track-text");
  assert.equal(text?.url, "https://cdn.example/text.txt");

  const unknown = resolveAdminReleaseFileTargetFromRelease({
    fileId: "track-1",
    release
  });
  assert.equal(unknown, null);
});
