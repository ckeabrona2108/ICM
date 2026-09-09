import assert from "node:assert/strict";
import test from "node:test";

import type { PrismaClient } from "@prisma/client";

import { buildArtistProfileSlug, normalizeArtistProfileKey } from "@/lib/artist-profile-shared";
import {
  artistProfileInputSchema,
  getPublicArtistProfile,
  getUserArtistProfileSettings,
  listPublicArtistProfiles,
  resolvePublicArtistReleaseNames,
  saveUserArtistProfileSettings,
  setAdminArtistProfileVisibility
} from "@/lib/artist-profile-service";

const userId = "550e8400-e29b-41d4-a716-446655440000";

test("profile links are optional and null-like values become empty", () => {
  const settings = artistProfileInputSchema.parse({
    enabled: true,
    profileType: "artist",
    displayName: "Artist",
    bio: "",
    city: "",
    avatarKey: "",
    catalogReleaseIds: [],
    websiteUrl: null,
    vkUrl: "null",
    telegramUrl: " undefined "
  });

  assert.equal(settings.websiteUrl, "");
  assert.equal(settings.vkUrl, "");
  assert.equal(settings.telegramUrl, "");
});

test("artist profile uses its public nickname instead of legacy legal credits", () => {
  assert.deepEqual(resolvePublicArtistReleaseNames({
    profileType: "artist",
    profileDisplayName: "FATAL'",
    performer: "Лебедева Татьяна Эдуардовна",
    roles: {}
  }), ["FATAL'"]);
});

function makeRelease(params: {
  id: string;
  title: string;
  artist: string;
  date?: Date;
  status?: string;
  confirmed?: boolean;
  upc?: string | null;
  roles?: Record<string, unknown>;
}) {
  return {
    id: params.id,
    title: params.title,
    date: params.date ?? new Date("2026-07-01T00:00:00.000Z"),
    startDate: new Date("2026-06-01T00:00:00.000Z"),
    preview: "jpg",
    performer: params.artist,
    genre: "Pop",
    status: params.status ?? "moderating",
    confirmed: params.confirmed ?? true,
    upc: params.upc === undefined ? `upc-${params.id}` : params.upc,
    roles: params.roles ?? {
      lifecycleState: "approved",
      submissionData: {
        persons: [{ role: "исполнитель", name: params.artist }]
      }
    }
  };
}

function makePrisma(releases = [
  makeRelease({ id: "release-obs", title: "Obsidian song", artist: "obs1d1an" }),
  makeRelease({ id: "release-other", title: "Other song", artist: "Another Artist" })
], ownerId = userId) {
  const updates: Array<{ id: string; roles: unknown }> = [];
  const user = {
    id: ownerId,
    name: "Label Account",
    avatar: "webp",
    personalSiteUrl: null,
    vk: null,
    telegram: null,
    release: releases
  };
  const prisma = {
    user: {
      findUnique: async () => user,
      findMany: async () => [user]
    },
    release: {
      findMany: async () => releases.map(({ id, title, date, performer, roles }) => ({ id, title, date, performer, roles })),
      update: async ({ where, data }: { where: { id: string }; data: { roles: unknown } }) => {
        updates.push({ id: where.id, roles: data.roles });
        const release = releases.find((item) => item.id === where.id);
        if (release) release.roles = data.roles as Record<string, unknown>;
        return { id: where.id };
      }
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations)
  } as unknown as PrismaClient;
  return { prisma, updates };
}

test("account releases are split into independent artist profiles", async () => {
  const { prisma } = makePrisma();
  const result = await getUserArtistProfileSettings(prisma, userId);

  assert.deepEqual(
    result?.profiles.map((profile) => ({ name: profile.sourceName, count: profile.releaseCount })),
    [
      { name: "obs1d1an", count: 1 },
      { name: "Another Artist", count: 1 }
    ]
  );
});

