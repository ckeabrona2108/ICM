/**
 * "Найти мои релизы": artist cards with confirmed platform profiles, release links found by UPC or in the
 * artist's discography, matches waiting for the artist, and the daily check that saved links still open.
 */
import { Prisma } from "@prisma/client";

import { normalizeArtistProfileKey } from "@/lib/artist-profile-shared";
import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import {
  checkPlatformAlbumAlive,
  DISCOGRAPHY_PLATFORMS,
  findPlatformAlbumByUpc,
  findYoutubeAlbums,
  isPlatformLookupConfigured,
  listPlatformDiscography,
  MANUAL_PROFILE_PLATFORMS,
  parseArtistProfileUrl,
  searchPlatformArtists,
  UPC_LOOKUP_PLATFORMS,
  type PlatformArtist
} from "@/lib/platform-catalog-providers";
import {
  countCatalogOverlap,
  normalizeArtistMatchName,
  normalizeMatchText,
  pickAlbumMatch,
  type AlbumMatch,
  type MatchCheck,
  type PlatformAlbum,
  type ReleaseForMatching
} from "@/lib/platform-link-matching";
import { prisma } from "@/lib/prisma";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { resolveSceneArtistNames } from "@/lib/scene-service";
import { normalizeSmartLinkUpc } from "@/lib/smart-link-autofill";
import { detectSmartLinkPlatform, getSmartLinkPlatformLabel } from "@/lib/smart-link-platforms";
import { isSmartLinkPrerelease } from "@/lib/smart-link-release-date";
import {
  clearPlatformLinkIfUnchanged,
  getSmartLinksByUser,
  readReleasePlatformLinks,
  saveDiscoveredPlatformLinks
} from "@/lib/smart-link-service";
import { normalizeSmartLinkHref } from "@/lib/smart-link-urls";

/** Columns of the "Найти мои релизы" table, in order. */
export const RELEASE_LINK_PLATFORMS = [
  "yandex_music",
  "vk_music",
  "zvuk_wink_music",
  "spotify",
  "apple_music",
  "youtube_music",
  "deezer"
] as const;

const PROFILE_PLATFORMS = [...DISCOGRAPHY_PLATFORMS, ...MANUAL_PROFILE_PLATFORMS];
const MAX_RELEASES_PER_RUN = 80;
const MAX_YOUTUBE_SEARCHES_PER_RUN = 20;
const HEALTH_CHECK_PLATFORMS = ["spotify", "apple_music", "deezer", "yandex_music"];
const HEALTH_RECHECK_MS = 24 * 60 * 60 * 1000;
const FAILURES_BEFORE_BROKEN = 2;

export type ProfileStatus = "confirmed" | "suggested" | "rejected";

export interface ArtistPlatformProfileView {
  id: string;
  platform: string;
  externalId: string;
  name: string;
  url: string;
  imageUrl: string | null;
  status: ProfileStatus;
  source: string;
  hint: string | null;
  latestRelease: string | null;
  overlap: number | null;
}

export interface ArtistCardView {
  profileKey: string;
  name: string;
  releaseCount: number;
  profiles: ArtistPlatformProfileView[];
}

export interface StoredCandidate {
  url: string;
  title: string;
  artists: string[];
  releaseDate: string | null;
  trackCount: number | null;
  coverUrl: string | null;
  score: number;
  checks: MatchCheck[];
}

export type ReleaseLinkCellState = "found" | "review" | "waiting" | "broken" | "upcoming" | "manual" | "none";

export interface ReleaseLinkCell {
  platform: string;
  state: ReleaseLinkCellState;
  url: string | null;
  candidates: StoredCandidate[];
}

export interface ReleaseLinksRow {
  releaseId: string;
  title: string;
  artist: string;
  coverUrl: string | null;
  upc: string | null;
  releaseDate: string;
  trackCount: number;
  cells: ReleaseLinkCell[];
}

export interface ReleaseLinksOverview {
  cards: ArtistCardView[];
  rows: ReleaseLinksRow[];
  configured: Record<string, boolean>;
}

type ReleaseRecord = {
  id: string;
  title: string;
  date: Date;
  upc: string | null;
  performer: string | null;
  roles: unknown;
  trackCount: number;
  artistNames: string[];
  cardKeys: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function mapLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    })
  );
  return results;
}

function toCandidate(match: AlbumMatch): StoredCandidate {
  return {
    url: match.album.url,
    title: match.album.title,
    artists: match.album.artists.map((artist) => artist.name).filter(Boolean),
    releaseDate: match.album.releaseDate,
    trackCount: match.album.trackCount,
    coverUrl: match.album.coverUrl,
    score: match.score,
    checks: match.checks
  };
}

function readCandidates(value: unknown): StoredCandidate[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item?.url)) as unknown as StoredCandidate[]
    : [];
}

function profileUrl(platform: string, id: string): string {
  switch (platform) {
    case "spotify":
      return `https://open.spotify.com/artist/${id}`;
    case "apple_music":
      return `https://music.apple.com/ru/artist/${id}`;
    case "deezer":
      return `https://www.deezer.com/artist/${id}`;
    case "yandex_music":
      return `https://music.yandex.ru/artist/${id}`;
    case "youtube_music":
      return `https://music.youtube.com/channel/${id}`;
    default:
      return "";
  }
}

// ---------- Loading ----------

