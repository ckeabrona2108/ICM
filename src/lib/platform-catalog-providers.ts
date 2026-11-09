/**
 * Read-only lookups on streaming platforms: artist search, an artist's discography and albums by UPC.
 * Every call is optional — a platform that is not configured or does not answer simply returns nothing.
 *
 * Spotify: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET. TIDAL: TIDAL_CLIENT_ID / TIDAL_CLIENT_SECRET.
 * YouTube Music: YOUTUBE_API_KEY (YouTube Data API v3). Apple, Deezer and Яндекс Музыка need no keys;
 * Яндекс answers only from Russian addresses and can be turned off with YANDEX_MUSIC_LOOKUP=off.
 */
import type { PlatformAlbum } from "@/lib/platform-link-matching";

const REQUEST_TIMEOUT_MS = 8000;

type JsonRecord = Record<string, unknown>;

export interface PlatformArtist {
  platform: string;
  externalId: string;
  name: string;
  url: string;
  imageUrl: string | null;
  /** Short line under the name: listeners, genre, country. */
  hint: string | null;
}

/** Platforms whose profile can be confirmed and searched for releases. */
export const DISCOGRAPHY_PLATFORMS = ["spotify", "apple_music", "yandex_music", "youtube_music", "deezer"] as const;
/** Platforms the artist links by pasting a profile URL; we cannot search them. */
export const MANUAL_PROFILE_PLATFORMS = ["vk_music", "zvuk_wink_music"] as const;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchJson(url: string, init?: RequestInit): Promise<JsonRecord | null> {
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) return null;
    return asRecord(await response.json());
  } catch {
    return null;
  }
}

function formatListeners(count: number | null, word: string): string | null {
  if (count === null) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(".0", "")} млн ${word}`;
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(".0", "")} тыс. ${word}`;
  return `${count} ${word}`;
}

function joinHint(parts: Array<string | null | undefined>): string | null {
  const text = parts.filter(Boolean).join(" · ");
  return text || null;
}

// ---------- Spotify ----------

let spotifyToken: { value: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 60_000) return spotifyToken.value;
  const json = await fetchJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const value = asText(json?.access_token);
  if (!value) return null;
  spotifyToken = { value, expiresAt: Date.now() + (asCount(json?.expires_in) ?? 3600) * 1000 };
  return value;
}