test("generic ICECREAMMUSIC performer uses the account name instead of the release title", async () => {
  const { prisma } = makePrisma([
    makeRelease({
      id: "release-ckeabrona",
      title: "Ckeabrona - Gang",
      artist: "Исполнитель ICECREAMMUSIC"
    }),
    makeRelease({
      id: "release-tripowy",
      title: "Tripowy - Night",
      artist: "Исполнитель ICECREAMMUSIC"
    })
  ]);
  const result = await getUserArtistProfileSettings(prisma, userId);

  assert.deepEqual(
    result?.profiles.map((profile) => profile.sourceName),
    ["Label Account"]
  );
});

test("curated label account exposes one profile with its full release catalog", async () => {
  const labelUserId = "4bcc66de-05de-4f4f-aaef-acff7dac8268";
  const { prisma } = makePrisma(undefined, labelUserId);
  const result = await getUserArtistProfileSettings(prisma, labelUserId);

  assert.equal(result?.profiles.length, 1);
  assert.equal(result?.profiles[0]?.settings.profileType, "label");
  assert.equal(result?.profiles[0]?.releaseCount, 2);
});

test("curated group account exposes one profile with its full release catalog", async () => {
  const groupUserId = "41497f8b-2e62-4f8d-8613-abadc15d9d5a";
  const { prisma } = makePrisma(undefined, groupUserId);
  const result = await getUserArtistProfileSettings(prisma, groupUserId);

  assert.equal(result?.profiles.length, 1);
  assert.equal(result?.profiles[0]?.settings.profileType, "group");
  assert.equal(result?.profiles[0]?.releaseCount, 2);
});

test("composer release options include only approved releases for community attachment", async () => {
  const draftRelease = makeRelease({
    id: "release-draft",
    title: "Draft song",
    artist: "Draft Artist",
    confirmed: false,
    upc: null,
    status: "draft",
    roles: {}
  });
  const approvedRelease = makeRelease({
    id: "release-approved",
    title: "Approved song",
    artist: "Approved Artist",
    date: new Date("2026-08-10T00:00:00.000Z")
  });
  const { prisma } = makePrisma([draftRelease, approvedRelease]);

  const result = await getUserArtistProfileSettings(prisma, userId);

  assert.deepEqual(result?.releases.map((release) => release.id), ["release-approved"]);
});

test("artist profile settings fall back to legacy user storage when canonical user table is missing", async () => {
  const releases = [makeRelease({ id: "release-obs", title: "Obsidian song", artist: "obs1d1an" })];
  const legacyRow = {
    id: userId,
    name: "Legacy Label",
    email: "legacy@example.com",
    password: null,
    avatar: "webp",
    role: "USER",
    artistProfileType: "artist",
    aiTokenBalance: 0,
    aiPendingTokenBalance: 0
  };
  const prisma = {
    user: {
      findUnique: async () => {
        throw new Error("The table `icecream.user` does not exist in the current database.");
      }
    },
    release: {
      findMany: async () => releases.map(({ id, title, date, performer, roles }) => ({ id, title, date, performer, roles }))
    },
    $queryRaw: async () => [legacyRow]
  } as unknown as PrismaClient;

  const result = await getUserArtistProfileSettings(prisma, userId);

  assert.equal(result?.profiles[0]?.sourceName, "obs1d1an");
  assert.equal(result?.profiles[0]?.avatarUrl, `/api/uploads/object/avatars/${userId}.webp`);
});

test("public personal profile falls back to legacy user storage when canonical user table is missing", async () => {
  const legacyRow = {
    id: userId,
    name: "Legacy Label",
    email: "legacy@example.com",
    password: null,
    avatar: "webp",
    role: "USER",
    artistProfileType: "producer",
    aiTokenBalance: 0,
    aiPendingTokenBalance: 0
  };
  const prisma = {
    user: {
      findUnique: async () => {
        throw new Error("The table `icecream.user` does not exist in the current database.");
      }
    },
    $queryRaw: async () => [legacyRow]
  } as unknown as PrismaClient;

  const profile = await getPublicArtistProfile(
    prisma,
    `user-legacy-label-${userId.replace(/-/gu, "")}`
  );

  assert.equal(profile?.artistKey, "__personal__");
  assert.equal(profile?.displayName, "Legacy Label");
  assert.equal(profile?.profileType, "producer");
  assert.equal(profile?.avatarUrl, `/api/uploads/object/avatars/${userId}.webp`);
});

