import assert from "node:assert/strict";
import test from "node:test";

import {
  getDailySceneRelease,
  getNextPlayableRelease,
  searchSceneReleases,
  getSimilarMoodReleases,
  getUnderratedSceneRelease,
  getWeeklySceneLeader
} from "@/lib/scene-discovery";

const releases = [
  { id: "pop-new", genre: "Pop", releaseDate: "2026-07-18", coverUrl: "/a.jpg", audioUrl: "/a.mp3" },
  { id: "rock", genre: "Rock", releaseDate: "2026-07-17", coverUrl: "/b.jpg", audioUrl: null },
  { id: "pop-old", genre: "Pop", releaseDate: "2026-07-16", coverUrl: "/c.jpg", audioUrl: "/c.mp3" },
  { id: "hip-hop", genre: "Hip-Hop", releaseDate: "2026-07-15", coverUrl: "/d.jpg", audioUrl: "/d.mp3" }
];

test("opening of the day is stable during the same date and prefers complete releases", () => {
  const first = getDailySceneRelease(releases, new Date("2026-07-18T01:00:00.000Z"));
  const second = getDailySceneRelease(releases, new Date("2026-07-18T22:00:00.000Z"));
  assert.equal(first?.id, second?.id);
  assert.ok(first?.audioUrl);
  assert.ok(first?.coverUrl);
});

test("underrated release has the lowest weekly score and excludes promoted cards", () => {
  const result = getUnderratedSceneRelease(releases, {
    "pop-new": { weeklyScore: 8, todayPlaylistCount: 2 },
    "pop-old": { weeklyScore: 1, todayPlaylistCount: 0 },
    "hip-hop": { weeklyScore: 0, todayPlaylistCount: 0 }
  }, ["hip-hop"]);
  assert.equal(result?.id, "pop-old");
});

test("similar mood puts the same genre first and limits the result", () => {
  assert.deepEqual(
    getSimilarMoodReleases(releases, "pop-new", 2).map((release) => release.id),
    ["pop-old", "hip-hop"]
  );
});

test("queue skips releases without previews and wraps around", () => {
  assert.equal(getNextPlayableRelease(releases, "pop-new")?.id, "pop-old");
  assert.equal(getNextPlayableRelease(releases, "hip-hop")?.id, "pop-new");
});

test("weekly leader uses unique listeners and then release freshness as tie-breakers", () => {
  const byListeners = getWeeklySceneLeader(releases, {
    "pop-new": { weeklyScore: 5, weeklyUniqueListeners: 3, todayPlaylistCount: 0 },
    "pop-old": { weeklyScore: 5, weeklyUniqueListeners: 4, todayPlaylistCount: 0 }
  });
  assert.equal(byListeners?.id, "pop-old");

  const byFreshness = getWeeklySceneLeader(releases, {
    "pop-new": { weeklyScore: 5, weeklyUniqueListeners: 4, todayPlaylistCount: 0 },
    "pop-old": { weeklyScore: 5, weeklyUniqueListeners: 4, todayPlaylistCount: 0 }
  });
  assert.equal(byFreshness?.id, "pop-new");
});

test("scene search finds artists and release titles without depending on case or spacing", () => {
  const searchableReleases = [
    { ...releases[0], title: "Последний танец", artist: "OBS1D1AN" },
    { ...releases[1], title: "Ночной город", artist: "Марсель" }
  ];

  assert.deepEqual(
    searchSceneReleases(searchableReleases, "  obs1d1an  ").map((release) => release.id),
    ["pop-new"]
  );
  assert.deepEqual(
    searchSceneReleases(searchableReleases, "ПОСЛЕДНИЙ танец").map((release) => release.id),
    ["pop-new"]
  );
  assert.deepEqual(
    searchSceneReleases(searchableReleases, "марсель город").map((release) => release.id),
    ["rock"]
  );
  assert.equal(searchSceneReleases(searchableReleases, "неизвестный").length, 0);
  assert.equal(searchSceneReleases(searchableReleases, "").length, searchableReleases.length);
});
