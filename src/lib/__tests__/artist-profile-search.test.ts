import assert from "node:assert/strict";
import test from "node:test";

import type { PublicArtistProfileCard } from "@/lib/artist-profile-service";
import { rankPublicArtistProfiles } from "@/lib/artist-profile-service";

function card(params: {
  displayName: string;
  slug?: string;
  profileType?: PublicArtistProfileCard["profileType"];
  city?: string;
  bio?: string;
  genres?: string[];
  releaseTitles?: string[];
}): PublicArtistProfileCard {
  return {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    slug: params.slug ?? params.displayName.toLowerCase().replace(/\s+/g, "-"),
    displayName: params.displayName,
    profileType: params.profileType ?? "artist",
    city: params.city ?? "",
    bio: params.bio ?? "",
    genres: params.genres ?? [],
    avatarUrl: null,
    releaseCount: Math.max(params.releaseTitles?.length ?? 0, 1),
    releaseTitles: params.releaseTitles ?? [],
    collaborationOpen: false,
    collaborationRole: null,
    displayRole: null,
    portfolio: [],
    featuredRank: null
  };
}

test("artist search suggests a profile by a partial name", () => {
  const result = rankPublicArtistProfiles([
    card({ displayName: "Another Artist" }),
    card({ displayName: "Tripowy", releaseTitles: ["Night Drive"] }),
    card({ displayName: "Trio", releaseTitles: ["Morning"] })
  ], "Tri");

  assert.deepEqual(result.map((item) => item.displayName), ["Trio", "Tripowy"]);
});

test("artist search also finds releases and limits initial recommendations", () => {
  const cards = Array.from({ length: 20 }, (_, index) => card({
    displayName: `Artist ${index}`,
    releaseTitles: [`Release ${index}`]
  }));
  assert.equal(rankPublicArtistProfiles(cards, "", 15).length, 15);
  assert.deepEqual(
    rankPublicArtistProfiles(cards, "Release 12").map((item) => item.displayName),
    ["Artist 12"]
  );
});

test("artist search finds profiles without posts by group type, slug and genre", () => {
  const result = rankPublicArtistProfiles([
    card({
      displayName: "Aurora Signals",
      slug: "aurora-signals-u1",
      profileType: "group",
      genres: ["Synthwave"],
      city: "Seville",
      releaseTitles: ["Night Parade"]
    }),
    card({
      displayName: "Northline Records",
      slug: "northline-records-u2",
      profileType: "label",
      genres: ["Indie"],
      releaseTitles: ["Summer Lights"]
    })
  ], "synth");

  assert.deepEqual(result.map((item) => item.displayName), ["Aurora Signals"]);
  assert.equal(rankPublicArtistProfiles(result, "group")[0]?.profileType, "group");
  assert.equal(rankPublicArtistProfiles(result, "aurora-signals")[0]?.slug, "aurora-signals-u1");
});

test("artist search supports cyrillic city and bio matches", () => {
  const result = rankPublicArtistProfiles([
    card({
      displayName: "Ckeabrona",
      city: "Madrid",
      bio: "Эмоциональный поп-артист с короткими релизными историями",
      genres: ["Pop"],
      releaseTitles: ["Последний танец"]
    }),
    card({
      displayName: "Pulsecraft",
      city: "Barcelona",
      bio: "Продюсер и саунд-дизайнер",
      genres: ["Electronic"],
      releaseTitles: ["Signal Bloom"]
    })
  ], "эмоциональный");

  assert.deepEqual(result.map((item) => item.displayName), ["Ckeabrona"]);
  assert.deepEqual(rankPublicArtistProfiles([
    card({ displayName: "Ckeabrona", city: "Мадрид", genres: ["Pop"] })
  ], "мадрид").map((item) => item.displayName), ["Ckeabrona"]);
});
