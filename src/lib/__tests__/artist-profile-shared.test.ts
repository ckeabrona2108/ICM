import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtistProfileSlug,
  extractArtistPublicNames,
  normalizeArtistProfileKey,
  parseArtistProfileUserId
} from "@/lib/artist-profile-shared";

test("artist profile slug transliterates the name and preserves a reversible user id", () => {
  const userId = "550e8400-e29b-41d4-a716-446655440000";
  const slug = buildArtistProfileSlug("Последний танец", userId);
  assert.equal(slug, "posledniy-tanec-550e8400e29b41d4a716446655440000");
  assert.equal(parseArtistProfileUserId(slug), userId);
});

test("legal names with aliases expose only public artist nicknames", () => {
  assert.deepEqual(
    extractArtistPublicNames("Шведов Андрей Александрович(YUNG$HVED) Ульянов Иван Иванович(Evianway)"),
    ["YUNG$HVED", "Evianway"]
  );
  assert.deepEqual(
    extractArtistPublicNames("Шведов Андрей Александрович/YUNG$HVED Ульянов Иван Иванович/Evianway"),
    ["YUNG$HVED", "Evianway"]
  );
});

test("invalid artist slug does not resolve to a user", () => {
  assert.equal(parseArtistProfileUserId("artist-without-user"), null);
});

test("artist profile key normalizes case and whitespace without merging different artists", () => {
  assert.equal(normalizeArtistProfileKey("  Obs1D1an  "), "obs1d1an");
  assert.notEqual(normalizeArtistProfileKey("obs1d1an"), normalizeArtistProfileKey("another artist"));
});