test("public personal profile degrades without releases when canonical release table is missing", async () => {
  const prisma = {
    user: {
      findUnique: async ({ select }: { select: Record<string, unknown> }) => {
        if (select.release) {
          throw new Error("The table `icecream.release` does not exist in the current database.");
        }
        return {
          id: userId,
          name: "Label Account",
          avatar: "webp",
          emailVerified: null,
          personalSiteUrl: null,
          vk: null,
          telegram: null,
          artistProfileType: "artist"
        };
      }
    }
  } as unknown as PrismaClient;

  const profile = await getPublicArtistProfile(
    prisma,
    `user-label-account-${userId.replace(/-/gu, "")}`
  );

  assert.equal(profile?.artistKey, "__personal__");
  assert.equal(profile?.displayName, "Label Account");
  assert.deepEqual(profile?.releases, []);
});

test("public artist profile contains only releases credited to that artist", async () => {
  const { prisma } = makePrisma();
  const profile = await getPublicArtistProfile(
    prisma,
    buildArtistProfileSlug("obs1d1an", userId),
    new Date("2026-07-18T00:00:00.000Z"),
    {
      resolveCoverUrl: async () => `/api/uploads/object/previews/release-obs.jpg`,
      listReleaseAnalytics: async () => []
    }
  );

  assert.equal(profile?.displayName, "obs1d1an");
  assert.equal(profile?.artistKey, normalizeArtistProfileKey("obs1d1an"));
  assert.deepEqual(profile?.releases.map((release) => release.title), ["Obsidian song"]);
  assert.deepEqual(profile?.releases[0]?.coverUrlCandidates, [
    "/api/uploads/object/previews/release-obs.jpg"
  ]);
  assert.equal(profile?.avatarUrl, `/api/uploads/object/avatars/${userId}.webp`);
});

test("public profile uses analytics streams and marks the top release", async () => {
  const { prisma } = makePrisma();
  const profile = await getPublicArtistProfile(
    prisma,
    buildArtistProfileSlug("obs1d1an", userId),
    new Date("2026-07-18T00:00:00.000Z"),
    {
      resolveCoverUrl: async () => null,
      listReleaseAnalytics: async () => [{
        release_id: "release-obs",
        title: "Obsidian song",
        artist: "obs1d1an",
        upc: "upc-release-obs",
        streams: 5000,
        pay_streams: 0,
        changePercent: null,
        trend: "flat"
      }]
    }
  );

  assert.equal(profile?.releases[0]?.playCount, 5000);
  assert.equal(profile?.releases[0]?.isTopRelease, true);
});