async function loadApprovedReleases(userId: string): Promise<ReleaseRecord[]> {
  const releases = await prisma.release.findMany({
    where: { userId },
    select: {
      id: true,
      title: true,
      date: true,
      upc: true,
      performer: true,
      roles: true,
      status: true,
      confirmed: true,
      user: { select: { name: true } },
      _count: { select: { track: true } }
    },
    orderBy: { date: "desc" }
  });
  return releases
    .filter((release) => shouldTreatReleaseAsApproved({
      status: release.status,
      confirmed: release.confirmed,
      upc: release.upc,
      roles: release.roles
    }))
    .map((release) => {
      const artistNames = resolveSceneArtistNames({
        performer: release.performer,
        roles: release.roles,
        fallbackArtistName: release.user.name
      });
      return {
        id: release.id,
        title: release.title,
        date: release.date,
        upc: normalizeSmartLinkUpc(release.upc),
        performer: release.performer,
        roles: release.roles,
        trackCount: release._count.track,
        artistNames,
        cardKeys: Array.from(new Set(artistNames.map(normalizeArtistProfileKey)))
      };
    });
}

function toMatchingRelease(release: ReleaseRecord): ReleaseForMatching {
  return {
    title: release.title,
    artistNames: release.artistNames,
    releaseDate: toIsoDate(release.date),
    trackCount: release.trackCount
  };
}

function mapProfile(row: {
  id: string;
  platform: string;
  external_id: string;
  name: string;
  url: string;
  image_url: string | null;
  status: string;
  source: string;
  details: unknown;
}): ArtistPlatformProfileView {
  const details = asRecord(row.details);
  return {
    id: row.id,
    platform: row.platform,
    externalId: row.external_id,
    name: row.name,
    url: row.url,
    imageUrl: row.image_url,
    status: row.status as ProfileStatus,
    source: row.source,
    hint: typeof details?.hint === "string" ? details.hint : null,
    latestRelease: typeof details?.latestRelease === "string" ? details.latestRelease : null,
    overlap: typeof details?.overlap === "number" ? details.overlap : null
  };
}

export async function getArtistCards(userId: string, releases?: ReleaseRecord[]): Promise<ArtistCardView[]> {
  const list = releases ?? (await loadApprovedReleases(userId));
  const cards = new Map<string, ArtistCardView>();
  for (const release of list) {
    release.artistNames.forEach((name, index) => {
      const key = release.cardKeys[index] ?? normalizeArtistProfileKey(name);
      const card = cards.get(key) ?? { profileKey: key, name, releaseCount: 0, profiles: [] };
      card.releaseCount += 1;
      cards.set(key, card);
    });
  }
  const profiles = await prisma.artist_platform_profiles.findMany({
    where: { user_id: userId, status: { in: ["confirmed", "suggested"] } },
    orderBy: [{ status: "asc" }, { created_at: "asc" }]
  });
  for (const profile of profiles) {
    const card = cards.get(profile.profile_key);
    if (card) card.profiles.push(mapProfile(profile));
  }
  return Array.from(cards.values()).sort((left, right) => right.releaseCount - left.releaseCount);
}

// ---------- Profiles ----------

