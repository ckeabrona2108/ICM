import assert from "node:assert/strict";
import test from "node:test";

import {
  ARTIST_PROFILE_TYPE_OPTIONS,
  artistProfileTypeLabel,
  normalizeArtistProfileType
} from "@/lib/artist-profile-type";
import { artistProfileInputSchema } from "@/lib/artist-profile-service";
import { readFileSync } from "node:fs";

test("normalizeArtistProfileType preserves supported values", () => {
  assert.equal(normalizeArtistProfileType("artist"), "artist");
  assert.equal(normalizeArtistProfileType("group"), "group");
  assert.equal(normalizeArtistProfileType("label"), "label");
  assert.equal(normalizeArtistProfileType("producer"), "producer");
});

test("normalizeArtistProfileType falls back to artist", () => {
  assert.equal(normalizeArtistProfileType(undefined), "artist");
  assert.equal(normalizeArtistProfileType(null), "artist");
  assert.equal(normalizeArtistProfileType("unknown"), "artist");
});

test("producer label is preserved across social surfaces", () => {
  assert.equal(artistProfileTypeLabel("producer"), "Продюсер");
  assert.equal(artistProfileTypeLabel("group"), "Группа");
});

test("artist profile type options expose all registration choices", () => {
  assert.deepEqual(
    ARTIST_PROFILE_TYPE_OPTIONS.map((option) => option.value),
    ["artist", "group", "label", "producer"]
  );
});

test("producer is accepted by managed profile validation and persistence migration", () => {
  const parsed = artistProfileInputSchema.safeParse({
    enabled: true,
    profileType: "producer",
    displayName: "Pulsecraft",
    bio: "",
    city: "",
    avatarKey: "",
    backgroundKey: "",
    catalogReleaseIds: [],
    hideAllCommunityReleases: false,
    hiddenCommunityReleaseIds: [],
    autoPublishApprovedReleases: false,
    websiteUrl: "",
    vkUrl: "",
    telegramUrl: "",
    collaboration: {
      open: true,
      role: "producer",
      genres: [],
      intents: [],
      preference: "hybrid",
      bio: ""
    }
  });
  assert.equal(parsed.success, true);

  const migration = readFileSync(
    "prisma/migrations/20260722003000_add_user_artist_profile_type/migration.sql",
    "utf8"
  );
  assert.match(migration, /'producer'/u);
});