test("public artist directory returns compact people data and filters by role and profile type", async () => {
  const { prisma } = makePrisma();
  const artistKey = normalizeArtistProfileKey("obs1d1an");

  await saveUserArtistProfileSettings(prisma, userId, artistKey, {
    profileType: "artist",
    enabled: true,
    displayName: "obs1d1an",
    slug: "",
    bio: "Producer for demos",
    city: "Madrid",
    avatarKey: "",
    backgroundKey: "",
    catalogReleaseIds: ["release-obs"],
    hideAllCommunityReleases: false,
    hiddenCommunityReleaseIds: [],
    autoPublishApprovedReleases: false,
    websiteUrl: "",
    vkUrl: "",
    telegramUrl: "",
    collaboration: {
      open: true,
      role: "producer",
      genres: ["Pop"],
      intents: ["find_artist"],
      preference: "remote",
      bio: "Open for features"
    }
  });

  const cards = await listPublicArtistProfiles(prisma, {
    query: "producer",
    profileType: "artist",
    collaborationRole: "producer",
    limit: 10
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.collaborationOpen, true);
  assert.equal(cards[0]?.collaborationRole, "producer");
  assert.equal(cards[0]?.displayRole, "Продюсер");
  assert.equal(cards[0]?.portfolio.length, 1);
  assert.equal(cards[0]?.portfolio[0]?.title, "Obsidian song");
});

test("public profile can skip analytics in feed-style runtime paths", async () => {
  const { prisma } = makePrisma();
  let analyticsCalled = false;
  const profile = await getPublicArtistProfile(
    prisma,
    buildArtistProfileSlug("obs1d1an", userId),
    new Date("2026-07-18T00:00:00.000Z"),
    {
      resolveCoverUrl: async () => null,
      includeReleaseAnalytics: false,
      listReleaseAnalytics: async () => {
        analyticsCalled = true;
        throw new Error("analytics should not run");
      }
    }
  );

  assert.equal(analyticsCalled, false);
  assert.equal(profile?.releases[0]?.playCount, 0);
});

test("public profile prefers current track audio over a stale submission snapshot", async () => {
  const releases = [makeRelease({
    id: "release-replaced-audio",
    title: "Updated song",
    artist: "Updated Artist"
  })];
  releases[0]!.roles = {
    ...releases[0]!.roles,
    submissionData: {
      tracks: [{ id: "track-1", audioFile: "audios/old.wav" }]
    }
  };
  Object.assign(releases[0]!, {
    track: [{
      id: "track-1",
      index: 1,
      title: "Updated song",
      track: "wav",
      roles: { audioFile: "tracks/track-1/new.wav" }
    }]
  });
  const { prisma } = makePrisma(releases);
  let resolvedAudioFile: unknown = null;

  const profile = await getPublicArtistProfile(
    prisma,
    buildArtistProfileSlug("Updated Artist", userId),
    new Date("2026-07-18T00:00:00.000Z"),
    {
      resolveCoverUrl: async () => null,
      listReleaseAnalytics: async () => [],
      resolveTrackAudio: async (input) => {
        resolvedAudioFile = input.audioFile;
        return {
          storageKey: "tracks/track-1/new.wav",
          url: "/api/uploads/object/tracks/track-1/new.wav",
          downloadUrl: null,
          candidateUrls: ["/api/uploads/object/tracks/track-1/new.wav"],
          source: "exact"
        };
      }
    }
  );

  assert.equal(resolvedAudioFile, "tracks/track-1/new.wav");
  assert.equal(profile?.releases[0]?.audioUrl, "/api/uploads/object/tracks/track-1/new.wav");
});

test("requested artist slug is hidden until an admin explicitly publishes it", async () => {
  const hiddenUserId = "7a34f51f-ea1e-43ed-86e2-3a8bac736b50";
  const releases = [makeRelease({ id: "release-hidden", title: "Hidden release", artist: "1" })];
  const { prisma } = makePrisma(releases, hiddenUserId);
  const slug = buildArtistProfileSlug("1", hiddenUserId);

  assert.equal(slug, "1-7a34f51fea1e43ed86e23a8bac736b50");
  assert.equal(await getPublicArtistProfile(prisma, slug), null);

  await setAdminArtistProfileVisibility(
    prisma,
    hiddenUserId,
    normalizeArtistProfileKey("1"),
    false
  );

  assert.equal((await getPublicArtistProfile(
    prisma,
    slug,
    new Date("2026-07-18T00:00:00.000Z"),
    { listReleaseAnalytics: async () => [] }
  ))?.displayName, "1");
});

test("admin visibility setting hides an existing public artist without deleting releases", async () => {
  const releases = [makeRelease({ id: "release-admin-hidden", title: "Song", artist: "Artist" })];
  const { prisma, updates } = makePrisma(releases);
  const artistKey = normalizeArtistProfileKey("Artist");
  const slug = buildArtistProfileSlug("Artist", userId);

  await setAdminArtistProfileVisibility(prisma, userId, artistKey, true);

  assert.equal(updates.length, 1);
  assert.equal(await getPublicArtistProfile(prisma, slug), null);
  assert.equal(releases.length, 1);
});

test("profile avatar overrides the account avatar", async () => {
  const releases = [makeRelease({ id: "release-avatar", title: "Avatar song", artist: "Avatar Artist" })];
  releases[0]!.roles = {
    ...releases[0]!.roles,
    artistPublicProfiles: {
      [normalizeArtistProfileKey("Avatar Artist")]: {
        enabled: true,
        profileType: "artist",
        displayName: "Avatar Artist",
        bio: "",
        city: "",
        avatarKey: `artist-profiles/${userId}/artist.webp`,
        catalogReleaseIds: ["release-avatar"],
        websiteUrl: "",
        vkUrl: "",
        autoPublishApprovedReleases: false,
        telegramUrl: "",
        collaboration: {
          open: false,
          role: "label",
          genres: [],
          intents: [],
          preference: "hybrid",
          bio: ""
        }
      }
    }
  };
  const { prisma } = makePrisma(releases);
  const profile = await getPublicArtistProfile(
    prisma,
    buildArtistProfileSlug("Avatar Artist", userId),
    new Date("2026-07-18T00:00:00.000Z"),
    {
      resolveCoverUrl: async () => null,
      listReleaseAnalytics: async () => []
    }
  );

  assert.equal(profile?.avatarUrl, `/api/uploads/object/artist-profiles/${userId}/artist.webp`);
});

test("saving one artist profile does not overwrite releases of another artist", async () => {
  const { prisma, updates } = makePrisma();
  const artistKey = normalizeArtistProfileKey("obs1d1an");

  await saveUserArtistProfileSettings(prisma, userId, artistKey, {
    enabled: true,
    profileType: "artist",
    displayName: "OBS1D1AN",
    slug: "obs1d1an",
    bio: "Artist bio",
    city: "Moscow",
    avatarKey: "",
    backgroundKey: "",
    catalogReleaseIds: ["release-obs"],
    hideAllCommunityReleases: false,
    hiddenCommunityReleaseIds: [],
    websiteUrl: "",
    vkUrl: "",
    autoPublishApprovedReleases: false,
    telegramUrl: "",
    collaboration: {
      open: false,
      role: "artist",
      genres: [],
      intents: [],
      preference: "hybrid",
      bio: ""
    }
  });

  assert.deepEqual(updates.map((update) => update.id), ["release-obs"]);
});

test("artist profile rejects a release credited only to another artist", async () => {
  const { prisma } = makePrisma();
  await assert.rejects(
    saveUserArtistProfileSettings(prisma, userId, normalizeArtistProfileKey("obs1d1an"), {
      enabled: true,
      profileType: "artist",
      displayName: "OBS1D1AN",
      slug: "obs1d1an",
      bio: "",
      city: "",
      avatarKey: "",
      backgroundKey: "",
      catalogReleaseIds: ["release-other"],
      hideAllCommunityReleases: false,
      hiddenCommunityReleaseIds: [],
      websiteUrl: "",
      vkUrl: "",
      autoPublishApprovedReleases: false,
      telegramUrl: "",
      collaboration: {
        open: false,
        role: "artist",
        genres: [],
        intents: [],
        preference: "hybrid",
        bio: ""
      }
    }),
    /ARTIST_PROFILE_OWN_RELEASES_ONLY/u
  );
});

test("label profile accepts releases from different artists", async () => {
  const { prisma, updates } = makePrisma();
  await saveUserArtistProfileSettings(prisma, userId, normalizeArtistProfileKey("obs1d1an"), {
    enabled: true,
    profileType: "label",
    displayName: "ICM Label",
    slug: "icm-label",
    bio: "",
    city: "",
    avatarKey: `artist-profiles/${userId}/profile.webp`,
    backgroundKey: "",
    catalogReleaseIds: ["release-obs", "release-other"],
    hideAllCommunityReleases: false,
    hiddenCommunityReleaseIds: [],
    websiteUrl: "",
    vkUrl: "",
    autoPublishApprovedReleases: false,
    telegramUrl: "",
    collaboration: {
      open: false,
      role: "artist",
      genres: [],
      intents: [],
      preference: "hybrid",
      bio: ""
    }
  });
  assert.deepEqual(updates.map((update) => update.id), ["release-obs"]);
});

test("public label catalog includes explicitly selected releases from different artists", async () => {
  const releases = [
    makeRelease({ id: "release-label", title: "Label owner", artist: "Label Artist" }),
    makeRelease({ id: "release-guest", title: "Guest release", artist: "Guest Artist" })
  ];
  releases[0]!.roles = {
    ...releases[0]!.roles,
    artistPublicProfiles: {
      [normalizeArtistProfileKey("Label Artist")]: {
        enabled: true,
        profileType: "label",
        displayName: "Label Catalog",
        slug: "label-catalog",
        bio: "",
        city: "",
        avatarKey: `artist-profiles/${userId}/label.webp`,
        backgroundKey: "",
        catalogReleaseIds: releases.map((release) => release.id),
        websiteUrl: "",
        vkUrl: "",
        autoPublishApprovedReleases: false,
        telegramUrl: "",
        collaboration: {
          open: false,
          role: "label",
          genres: [],
          intents: [],
          preference: "hybrid",
          bio: ""
        }
      }
    }
  };
  const { prisma } = makePrisma(releases);
  const profile = await getPublicArtistProfile(
    prisma,
    buildArtistProfileSlug("Label Artist", userId),
    new Date("2026-07-18T00:00:00.000Z"),
    { listReleaseAnalytics: async () => [] }
  );
  assert.equal(profile?.profileType, "label");
  assert.deepEqual(profile?.releases.map((release) => release.title), ["Label owner", "Guest release"]);
  assert.equal(profile?.avatarUrl, `/api/uploads/object/artist-profiles/${userId}/label.webp`);
});

test("group profile is limited to ten distinct artists", async () => {
  const releases = Array.from({ length: 11 }, (_, index) => makeRelease({
    id: `release-${index}`,
    title: `Release ${index}`,
    artist: index === 0 ? "Main Group" : `Guest ${index}`
  }));
  const { prisma } = makePrisma(releases);
  await assert.rejects(
    saveUserArtistProfileSettings(prisma, userId, normalizeArtistProfileKey("Main Group"), {
      enabled: true,
      profileType: "group",
      displayName: "Main Group",
      slug: "main-group",
      bio: "",
      city: "",
      avatarKey: "",
      backgroundKey: "",
      catalogReleaseIds: releases.map((release) => release.id),
      hideAllCommunityReleases: false,
      hiddenCommunityReleaseIds: [],
      websiteUrl: "",
      vkUrl: "",
      autoPublishApprovedReleases: false,
      telegramUrl: "",
      collaboration: {
        open: false,
        role: "artist",
        genres: [],
        intents: [],
        preference: "hybrid",
        bio: ""
      }
    }),
    /ARTIST_PROFILE_GROUP_LIMIT/u
  );
});


test("artist profile persists collaboration settings", async () => {
  const { prisma, updates } = makePrisma();
  const artistKey = normalizeArtistProfileKey("obs1d1an");

  await saveUserArtistProfileSettings(prisma, userId, artistKey, {
    enabled: true,
    profileType: "artist",
    displayName: "OBS1D1AN",
    slug: "obs1d1an",
    bio: "Artist bio",
    city: "Moscow",
    avatarKey: "",
    backgroundKey: "",
    catalogReleaseIds: ["release-obs"],
    hideAllCommunityReleases: false,
    hiddenCommunityReleaseIds: [],
    websiteUrl: "",
    vkUrl: "",
    autoPublishApprovedReleases: false,
    telegramUrl: "",
    collaboration: {
      open: true,
      role: "artist",
      genres: ["pop", "dance"],
      intents: ["find_producer", "feature"],
      preference: "remote",
      bio: "Ищу продюсера и фиты"
    }
  });

  const roles = updates[0]?.roles as Record<string, unknown> | undefined;
  const profiles = roles?.artistPublicProfiles as Record<string, { collaboration?: unknown }> | undefined;
  const saved = profiles?.[artistKey]?.collaboration as {
    open?: boolean;
    genres?: string[];
    intents?: string[];
    preference?: string;
  } | undefined;
  assert.equal(saved?.open, true);
  assert.deepEqual(saved?.genres, ["pop", "dance"]);
  assert.deepEqual(saved?.intents, ["find_producer", "feature"]);
  assert.equal(saved?.preference, "remote");
});
