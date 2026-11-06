import assert from "node:assert/strict";
import test from "node:test";

import {
  countCatalogOverlap,
  normalizeMatchText,
  pickAlbumMatch,
  scoreAlbumMatch,
  type PlatformAlbum,
  type ReleaseForMatching
} from "../platform-link-matching";
import { parseArtistProfileUrl } from "../platform-catalog-providers";

const release: ReleaseForMatching = {
  title: "Холодно (feat. Mira)",
  artistNames: ["ZAYRO", "Mira"],
  releaseDate: "2026-10-24",
  trackCount: 1
};

function album(overrides: Partial<PlatformAlbum>): PlatformAlbum {
  return {
    platform: "yandex_music",
    externalId: "1",
    title: "Холодно",
    artists: [{ id: "10", name: "ZAYRO" }],
    releaseDate: "2026-10-24",
    trackCount: 1,
    url: "https://music.yandex.ru/album/1",
    coverUrl: null,
    upc: null,
    ...overrides
  };
}

test("normalizeMatchText drops feat, punctuation and ё", () => {
  assert.equal(normalizeMatchText("Холодно (feat. Mira)"), "холодно");
  assert.equal(normalizeMatchText("Ёлка - Single"), "елка");
  assert.equal(normalizeMatchText("Ночной район [prod. by X]"), "ночной район");
});

test("an exact album in the artist profile is saved without asking", () => {
  const result = pickAlbumMatch(release, [album({}), album({ externalId: "2", title: "Другой", url: "u2" })]);
  assert.equal(result.decision, "auto");
  assert.equal(result.matches[0].album.externalId, "1");
});

test("a same-title album with a different date and track count goes to review", () => {
  const result = pickAlbumMatch(release, [album({ releaseDate: "2024-01-01", trackCount: 3 })]);
  assert.equal(result.decision, "review");
});

test("two equally good candidates (sped up re-upload) are not saved automatically", () => {
  const result = pickAlbumMatch(release, [album({}), album({ externalId: "2", url: "u2" })]);
  assert.equal(result.decision, "review");
  assert.equal(result.matches.length, 2);
});

test("rejected candidates are never offered again", () => {
  const result = pickAlbumMatch(release, [album({})], ["https://music.yandex.ru/album/1"]);
  assert.equal(result.decision, "none");
});

test("feat where another artist is the main one is flagged in the checks", () => {
  const match = scoreAlbumMatch(release, album({ artists: [{ id: "20", name: "Mira" }, { id: "10", name: "ZAYRO" }] }));
  const artists = match.checks.find((check) => check.field === "artists");
  assert.equal(artists?.ok, null);
  assert.match(artists?.note ?? "", /Mira/u);
});

test("countCatalogOverlap counts the artist's titles found in a profile", () => {
  assert.equal(countCatalogOverlap(["Холодно", "Ночной район", "Нет такого"], [album({}), album({ title: "Ночной район" })]), 2);
});

test("parseArtistProfileUrl reads profile ids and rejects other links", () => {
  assert.deepEqual(parseArtistProfileUrl("yandex_music", "music.yandex.ru/artist/123?utm=1"), {
    externalId: "123",
    url: "https://music.yandex.ru/artist/123"
  });
  assert.equal(parseArtistProfileUrl("yandex_music", "https://music.yandex.ru/album/123")?.externalId, undefined);
  assert.equal(parseArtistProfileUrl("spotify", "https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb")?.externalId, "4Z8W4fKeB5YxbusRsdQVPb");
  assert.equal(parseArtistProfileUrl("vk_music", "https://vk.com/artist/zayro")?.externalId, "zayro");
});

test("mergeArtistCandidates glues one artist across platforms by shared releases and keeps namesakes apart", async () => {
  const { mergeArtistCandidates } = await import("../platform-link-discovery-service");
  const artist = (platform: string, id: string, name = "LORO") => ({
    platform, externalId: id, name, url: `https://x/${platform}/${id}`, imageUrl: null, hint: null, latestRelease: null
  });
  const entries = mergeArtistCandidates([
    { artist: artist("yandex_music", "1"), titles: ["Лето", "Зима"] },
    { artist: artist("yandex_music", "2"), titles: ["Samba"] },
    { artist: artist("apple_music", "10"), titles: ["Зима - Single"] },
    { artist: artist("deezer", "20"), titles: ["Samba"] },
    { artist: artist("deezer", "21"), titles: ["Другое"] }
  ]);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries[0].profiles.map((p) => p.externalId).sort(), ["1", "10"]);
  assert.deepEqual(entries.find((e) => e.key === "yandex_music:2")?.profiles.map((p) => p.externalId), ["2", "20"]);
});