async function spotifyGet(path: string): Promise<JsonRecord | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  return fetchJson(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${token}` } });
}

function mapSpotifyAlbum(item: unknown): PlatformAlbum | null {
  const album = asRecord(item);
  const id = asText(album?.id);
  const url = asText(asRecord(album?.external_urls)?.spotify);
  if (!album || !id || !url) return null;
  return {
    platform: "spotify",
    externalId: id,
    title: asText(album.name) ?? "",
    artists: asArray(album.artists).map((artist) => ({
      id: asText(asRecord(artist)?.id),
      name: asText(asRecord(artist)?.name) ?? ""
    })),
    releaseDate: asText(album.release_date),
    trackCount: asCount(album.total_tracks),
    url,
    coverUrl: asText(asRecord(asArray(album.images)[0])?.url),
    upc: asText(asRecord(album.external_ids)?.upc)
  };
}

async function searchSpotifyArtists(name: string): Promise<PlatformArtist[]> {
  const json = await spotifyGet(`search?type=artist&limit=5&q=${encodeURIComponent(name)}`);
  return asArray(asRecord(json?.artists)?.items).flatMap((item) => {
    const artist = asRecord(item);
    const id = asText(artist?.id);
    const url = asText(asRecord(artist?.external_urls)?.spotify);
    if (!artist || !id || !url) return [];
    return [{
      platform: "spotify",
      externalId: id,
      name: asText(artist.name) ?? "",
      url,
      imageUrl: asText(asRecord(asArray(artist.images)[0])?.url),
      hint: joinHint([
        formatListeners(asCount(asRecord(artist.followers)?.total), "подписчиков"),
        asText(asArray(artist.genres)[0])
      ])
    }];
  });
}

async function listSpotifyAlbums(artistId: string): Promise<PlatformAlbum[]> {
  const json = await spotifyGet(
    `artists/${encodeURIComponent(artistId)}/albums?include_groups=album,single,appears_on&limit=50&market=RU`
  );
  return asArray(json?.items).map(mapSpotifyAlbum).filter((album): album is PlatformAlbum => Boolean(album));
}

async function findSpotifyAlbumByUpc(upc: string): Promise<PlatformAlbum | null> {
  const json = await spotifyGet(`search?type=album&limit=1&q=${encodeURIComponent(`upc:${upc}`)}`);
  const album = mapSpotifyAlbum(asArray(asRecord(json?.albums)?.items)[0]);
  return album ? { ...album, upc } : null;
}

// ---------- Apple Music (iTunes Search API) ----------

function appleMusicUrl(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw.replace("://itunes.apple.com/", "://music.apple.com/"));
    parsed.searchParams.delete("uo");
    return parsed.toString();
  } catch {
    return null;
  }
}

function mapAppleCollection(item: unknown): PlatformAlbum | null {
  const collection = asRecord(item);
  if (collection?.wrapperType !== "collection") return null;
  const id = asText(collection.collectionId);
  const url = appleMusicUrl(asText(collection.collectionViewUrl));
  if (!id || !url) return null;
  return {
    platform: "apple_music",
    externalId: id,
    title: asText(collection.collectionName) ?? "",
    artists: [{ id: asText(collection.artistId), name: asText(collection.artistName) ?? "" }],
    releaseDate: asText(collection.releaseDate)?.slice(0, 10) ?? null,
    trackCount: asCount(collection.trackCount),
    url,
    coverUrl: asText(collection.artworkUrl100)?.replace("100x100bb", "300x300bb") ?? null,
    upc: null
  };
}

async function searchAppleArtists(name: string): Promise<PlatformArtist[]> {
  const json = await fetchJson(
    `https://itunes.apple.com/search?entity=musicArtist&country=ru&limit=5&term=${encodeURIComponent(name)}`
  );
  return asArray(json?.results).flatMap((item) => {
    const artist = asRecord(item);
    const id = asText(artist?.artistId);
    const url = appleMusicUrl(asText(artist?.artistLinkUrl));
    if (!artist || !id || !url) return [];
    return [{
      platform: "apple_music",
      externalId: id,
      name: asText(artist.artistName) ?? "",
      url,
      imageUrl: null,
      hint: asText(artist.primaryGenreName)
    }];
  });
}

async function listAppleAlbums(artistId: string): Promise<PlatformAlbum[]> {
  const json = await fetchJson(
    `https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&entity=album&country=ru&limit=200`
  );
  return asArray(json?.results).map(mapAppleCollection).filter((album): album is PlatformAlbum => Boolean(album));
}

async function findAppleAlbumByUpc(upc: string): Promise<PlatformAlbum | null> {
  const json = await fetchJson(`https://itunes.apple.com/lookup?upc=${upc}&entity=album&country=ru`);
  for (const item of asArray(json?.results)) {
    const album = mapAppleCollection(item);
    if (album) return { ...album, upc };
  }
  return null;
}

// ---------- Deezer ----------

function mapDeezerAlbum(item: unknown, fallbackArtist?: { id: string; name: string }): PlatformAlbum | null {
  const album = asRecord(item);
  const id = asText(album?.id);
  const url = asText(album?.link);
  if (!album || !id || !url) return null;
  const contributors = asArray(album.contributors).map((artist) => ({
    id: asText(asRecord(artist)?.id),
    name: asText(asRecord(artist)?.name) ?? ""
  }));
  const main = asRecord(album.artist);
  const artists = contributors.length > 0
    ? contributors
    : main
      ? [{ id: asText(main.id), name: asText(main.name) ?? "" }]
      : fallbackArtist ? [fallbackArtist] : [];
  return {
    platform: "deezer",
    externalId: id,
    title: asText(album.title) ?? "",
    artists,
    releaseDate: asText(album.release_date),
    trackCount: asCount(album.nb_tracks),
    url,
    coverUrl: asText(album.cover_medium),
    upc: asText(album.upc)
  };
}

async function searchDeezerArtists(name: string): Promise<PlatformArtist[]> {
  const json = await fetchJson(`https://api.deezer.com/search/artist?limit=5&q=${encodeURIComponent(name)}`);
  return asArray(json?.data).flatMap((item) => {
    const artist = asRecord(item);
    const id = asText(artist?.id);
    const url = asText(artist?.link);
    if (!artist || !id || !url) return [];
    return [{
      platform: "deezer",
      externalId: id,
      name: asText(artist.name) ?? "",
      url,
      imageUrl: asText(artist.picture_medium),
      hint: joinHint([formatListeners(asCount(artist.nb_fan), "фанатов"), `${asCount(artist.nb_album) ?? 0} релизов`])
    }];
  });
}