async function upsertProfile(params: {
  userId: string;
  profileKey: string;
  platform: string;
  externalId: string;
  name: string;
  url: string;
  imageUrl: string | null;
  status: ProfileStatus;
  source: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const where = {
    user_id_profile_key_platform_external_id: {
      user_id: params.userId,
      profile_key: params.profileKey,
      platform: params.platform,
      external_id: params.externalId
    }
  };
  const existing = await prisma.artist_platform_profiles.findUnique({ where, select: { status: true } });
  // The artist's own decision wins: never turn a rejected profile back into a suggestion,
  // and never downgrade a confirmed one.
  if (existing && (existing.status === "rejected" || existing.status === "confirmed") && params.status !== "confirmed") return;
  if (existing?.status === "rejected" && params.source !== "manual") return;
  await prisma.artist_platform_profiles.upsert({
    where,
    create: {
      user_id: params.userId,
      profile_key: params.profileKey,
      platform: params.platform,
      external_id: params.externalId,
      name: params.name.slice(0, 255),
      url: params.url,
      image_url: params.imageUrl,
      status: params.status,
      source: params.source,
      details: (params.details ?? {}) as Prisma.InputJsonValue
    },
    update: {
      name: params.name.slice(0, 255),
      url: params.url,
      image_url: params.imageUrl ?? undefined,
      status: params.status,
      source: params.source,
      ...(params.details ? { details: params.details as Prisma.InputJsonValue } : {})
    }
  });
}

/**
 * Links the card to platform profiles: profiles behind the artist's own UPCs are confirmed right away,
 * a search result whose discography holds the artist's releases too; everything else is a suggestion.
 */
export async function suggestArtistProfiles(userId: string, profileKey: string): Promise<ArtistCardView | null> {
  const releases = await loadApprovedReleases(userId);
  const cardReleases = releases.filter((release) => release.cardKeys.includes(profileKey));
  const cardName = cardReleases
    .flatMap((release) => release.artistNames)
    .find((name) => normalizeArtistProfileKey(name) === profileKey);
  if (!cardName) return null;
  const cardNorm = normalizeArtistMatchName(cardName);
  const now = new Date();
  const released = cardReleases.filter((release) => !isSmartLinkPrerelease(toIsoDate(release.date), now));

  const existing = await prisma.artist_platform_profiles.findMany({
    where: { user_id: userId, profile_key: profileKey },
    select: { platform: true, external_id: true, status: true }
  });
  const confirmedPlatforms = new Set(existing.filter((row) => row.status === "confirmed").map((row) => row.platform));
  const rejectedIds = new Set(existing.filter((row) => row.status === "rejected").map((row) => `${row.platform}:${row.external_id}`));

  // 1. Exact: the artist's own albums found by UPC point at their profile.
  for (const release of released.filter((item) => item.upc).slice(0, 5)) {
    const albums = await Promise.all(
      (["spotify", "apple_music", "deezer"] as const)
        .filter((platform) => !confirmedPlatforms.has(platform) && isPlatformLookupConfigured(platform))
        .map((platform) => findPlatformAlbumByUpc(platform, release.upc!))
    );
    for (const album of albums) {
      if (!album) continue;
      const artist = album.artists.find((item) => item.id && normalizeArtistMatchName(item.name) === cardNorm);
      if (!artist?.id || rejectedIds.has(`${album.platform}:${artist.id}`)) continue;
      await upsertProfile({
        userId,
        profileKey,
        platform: album.platform,
        externalId: artist.id,
        name: artist.name,
        url: profileUrl(album.platform, artist.id),
        imageUrl: null,
        status: "confirmed",
        source: "upc",
        details: { latestRelease: album.title }
      });
      confirmedPlatforms.add(album.platform);
    }
  }

  // 2. Search by name on the platforms still without a confirmed profile. A namesake is the artist when
  // their discography shares releases with the cabinet or with a profile already confirmed elsewhere
  // (e.g. picked on Apple in the wizard → found on Яндекс by the same releases).
  const confirmedRows = await prisma.artist_platform_profiles.findMany({
    where: { user_id: userId, profile_key: profileKey, status: "confirmed", platform: { in: ["spotify", "apple_music", "deezer", "yandex_music"] } },
    select: { platform: true, external_id: true, name: true }
  });
  const knownCatalogs = await Promise.all(
    confirmedRows.map((row) => listPlatformDiscography(row.platform, row.external_id, row.name).catch(() => []))
  );
  const titles = Array.from(new Set([
    ...released.map((release) => release.title),
    ...knownCatalogs.flat().map((album) => album.title)
  ]));
  for (const platform of DISCOGRAPHY_PLATFORMS) {
    if (confirmedPlatforms.has(platform) || !isPlatformLookupConfigured(platform)) continue;
    const found = (await searchPlatformArtists(platform, cardName))
      .filter((artist) => normalizeArtistMatchName(artist.name) === cardNorm)
      .filter((artist) => !rejectedIds.has(`${platform}:${artist.externalId}`))
      .slice(0, 3);
    const withCatalog = await Promise.all(
      found.map(async (artist) => {
        const albums = platform === "youtube_music" ? [] : await listPlatformDiscography(platform, artist.externalId, artist.name);
        return { artist, albums, overlap: countCatalogOverlap(titles, albums) };
      })
    );
    const strong = withCatalog.filter((item) => item.overlap >= Math.min(2, Math.max(1, titles.length)));
    for (const item of withCatalog) {
      const confirm = strong.length === 1 && strong[0] === item;
      await upsertProfile({
        userId,
        profileKey,
        platform,
        externalId: item.artist.externalId,
        name: item.artist.name,
        url: item.artist.url,
        imageUrl: item.artist.imageUrl,
        status: confirm ? "confirmed" : "suggested",
        source: confirm ? "catalog" : "search",
        details: {
          hint: item.artist.hint,
          overlap: platform === "youtube_music" ? null : item.overlap,
          latestRelease: latestTitle(item.albums)
        }
      });
    }
  }

  const cards = await getArtistCards(userId, releases);
  return cards.find((card) => card.profileKey === profileKey) ?? null;
}

function latestTitle(albums: PlatformAlbum[]): string | null {
  const [latest] = albums
    .filter((album) => album.releaseDate)
    .sort((left, right) => (right.releaseDate ?? "").localeCompare(left.releaseDate ?? ""));
  return latest ? `${latest.title}, ${latest.releaseDate!.slice(0, 4)}` : null;
}

export async function decideArtistProfile(params: {
  userId: string;
  profileId: string;
  decision: "confirm" | "reject";
}): Promise<boolean> {
  const profile = await prisma.artist_platform_profiles.findFirst({
    where: { id: params.profileId, user_id: params.userId }
  });
  if (!profile) return false;
  await prisma.$transaction(async (tx) => {
    await tx.artist_platform_profiles.update({
      where: { id: profile.id },
      data: { status: params.decision === "confirm" ? "confirmed" : "rejected" }
    });
    if (params.decision === "confirm") {
      // The other suggestions for this platform were the wrong namesakes.
      await tx.artist_platform_profiles.updateMany({
        where: {
          user_id: params.userId,
          profile_key: profile.profile_key,
          platform: profile.platform,
          status: "suggested",
          id: { not: profile.id }
        },
        data: { status: "rejected" }
      });
    }
  });
  return true;
}

export async function addArtistProfileByUrl(params: {
  userId: string;
  profileKey: string;
  platform: string;
  url: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!PROFILE_PLATFORMS.includes(params.platform as (typeof PROFILE_PLATFORMS)[number])) {
    return { ok: false, error: "Эту площадку нельзя привязать" };
  }
  const parsed = parseArtistProfileUrl(params.platform, params.url);
  if (!parsed) {
    return { ok: false, error: `Это не ссылка на профиль артиста в ${getSmartLinkPlatformLabel(params.platform)}` };
  }
  const cards = await getArtistCards(params.userId);
  const card = cards.find((item) => item.profileKey === params.profileKey);
  if (!card) return { ok: false, error: "Карточка артиста не найдена" };
  await prisma.$transaction([
    prisma.artist_platform_profiles.updateMany({
      where: { user_id: params.userId, profile_key: params.profileKey, platform: params.platform, status: "suggested" },
      data: { status: "rejected" }
    }),
    prisma.artist_platform_profiles.upsert({
      where: {
        user_id_profile_key_platform_external_id: {
          user_id: params.userId,
          profile_key: params.profileKey,
          platform: params.platform,
          external_id: parsed.externalId
        }
      },
      create: {
        user_id: params.userId,
        profile_key: params.profileKey,
        platform: params.platform,
        external_id: parsed.externalId,
        name: card.name,
        url: parsed.url,
        status: "confirmed",
        source: "manual"
      },
      update: { status: "confirmed", source: "manual", url: parsed.url }
    })
  ]);
  return { ok: true };
}

/** Candidates for a profile the artist is looking at, fresh from the platform. */
export async function searchArtistOnPlatform(userId: string, profileKey: string, platform: string): Promise<PlatformArtist[]> {
  const cards = await getArtistCards(userId);
  const card = cards.find((item) => item.profileKey === profileKey);
  if (!card || !isPlatformLookupConfigured(platform)) return [];
  return searchPlatformArtists(platform, card.name);
}

// ---------- Wizard: "Это он" ----------

const PERFORMER_ROLES = new Set(["исполнитель", "feat.", "remixer", "соисполнитель"]);

type ProfileLike = { platform: string; external_id: string; name: string; profile_key: string };

/** Profiles the artist picked for this release in the wizard. */
function readReleasePersonProfiles(roles: unknown): ProfileLike[] {
  const persons = asRecord(asRecord(roles)?.submissionData)?.persons;
  if (!Array.isArray(persons)) return [];
  return persons.flatMap((person) => {
    const record = asRecord(person);
    const name = typeof record?.name === "string" ? record.name : "";
    const picked = Array.isArray(record?.platformProfiles) ? record.platformProfiles : [];
    return picked.flatMap((item) => {
      const profile = asRecord(item);
      const platform = typeof profile?.platform === "string" ? profile.platform : "";
      const externalId = typeof profile?.externalId === "string" ? profile.externalId : "";
      if (!platform || !externalId) return [];
      return [{
        platform,
        external_id: externalId,
        name: typeof profile?.name === "string" ? profile.name : name,
        profile_key: normalizeArtistProfileKey(name)
      }];
    });
  });
}

export interface WizardArtistCandidate extends PlatformArtist {
  latestRelease: string | null;
}

/** One artist as the wizard shows it: the same person found on several platforms. */
export interface WizardArtistEntry {
  key: string;
  name: string;
  imageUrl: string | null;
  hint: string | null;
  latestRelease: string | null;
  profiles: WizardArtistCandidate[];
}

export interface WizardArtistSearch {
  /** Profiles already confirmed for this name in the cabinet ("ваш артист"). */
  known: ArtistPlatformProfileView[];
  /** Search results merged into artists, best first. */
  artists: WizardArtistEntry[];
}

const WIZARD_PLATFORMS = ["yandex_music", "spotify", "apple_music", "deezer", "youtube_music"];

/**
 * Namesakes on different platforms are glued into one artist only when their discographies share a release,
 * so "OBS1D1AN" on Яндекс, Apple and Deezer becomes one card while a same-name stranger stays separate.
 */
export function mergeArtistCandidates(
  found: Array<{ artist: WizardArtistCandidate; titles: string[] }>
): WizardArtistEntry[] {
  const entries: Array<{ entry: WizardArtistEntry; titles: Set<string>; norm: string }> = [];
  for (const { artist, titles } of found) {
    const norm = normalizeArtistMatchName(artist.name);
    const own = new Set(titles.map(normalizeMatchText).filter(Boolean));
    let best: (typeof entries)[number] | null = null;
    let bestOverlap = 0;
    for (const item of entries) {
      if (item.norm !== norm || item.entry.profiles.some((profile) => profile.platform === artist.platform)) continue;
      const overlap = Array.from(own).filter((title) => item.titles.has(title)).length;
      if (overlap > bestOverlap) {
        best = item;
        bestOverlap = overlap;
      }
    }
    // YouTube shows no discography: it joins the only same-name artist, never a guess between several.
    if (!best && artist.platform === "youtube_music") {
      const sameName = entries.filter(
        (item) => item.norm === norm && !item.entry.profiles.some((profile) => profile.platform === artist.platform)
      );
      if (sameName.length === 1) best = sameName[0];
    }
    if (best) {
      best.entry.profiles.push(artist);
      own.forEach((title) => best!.titles.add(title));
      best.entry.imageUrl ??= artist.imageUrl;
      best.entry.hint ??= artist.hint;
      best.entry.latestRelease ??= artist.latestRelease;
      continue;
    }
    entries.push({
      norm,
      titles: own,
      entry: {
        key: `${artist.platform}:${artist.externalId}`,
        name: artist.name,
        imageUrl: artist.imageUrl,
        hint: artist.hint,
        latestRelease: artist.latestRelease,
        profiles: [artist]
      }
    });
  }
  return entries
    .map((item) => item.entry)
    .sort((left, right) => right.profiles.length - left.profiles.length);
}

/** What the wizard shows under a performer name: the cabinet's own profiles and artists found on platforms. */
export async function searchArtistForWizard(userId: string, name: string): Promise<WizardArtistSearch> {
  const profileKey = normalizeArtistProfileKey(name);
  const norm = normalizeArtistMatchName(name);
  // Saved profiles only add "ваш артист" and hide rejected namesakes; the platform search works without them.
  const saved = await prisma.artist_platform_profiles
    .findMany({ where: { user_id: userId, profile_key: profileKey, status: { in: ["confirmed", "rejected"] } }, orderBy: { created_at: "asc" } })
    .catch((error: unknown) => {
      console.error("[platform-links] saved profiles unavailable", error);
      return [];
    });
  const known = saved.filter((row) => row.status === "confirmed").map(mapProfile);
  const rejected = new Set(saved.filter((row) => row.status === "rejected").map((row) => `${row.platform}:${row.external_id}`));

  const perPlatform = await Promise.all(
    WIZARD_PLATFORMS.filter(isPlatformLookupConfigured).map(async (platform) => {
      const matches = (await searchPlatformArtists(platform, name))
        .filter((artist) => {
          const candidate = normalizeArtistMatchName(artist.name);
          return candidate === norm || (norm.length >= 3 && candidate.startsWith(norm));
        })
        .filter((artist) => !rejected.has(`${platform}:${artist.externalId}`))
        .slice(0, 3);
      return Promise.all(
        matches.map(async (artist) => {
          const albums = platform === "youtube_music" ? [] : await listPlatformDiscography(platform, artist.externalId, artist.name);
          return { artist: { ...artist, latestRelease: latestTitle(albums) }, titles: albums.map((album) => album.title) };
        })
      );
    })
  );

  const artists = mergeArtistCandidates(perPlatform.flat())
    .sort((left, right) => {
      const exact = Number(normalizeArtistMatchName(right.name) === norm) - Number(normalizeArtistMatchName(left.name) === norm);
      return exact || right.profiles.length - left.profiles.length;
    })
    .slice(0, 6);
  return { known, artists };
}

/** After the release is submitted, the profiles picked in the wizard become the card's confirmed profiles. */
export async function rememberReleaseArtistProfiles(userId: string, persons: unknown): Promise<void> {
  if (!Array.isArray(persons)) return;
  for (const person of persons) {
    const record = asRecord(person);
    const name = typeof record?.name === "string" ? record.name.trim() : "";
    const role = typeof record?.role === "string" ? record.role.trim().toLowerCase() : "";
    if (!name || !PERFORMER_ROLES.has(role) || !Array.isArray(record?.platformProfiles)) continue;
    const profileKey = normalizeArtistProfileKey(name);
    for (const item of record.platformProfiles) {
      const profile = asRecord(item);
      const platform = typeof profile?.platform === "string" ? profile.platform : "";
      const externalId = typeof profile?.externalId === "string" ? profile.externalId : "";
      const url = typeof profile?.url === "string" ? profile.url : "";
      if (!PROFILE_PLATFORMS.includes(platform as (typeof PROFILE_PLATFORMS)[number]) || !externalId || !url) continue;
      await upsertProfile({
        userId,
        profileKey,
        platform,
        externalId,
        name: typeof profile?.name === "string" ? profile.name : name,
        url,
        imageUrl: typeof profile?.imageUrl === "string" ? profile.imageUrl : null,
        status: "confirmed",
        source: "wizard"
      });
      await prisma.artist_platform_profiles.updateMany({
        where: { user_id: userId, profile_key: profileKey, platform, status: "suggested" },
        data: { status: "rejected" }
      });
    }
  }
}

// ---------- Release links ----------

type DiscoveryResult = { releaseId: string; title: string; added: string[] };

/**
 * Searches links for released releases: exact UPC lookups first, then the artist's confirmed profiles.
 * Clear matches are saved into the smart link, unsure ones wait for the artist as "Это он?".
 */
export async function discoverReleaseLinks(params: {
  userId: string;
  releaseIds?: string[];
  now?: Date;
}): Promise<DiscoveryResult[]> {
  const now = params.now ?? new Date();
  const releases = (await loadApprovedReleases(params.userId))
    .filter((release) => !params.releaseIds || params.releaseIds.includes(release.id))
    .filter((release) => !isSmartLinkPrerelease(toIsoDate(release.date), now))
    .slice(0, MAX_RELEASES_PER_RUN);
  if (releases.length === 0) return [];

  const profiles = await prisma.artist_platform_profiles.findMany({
    where: { user_id: params.userId, status: "confirmed" }
  });
  const discography = new Map<string, Promise<PlatformAlbum[]>>();
  const albumsFor = (platform: string, profile: { external_id: string; name: string }) => {
    const key = `${platform}:${profile.external_id}`;
    if (!discography.has(key)) discography.set(key, listPlatformDiscography(platform, profile.external_id, profile.name));
    return discography.get(key)!;
  };
  const matchRows = await prisma.release_platform_matches.findMany({
    where: { release_id: { in: releases.map((release) => release.id) } }
  });
  const rowsByRelease = new Map<string, Map<string, (typeof matchRows)[number]>>();
  for (const row of matchRows) {
    const map = rowsByRelease.get(row.release_id) ?? new Map();
    map.set(row.platform, row);
    rowsByRelease.set(row.release_id, map);
  }
  let youtubeBudget = MAX_YOUTUBE_SEARCHES_PER_RUN;

  return mapLimit(releases, 4, async (release) => {
    const links = readReleasePlatformLinks(release.roles);
    const rows = rowsByRelease.get(release.id) ?? new Map();
    const needs = (platform: string) => {
      const item = links[platform];
      return !item?.url && item?.status !== "hidden";
    };
    const found: Record<string, string> = {};
    const pending: Record<string, AlbumMatch[]> = {};

    if (release.upc) {
      const lookups = await Promise.all(
        UPC_LOOKUP_PLATFORMS
          .filter((platform) => needs(platform) && isPlatformLookupConfigured(platform))
          .map((platform) => findPlatformAlbumByUpc(platform, release.upc!))
      );
      for (const album of lookups) {
        if (album) found[album.platform] = album.url;
      }
    }

    // A profile picked for this very release ("Это он" in the wizard) wins over the card: one cabinet can
    // release different artists who happen to share a name.
    const releaseProfiles = readReleasePersonProfiles(release.roles);
    const cardProfiles = [
      ...releaseProfiles,
      ...profiles.filter(
        (profile) =>
          release.cardKeys.includes(profile.profile_key) &&
          !releaseProfiles.some((picked) => picked.platform === profile.platform)
      )
    ];
    const matching = toMatchingRelease(release);
    for (const platform of ["spotify", "apple_music", "deezer", "yandex_music"]) {
      if (!needs(platform) || found[platform] || !isPlatformLookupConfigured(platform)) continue;
      const platformProfiles = cardProfiles.filter((profile) => profile.platform === platform);
      if (platformProfiles.length === 0) continue;
      const albums = (await Promise.all(platformProfiles.map((profile) => albumsFor(platform, profile)))).flat();
      const rejected = asStringArray(rows.get(platform)?.rejected);
      const pick = pickAlbumMatch(matching, albums, rejected);
      if (pick.decision === "auto") found[platform] = pick.matches[0].album.url;
      else if (pick.decision === "review") pending[platform] = pick.matches;
    }

    const youtube = cardProfiles.filter((profile) => profile.platform === "youtube_music");
    if (needs("youtube_music") && youtube.length > 0 && isPlatformLookupConfigured("youtube_music") && youtubeBudget > 0) {
      youtubeBudget -= 1;
      const channel = youtube[0];
      const albums = await findYoutubeAlbums(channel.name, release.title, channel.external_id);
      const rejected = asStringArray(rows.get("youtube_music")?.rejected);
      const pick = pickAlbumMatch(matching, albums, rejected);
      const best = pick.matches[0];
      // Inside the artist's own Topic channel an exact title is enough: YouTube shows no date or track count.
      const titleOk = best?.checks.find((check) => check.field === "title")?.ok === true;
      if (best && titleOk && best.album.artists[0]?.id === channel.external_id && pick.matches.length === 1) {
        found.youtube_music = best.album.url;
      } else if (pick.matches.length > 0) {
        pending.youtube_music = pick.matches;
      }
    }

    const added = Object.keys(found).length > 0
      ? await saveDiscoveredPlatformLinks({ releaseId: release.id, links: found, now })
      : [];

    const resolved = Object.keys(found);
    if (resolved.length > 0) {
      await prisma.release_platform_matches.deleteMany({
        where: { release_id: release.id, platform: { in: resolved }, status: { in: ["pending", "waiting", "broken"] } }
      });
    }
    for (const [platform, matches] of Object.entries(pending)) {
      const existing = rows.get(platform);
      if (existing?.status === "waiting") continue;
      await prisma.release_platform_matches.upsert({
        where: { release_id_platform: { release_id: release.id, platform } },
        create: {
          release_id: release.id,
          platform,
          status: "pending",
          candidates: matches.map(toCandidate) as unknown as Prisma.InputJsonValue,
          checked_at: now
        },
        update: {
          status: "pending",
          candidates: matches.map(toCandidate) as unknown as Prisma.InputJsonValue,
          checked_at: now
        }
      });
    }
    return { releaseId: release.id, title: release.title, added };
  });
}

/**
 * "Обновить ссылки" in one release's smart link editor: links the artist's profiles if none are confirmed yet,
 * searches this release and returns every link it now has plus the platforms waiting for "Это он?".
 */
export async function findReleaseLinksForOwner(params: {
  userId: string;
  releaseId: string;
}): Promise<{ upc: string | null; found: Record<string, string>; review: string[] } | null> {
  const releases = await loadApprovedReleases(params.userId);
  const release = releases.find((item) => item.id === params.releaseId);
  if (!release) return null;

  const confirmed = await prisma.artist_platform_profiles.findMany({
    where: { user_id: params.userId, profile_key: { in: release.cardKeys }, status: "confirmed" },
    select: { profile_key: true, platform: true }
  });
  for (const key of release.cardKeys.slice(0, 3)) {
    // Яндекс has no UPC search, so without a confirmed profile it would never be found.
    if (!confirmed.some((row) => row.profile_key === key && row.platform === "yandex_music")) {
      await suggestArtistProfiles(params.userId, key);
    }
  }

  await discoverReleaseLinks({ userId: params.userId, releaseIds: [release.id] });

  const fresh = await prisma.release.findUnique({ where: { id: release.id }, select: { roles: true } });
  const found = Object.fromEntries(
    Object.values(readReleasePlatformLinks(fresh?.roles))
      .filter((item) => item.url && item.status === "live")
      .map((item) => [item.code, item.url as string])
  );
  const pending = await prisma.release_platform_matches.findMany({
    where: { release_id: release.id, status: "pending" },
    select: { platform: true }
  });
  return { upc: release.upc, found, review: pending.map((row) => row.platform) };
}

export type MatchAction =
  | { kind: "confirm"; url: string }
  | { kind: "reject"; url: string }
  | { kind: "manual"; url: string }
  | { kind: "waiting" };

export async function resolveReleaseMatch(params: {
  userId: string;
  releaseId: string;
  platform: string;
  action: MatchAction;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const release = await prisma.release.findFirst({
    where: { id: params.releaseId, userId: params.userId },
    select: { id: true }
  });
  if (!release) return { ok: false, error: "Релиз не найден" };
  const where = { release_id_platform: { release_id: release.id, platform: params.platform } };
  const row = await prisma.release_platform_matches.findUnique({ where });
  const candidates = readCandidates(row?.candidates);

  switch (params.action.kind) {
    case "confirm": {
      const url = params.action.url;
      if (!candidates.some((candidate) => candidate.url === url)) return { ok: false, error: "Этот вариант уже не актуален" };
      await saveDiscoveredPlatformLinks({ releaseId: release.id, links: { [params.platform]: url }, overwrite: [params.platform] });
      await prisma.release_platform_matches.delete({ where });
      return { ok: true };
    }
    case "manual": {
      const url = normalizeSmartLinkHref(params.action.url);
      if (!url || detectSmartLinkPlatform(url) !== params.platform) {
        return { ok: false, error: `Это не ссылка на ${getSmartLinkPlatformLabel(params.platform)}` };
      }
      await saveDiscoveredPlatformLinks({ releaseId: release.id, links: { [params.platform]: url }, overwrite: [params.platform] });
      await prisma.release_platform_matches.deleteMany({ where: { release_id: release.id, platform: params.platform } });
      return { ok: true };
    }
    case "reject": {
      const url = params.action.url;
      const rejected = Array.from(new Set([...asStringArray(row?.rejected), url]));
      const left = candidates.filter((candidate) => candidate.url !== url);
      await prisma.release_platform_matches.upsert({
        where,
        create: { release_id: release.id, platform: params.platform, status: "none", rejected },
        update: {
          status: left.length > 0 ? "pending" : "none",
          candidates: left as unknown as Prisma.InputJsonValue,
          rejected
        }
      });
      return { ok: true };
    }
    case "waiting": {
      await prisma.release_platform_matches.upsert({
        where,
        create: { release_id: release.id, platform: params.platform, status: "waiting" },
        update: { status: "waiting", candidates: [] }
      });
      return { ok: true };
    }
  }
}

export async function getReleaseLinksOverview(userId: string): Promise<ReleaseLinksOverview> {
  const [releases, smartLinks] = await Promise.all([loadApprovedReleases(userId), getSmartLinksByUser(userId)]);
  const cards = await getArtistCards(userId, releases);
  const byId = new Map(releases.map((release) => [release.id, release]));
  const matchRows = await prisma.release_platform_matches.findMany({
    where: { release_id: { in: releases.map((release) => release.id) }, status: { in: ["pending", "waiting", "broken"] } }
  });
  const now = new Date();

  const rows: ReleaseLinksRow[] = smartLinks
    .filter((link) => byId.has(link.releaseId))
    .map((link) => {
      const release = byId.get(link.releaseId)!;
      const upcoming = isSmartLinkPrerelease(link.releaseDate, now);
      const cells = RELEASE_LINK_PLATFORMS.map((platform): ReleaseLinkCell => {
        const item = link.platforms.find((entry) => entry.code === platform);
        const row = matchRows.find((match) => match.release_id === link.releaseId && match.platform === platform);
        if (item?.url && item.status === "live") return { platform, state: "found", url: item.url, candidates: [] };
        if (row?.status === "pending") return { platform, state: "review", url: null, candidates: readCandidates(row.candidates) };
        if (row?.status === "broken") return { platform, state: "broken", url: row.last_url, candidates: [] };
        if (upcoming) return { platform, state: "upcoming", url: null, candidates: [] };
        if (row?.status === "waiting") return { platform, state: "waiting", url: null, candidates: [] };
        if ((MANUAL_PROFILE_PLATFORMS as readonly string[]).includes(platform)) {
          return { platform, state: "manual", url: null, candidates: [] };
        }
        return { platform, state: "none", url: null, candidates: [] };
      });
      return {
        releaseId: link.releaseId,
        title: link.title,
        artist: link.artist,
        coverUrl: link.coverUrl,
        upc: link.upc,
        releaseDate: link.releaseDate,
        trackCount: release.trackCount,
        cells
      };
    });

  const configured = Object.fromEntries(
    [...DISCOGRAPHY_PLATFORMS, "tidal"].map((platform) => [platform, isPlatformLookupConfigured(platform)])
  );
  return { cards, rows, configured };
}

// ---------- Daily job ----------

async function notifyLinksFound(userId: string, result: DiscoveryResult): Promise<void> {
  if (result.added.length === 0) return;
  const labels = result.added.map(getSmartLinkPlatformLabel).join(", ");
  const promo = await prisma.promo_links.findFirst({ where: { releaseId: result.releaseId }, select: { shortName: true } });
  await deliverUserNotificationSafely(prisma, {
    id: `release-links-found:${result.releaseId}:${result.added.sort().join(",")}`,
    userId,
    kind: "release_links_found",
    title: "Релиз появился на площадках",
    message: `«${result.title}» теперь есть в: ${labels}. Ссылки добавлены в смарт-ссылку.`,
    href: `/dashboard/releases/${result.releaseId}/smart-link`,
    vkHref: promo ? `/l/${promo.shortName}` : undefined,
    sendEmail: false
  });
}

async function checkSavedLinks(now: Date, limit: number): Promise<{ checked: number; broken: number }> {
  const releases = await prisma.release.findMany({
    where: { upc: { not: null } },
    select: { id: true, title: true, userId: true, roles: true, date: true },
    orderBy: { date: "desc" },
    take: 2000
  });
  const health = await prisma.release_platform_matches.findMany({
    where: { release_id: { in: releases.map((release) => release.id) }, platform: { in: HEALTH_CHECK_PLATFORMS } },
    select: { release_id: true, platform: true, status: true, failures: true, last_url: true, checked_at: true }
  });
  const healthKey = (releaseId: string, platform: string) => `${releaseId}:${platform}`;
  const healthMap = new Map(health.map((row) => [healthKey(row.release_id, row.platform), row]));

  const queue: Array<{ releaseId: string; title: string; userId: string; platform: string; url: string; lastChecked: number }> = [];
  for (const release of releases) {
    const links = readReleasePlatformLinks(release.roles);
    for (const platform of HEALTH_CHECK_PLATFORMS) {
      const url = links[platform]?.url;
      if (!url || links[platform]?.status !== "live") continue;
      const row = healthMap.get(healthKey(release.id, platform));
      const lastChecked = row?.checked_at && row.last_url === url ? row.checked_at.getTime() : 0;
      if (now.getTime() - lastChecked < HEALTH_RECHECK_MS) continue;
      queue.push({ releaseId: release.id, title: release.title, userId: release.userId, platform, url, lastChecked });
    }
  }
  queue.sort((left, right) => left.lastChecked - right.lastChecked);

  let broken = 0;
  const batch = queue.slice(0, limit);
  await mapLimit(batch, 4, async (item) => {
    const alive = await checkPlatformAlbumAlive(item.platform, item.url);
    if (alive === null) return;
    const where = { release_id_platform: { release_id: item.releaseId, platform: item.platform } };
    const row = healthMap.get(healthKey(item.releaseId, item.platform));
    // A pending or waiting row is about finding a link, not about this one; leave it alone.
    if (row && row.status !== "ok" && row.status !== "failing") return;
    if (alive) {
      await prisma.release_platform_matches.upsert({
        where,
        create: { release_id: item.releaseId, platform: item.platform, status: "ok", last_url: item.url, checked_at: now },
        update: { status: "ok", last_url: item.url, failures: 0, checked_at: now }
      });
      return;
    }
    const failures = (row?.last_url === item.url ? row.failures : 0) + 1;
    if (failures < FAILURES_BEFORE_BROKEN) {
      await prisma.release_platform_matches.upsert({
        where,
        create: { release_id: item.releaseId, platform: item.platform, status: "failing", last_url: item.url, failures, checked_at: now },
        update: { status: "failing", last_url: item.url, failures, checked_at: now }
      });
      return;
    }
    const cleared = await clearPlatformLinkIfUnchanged({ releaseId: item.releaseId, code: item.platform, url: item.url });
    await prisma.release_platform_matches.upsert({
      where,
      create: { release_id: item.releaseId, platform: item.platform, status: "broken", last_url: item.url, failures, checked_at: now },
      update: { status: "broken", last_url: item.url, failures, checked_at: now }
    });
    if (!cleared) return;
    broken += 1;
    await deliverUserNotificationSafely(prisma, {
      id: `release-link-broken:${item.releaseId}:${item.platform}:${now.toISOString().slice(0, 10)}`,
      userId: item.userId,
      kind: "release_link_broken",
      title: "Ссылка на площадку перестала открываться",
      message: `${getSmartLinkPlatformLabel(item.platform)} больше не открывает «${item.title}». Мы убрали кнопку со смарт-ссылки и ищем релиз заново.`,
      href: "/dashboard/smart-links#release-links",
      sendEmail: false
    });
  });
  return { checked: batch.length, broken };
}

/**
 * Run once a day: links new releases of artists, links profiles found by UPC for artists who never
 * opened the cards, and checks that saved links still open.
 */
export async function runDailyPlatformLinkJob(now: Date = new Date()): Promise<{
  users: number;
  releasesWithNewLinks: number;
  checked: number;
  broken: number;
}> {
  const since = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
  const recent = await prisma.release.findMany({
    where: { date: { gte: since, lte: now }, upc: { not: null } },
    select: { userId: true },
    distinct: ["userId"],
    take: 60
  });
  const withProfiles = await prisma.artist_platform_profiles.findMany({
    where: { status: "confirmed" },
    select: { user_id: true },
    distinct: ["user_id"],
    take: 60
  });
  const userIds = Array.from(new Set([...recent.map((row) => row.userId), ...withProfiles.map((row) => row.user_id)])).slice(0, 80);

  let releasesWithNewLinks = 0;
  for (const userId of userIds) {
    try {
      const cards = await getArtistCards(userId);
      // Cards still missing a searchable platform: look for it there by the releases already known.
      const searchable = DISCOGRAPHY_PLATFORMS.filter((platform) => platform !== "youtube_music" && isPlatformLookupConfigured(platform));
      const incomplete = cards.filter((item) =>
        searchable.some((platform) => !item.profiles.some((profile) => profile.platform === platform && profile.status === "confirmed"))
      );
      for (const card of incomplete.slice(0, 3)) {
        await suggestArtistProfiles(userId, card.profileKey);
      }
      const releases = await prisma.release.findMany({
        where: { userId, date: { gte: since, lte: now } },
        select: { id: true }
      });
      if (releases.length === 0) continue;
      const results = await discoverReleaseLinks({ userId, releaseIds: releases.map((release) => release.id), now });
      for (const result of results) {
        if (result.added.length === 0) continue;
        releasesWithNewLinks += 1;
        await notifyLinksFound(userId, result);
      }
    } catch (error) {
      console.error("[platform-links] daily job failed for user", userId, error);
    }
  }

  const health = await checkSavedLinks(now, 300);
  return { users: userIds.length, releasesWithNewLinks, ...health };
}