async function listDeezerAlbums(artistId: string, artistName: string): Promise<PlatformAlbum[]> {
  const json = await fetchJson(`https://api.deezer.com/artist/${encodeURIComponent(artistId)}/albums?limit=100`);
  return asArray(json?.data)
    .map((item) => mapDeezerAlbum(item, { id: artistId, name: artistName }))
    .filter((album): album is PlatformAlbum => Boolean(album));
}

async function findDeezerAlbumByUpc(upc: string): Promise<PlatformAlbum | null> {
  const json = await fetchJson(`https://api.deezer.com/album/upc:${upc}`);
  if (!json || json.error) return null;
  const album = mapDeezerAlbum(json);
  return album ? { ...album, upc } : null;
}

// ---------- TIDAL (UPC only) ----------

let tidalToken: { value: string; expiresAt: number } | null = null;

async function getTidalToken(): Promise<string | null> {
  const clientId = process.env.TIDAL_CLIENT_ID?.trim();
  const clientSecret = process.env.TIDAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  if (tidalToken && tidalToken.expiresAt > Date.now() + 60_000) return tidalToken.value;
  const json = await fetchJson("https://auth.tidal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const value = asText(json?.access_token);
  if (!value) return null;
  tidalToken = { value, expiresAt: Date.now() + (asCount(json?.expires_in) ?? 3600) * 1000 };
  return value;
}

async function findTidalAlbumByUpc(upc: string): Promise<PlatformAlbum | null> {
  const token = await getTidalToken();
  if (!token) return null;
  const json = await fetchJson(
    `https://openapi.tidal.com/v2/albums?countryCode=RU&filter%5BbarcodeId%5D=${encodeURIComponent(upc)}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.api+json" } }
  );
  const album = asRecord(asArray(json?.data)[0]);
  const id = asText(album?.id);
  if (!id) return null;
  const attributes = asRecord(album?.attributes);
  return {
    platform: "tidal",
    externalId: id,
    title: asText(attributes?.title) ?? "",
    artists: [],
    releaseDate: asText(attributes?.releaseDate),
    trackCount: asCount(attributes?.numberOfItems),
    url: `https://tidal.com/album/${id}`,
    coverUrl: null,
    upc
  };
}

// ---------- Яндекс Музыка ----------

function isYandexEnabled(): boolean {
  return (process.env.YANDEX_MUSIC_LOOKUP ?? "").trim().toLowerCase() !== "off";
}

function yandexImage(uri: unknown, size = "200x200"): string | null {
  const text = asText(uri);
  return text ? `https://${text.replace("%%", size)}` : null;
}

async function yandexGet(path: string): Promise<JsonRecord | null> {
  if (!isYandexEnabled()) return null;
  const json = await fetchJson(`https://api.music.yandex.net/${path}`);
  return asRecord(json?.result);
}

async function searchYandexArtists(name: string): Promise<PlatformArtist[]> {
  const result = await yandexGet(`search?type=artist&page=0&text=${encodeURIComponent(name)}`);
  return asArray(asRecord(result?.artists)?.results).slice(0, 5).flatMap((item) => {
    const artist = asRecord(item);
    const id = asText(artist?.id);
    if (!artist || !id) return [];
    const counts = asRecord(artist.counts);
    return [{
      platform: "yandex_music",
      externalId: id,
      name: asText(artist.name) ?? "",
      url: `https://music.yandex.ru/artist/${id}`,
      imageUrl: yandexImage(asRecord(artist.cover)?.uri),
      hint: joinHint([
        `${asCount(counts?.directAlbums) ?? 0} релизов`,
        asText(asArray(artist.genres)[0])
      ])
    }];
  });
}

async function listYandexAlbums(artistId: string): Promise<PlatformAlbum[]> {
  const result = await yandexGet(`artists/${encodeURIComponent(artistId)}/direct-albums?page=0&page-size=100&sort-by=year`);
  return asArray(result?.albums).flatMap((item) => {
    const album = asRecord(item);
    const id = asText(album?.id);
    if (!album || !id) return [];
    return [{
      platform: "yandex_music",
      externalId: id,
      title: asText(album.title) ?? "",
      artists: asArray(album.artists).map((artist) => ({
        id: asText(asRecord(artist)?.id),
        name: asText(asRecord(artist)?.name) ?? ""
      })),
      releaseDate: asText(album.releaseDate)?.slice(0, 10) ?? asText(album.year),
      trackCount: asCount(album.trackCount),
      url: `https://music.yandex.ru/album/${id}`,
      coverUrl: yandexImage(album.coverUri),
      upc: null
    }];
  });
}

// ---------- YouTube Music (YouTube Data API v3) ----------

function youtubeKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

async function searchYoutubeArtists(name: string): Promise<PlatformArtist[]> {
  const key = youtubeKey();
  if (!key) return [];
  const json = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=5&q=${encodeURIComponent(`${name} - Topic`)}&key=${key}`
  );
  return asArray(json?.items).flatMap((item) => {
    const record = asRecord(item);
    const id = asText(asRecord(record?.id)?.channelId);
    const snippet = asRecord(record?.snippet);
    if (!id || !snippet) return [];
    const title = asText(snippet.channelTitle) ?? asText(snippet.title) ?? "";
    const isTopic = / - Topic$/u.test(title);
    return [{
      platform: "youtube_music",
      externalId: id,
      name: title.replace(/ - Topic$/u, ""),
      url: `https://music.youtube.com/channel/${id}`,
      imageUrl: asText(asRecord(asRecord(snippet.thumbnails)?.default)?.url),
      hint: isTopic ? "Канал артиста в YouTube Music" : "Обычный канал YouTube"
    }];
  });
}

/**
 * YouTube does not list a Topic channel's albums through the API, so each release is searched by name:
 * auto-generated album playlists start with OLAK5uy_ and belong to the artist's Topic channel.
 */
async function searchYoutubeAlbums(query: string, channelId: string | null): Promise<PlatformAlbum[]> {
  const key = youtubeKey();
  if (!key) return [];
  const json = await fetchJson(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=playlist&maxResults=8&q=${encodeURIComponent(query)}&key=${key}`
  );
  return asArray(json?.items).flatMap((item) => {
    const record = asRecord(item);
    const id = asText(asRecord(record?.id)?.playlistId);
    const snippet = asRecord(record?.snippet);
    if (!id || !snippet || !id.startsWith("OLAK5uy_")) return [];
    const owner = asText(snippet.channelId);
    if (channelId && owner && owner !== channelId) return [];
    return [{
      platform: "youtube_music",
      externalId: id,
      title: (asText(snippet.title) ?? "").replace(/^(?:Album|Альбом)\s*[-–—:]\s*/iu, ""),
      artists: [{ id: owner, name: (asText(snippet.channelTitle) ?? "").replace(/ - Topic$/u, "") }],
      releaseDate: null,
      trackCount: null,
      url: `https://music.youtube.com/playlist?list=${id}`,
      coverUrl: asText(asRecord(asRecord(snippet.thumbnails)?.medium)?.url),
      upc: null
    }];
  });
}

// ---------- Public API ----------

export function isPlatformLookupConfigured(platform: string): boolean {
  switch (platform) {
    case "spotify":
      return Boolean(process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.SPOTIFY_CLIENT_SECRET?.trim());
    case "tidal":
      return Boolean(process.env.TIDAL_CLIENT_ID?.trim() && process.env.TIDAL_CLIENT_SECRET?.trim());
    case "youtube_music":
      return Boolean(youtubeKey());
    case "yandex_music":
      return isYandexEnabled();
    case "apple_music":
    case "deezer":
      return true;
    default:
      return false;
  }
}

export async function searchPlatformArtists(platform: string, name: string): Promise<PlatformArtist[]> {
  switch (platform) {
    case "spotify":
      return searchSpotifyArtists(name);
    case "apple_music":
      return searchAppleArtists(name);
    case "deezer":
      return searchDeezerArtists(name);
    case "yandex_music":
      return searchYandexArtists(name);
    case "youtube_music":
      return searchYoutubeArtists(name);
    default:
      return [];
  }
}

/** The artist's own albums and singles; YouTube needs a per-release search instead (see findYoutubeAlbums). */
export async function listPlatformDiscography(platform: string, artistId: string, artistName: string): Promise<PlatformAlbum[]> {
  switch (platform) {
    case "spotify":
      return listSpotifyAlbums(artistId);
    case "apple_music":
      return listAppleAlbums(artistId);
    case "deezer":
      return listDeezerAlbums(artistId, artistName);
    case "yandex_music":
      return listYandexAlbums(artistId);
    default:
      return [];
  }
}

export async function findYoutubeAlbums(artistName: string, releaseTitle: string, channelId: string | null): Promise<PlatformAlbum[]> {
  return searchYoutubeAlbums(`${artistName} ${releaseTitle}`, channelId);
}

/** The artist behind a profile link the artist pasted: name and picture, so a card can be created from one link. */
export async function getPlatformArtistById(platform: string, id: string): Promise<PlatformArtist | null> {
  switch (platform) {
    case "spotify": {
      const artist = await spotifyGet(`artists/${encodeURIComponent(id)}`);
      const name = asText(artist?.name);
      return name
        ? { platform, externalId: id, name, url: `https://open.spotify.com/artist/${id}`, imageUrl: asText(asRecord(asArray(artist?.images)[0])?.url), hint: null }
        : null;
    }
    case "apple_music": {
      const json = await fetchJson(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&country=ru`);
      const artist = asRecord(asArray(json?.results)[0]);
      const name = asText(artist?.artistName);
      return name
        ? { platform, externalId: id, name, url: appleMusicUrl(asText(artist?.artistLinkUrl)) ?? `https://music.apple.com/ru/artist/${id}`, imageUrl: null, hint: asText(artist?.primaryGenreName) }
        : null;
    }
    case "deezer": {
      const artist = await fetchJson(`https://api.deezer.com/artist/${encodeURIComponent(id)}`);
      const name = asText(artist?.name);
      return name && !artist?.error
        ? { platform, externalId: id, name, url: asText(artist?.link) ?? `https://www.deezer.com/artist/${id}`, imageUrl: asText(artist?.picture_medium), hint: null }
        : null;
    }
    case "yandex_music": {
      const result = await yandexGet(`artists/${encodeURIComponent(id)}/brief-info`);
      const artist = asRecord(result?.artist);
      const name = asText(artist?.name);
      return name
        ? { platform, externalId: id, name, url: `https://music.yandex.ru/artist/${id}`, imageUrl: yandexImage(asRecord(artist?.cover)?.uri), hint: null }
        : null;
    }
    case "youtube_music": {
      const key = youtubeKey();
      if (!key) return null;
      const json = await fetchJson(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${encodeURIComponent(id)}&key=${key}`);
      const snippet = asRecord(asRecord(asArray(json?.items)[0])?.snippet);
      const name = asText(snippet?.title)?.replace(/ - Topic$/u, "");
      return name
        ? { platform, externalId: id, name, url: `https://music.youtube.com/channel/${id}`, imageUrl: asText(asRecord(asRecord(snippet?.thumbnails)?.default)?.url), hint: null }
        : null;
    }
    default:
      return null;
  }
}

/** Which platform a pasted artist profile link belongs to, with its id. */
export function detectArtistProfileUrl(input: string): { platform: string; externalId: string; url: string } | null {
  for (const platform of [...DISCOGRAPHY_PLATFORMS, ...MANUAL_PROFILE_PLATFORMS]) {
    const parsed = parseArtistProfileUrl(platform, input);
    if (parsed) return { platform, ...parsed };
  }
  return null;
}

/** Platforms that can find an album by its UPC — an exact match, no review needed. */
export const UPC_LOOKUP_PLATFORMS = ["spotify", "apple_music", "deezer", "tidal"] as const;

export async function findPlatformAlbumByUpc(platform: string, upc: string): Promise<PlatformAlbum | null> {
  switch (platform) {
    case "spotify":
      return findSpotifyAlbumByUpc(upc);
    case "apple_music":
      return findAppleAlbumByUpc(upc);
    case "deezer":
      return findDeezerAlbumByUpc(upc);
    case "tidal":
      return findTidalAlbumByUpc(upc);
    default:
      return null;
  }
}

/**
 * Whether a saved release link still opens. Only platforms with an album API are checked:
 * true = alive, false = the platform says it is gone, null = could not tell (network, no key, other platform).
 */
export async function checkPlatformAlbumAlive(platform: string, url: string): Promise<boolean | null> {
  try {
    const parsed = new URL(url);
    if (platform === "deezer") {
      const id = /\/album\/(\d+)/u.exec(parsed.pathname)?.[1];
      if (!id) return null;
      const json = await fetchJson(`https://api.deezer.com/album/${id}`);
      if (!json) return null;
      return !json.error;
    }
    if (platform === "apple_music") {
      const id = /\/(\d+)(?:\?|$)/u.exec(parsed.pathname)?.[1] ?? parsed.pathname.split("/").pop();
      if (!id || !/^\d+$/u.test(id)) return null;
      const json = await fetchJson(`https://itunes.apple.com/lookup?id=${id}&country=ru`);
      if (!json) return null;
      return asArray(json.results).length > 0;
    }
    if (platform === "spotify") {
      const id = /\/album\/([A-Za-z0-9]+)/u.exec(parsed.pathname)?.[1];
      if (!id || !(await getSpotifyToken())) return null;
      const token = await getSpotifyToken();
      const response = await fetch(`https://api.spotify.com/v1/albums/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (response.status === 404 || response.status === 400) return false;
      return response.ok ? true : null;
    }
    if (platform === "yandex_music") {
      const id = /\/album\/(\d+)/u.exec(parsed.pathname)?.[1];
      if (!id || !isYandexEnabled()) return null;
      const response = await fetch(`https://api.music.yandex.net/albums/${id}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (response.status === 404) return false;
      if (!response.ok) return null;
      const json = asRecord(await response.json());
      const result = asRecord(json?.result);
      if (!result) return null;
      return result.available !== false;
    }
    return null;
  } catch {
    return null;
  }
}

/** Reads a platform profile ID from a link the artist pasted. */
export function parseArtistProfileUrl(platform: string, input: string): { externalId: string; url: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(/^https?:\/\//iu.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  const path = parsed.pathname;
  const pick = (pattern: RegExp) => pattern.exec(path)?.[1] ?? null;
  let id: string | null = null;
  switch (platform) {
    case "spotify":
      id = host === "open.spotify.com" ? pick(/\/artist\/([A-Za-z0-9]+)/u) : null;
      break;
    case "apple_music":
      id = host === "music.apple.com" ? pick(/\/artist\/(?:[^/]+\/)?(\d+)/u) : null;
      break;
    case "deezer":
      id = host.endsWith("deezer.com") ? pick(/\/artist\/(\d+)/u) : null;
      break;
    case "yandex_music":
      id = host.startsWith("music.yandex.") ? pick(/\/artist\/(\d+)/u) : null;
      break;
    case "youtube_music":
      id = host === "music.youtube.com" || host === "youtube.com" ? pick(/\/channel\/([A-Za-z0-9_-]+)/u) : null;
      break;
    case "vk_music":
      id = ["vk.com", "vk.ru", "m.vk.com", "m.vk.ru", "music.vk.com"].includes(host)
        ? pick(/\/artist\/([A-Za-z0-9_.-]+)/u)
        : null;
      break;
    case "zvuk_wink_music":
      id = host === "zvuk.com" ? pick(/\/artist\/(\d+)/u) : null;
      break;
    default:
      id = null;
  }
  if (!id) return null;
  parsed.search = "";
  parsed.hash = "";
  return { externalId: id, url: parsed.toString() };
}

export interface YandexPlaylistInfo {
  title: string | null;
  coverUrl: string | null;
  /** Yandex shows a playlist's likes as its followers. */
  followers: number | null;
}

/** Cover and followers of a public Yandex Music playlist (`/users/{owner}/playlists/{kind}`). */
export async function getYandexPlaylistInfo(owner: string, kind: string): Promise<YandexPlaylistInfo | null> {
  const result = await yandexGet(`users/${encodeURIComponent(owner)}/playlists/${encodeURIComponent(kind)}`);
  if (!result) return null;
  const cover = asRecord(result.cover);
  const coverUri =
    asText(cover?.uri) ?? asText(asArray(cover?.itemsUri)[0]) ?? asText(result.ogImage) ?? null;
  return {
    title: asText(result.title),
    coverUrl: yandexImage(coverUri, "400x400"),
    followers: asCount(result.likesCount)
  };
}
