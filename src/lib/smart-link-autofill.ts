import { detectSmartLinkPlatform } from "@/lib/smart-link-platforms";
import { normalizeSmartLinkHref } from "@/lib/smart-link-urls";

const REQUEST_TIMEOUT_MS = 8000;

// song.link platform keys → our platform codes. VK Музыка and Звук are not covered by any public UPC search.
const ODESLI_PLATFORM_CODES: Record<string, string> = {
  spotify: "spotify",
  appleMusic: "apple_music",
  itunes: "itunes",
  youtubeMusic: "youtube_music",
  deezer: "deezer",
  tidal: "tidal",
  amazonMusic: "amazon_music",
  soundcloud: "soundcloud",
  yandex: "yandex_music",
  pandora: "pandora",
  anghami: "anghami"
};

/** Platforms this module can find by UPC; the rest have to be pasted by the artist. */
export const SMART_LINK_AUTOFILL_CODES = Array.from(new Set(Object.values(ODESLI_PLATFORM_CODES)));

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
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

export function normalizeSmartLinkUpc(input: string | null | undefined): string | null {
  const digits = (input ?? "").replace(/\D/gu, "");
  return digits.length >= 12 && digits.length <= 14 ? digits : null;
}

/** Keeps a found link only if it is a safe URL that really points to the expected platform. */
function acceptLink(code: string, url: unknown): string | null {
  if (typeof url !== "string") return null;
  const normalized = normalizeSmartLinkHref(url);
  if (!normalized || detectSmartLinkPlatform(normalized) !== code) return null;
  return normalized;
}

async function findDeezerAlbum(upc: string): Promise<string | null> {
  const json = await fetchJson(`https://api.deezer.com/album/upc:${upc}`);
  if (!json || json.error) return null;
  return acceptLink("deezer", json.link);
}

async function findAppleAlbum(upc: string): Promise<string | null> {
  const json = await fetchJson(`https://itunes.apple.com/lookup?upc=${upc}&entity=album&country=ru`);
  const results = Array.isArray(json?.results) ? json.results : [];
  for (const item of results) {
    const raw = asRecord(item)?.collectionViewUrl;
    if (typeof raw !== "string") continue;
    try {
      const parsed = new URL(raw.replace("://itunes.apple.com/", "://music.apple.com/"));
      parsed.searchParams.delete("uo");
      const accepted = acceptLink("apple_music", parsed.toString());
      if (accepted) return accepted;
    } catch {
      continue;
    }
  }
  return null;
}

async function findSpotifyAlbum(upc: string): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const token = await fetchJson("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  const accessToken = typeof token?.access_token === "string" ? token.access_token : null;
  if (!accessToken) return null;

  const json = await fetchJson(`https://api.spotify.com/v1/search?type=album&limit=1&q=${encodeURIComponent(`upc:${upc}`)}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const items = asRecord(json?.albums)?.items;
  const first = Array.isArray(items) ? asRecord(items[0]) : null;
  return acceptLink("spotify", asRecord(first?.external_urls)?.spotify);
}

/** Pulls platform links out of a song.link (Odesli) API response. */
export function mapOdesliLinks(json: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  const linksByPlatform = asRecord(asRecord(json)?.linksByPlatform);
  if (!linksByPlatform) return result;
  for (const [key, code] of Object.entries(ODESLI_PLATFORM_CODES)) {
    const accepted = acceptLink(code, asRecord(linksByPlatform[key])?.url);
    if (accepted && !result[code]) result[code] = accepted;
  }
  return result;
}

async function expandWithOdesli(seedUrl: string): Promise<Record<string, string>> {
  // song.link closed keyless access (401 PUBLIC_API_ACCESS_DEPRECATED), so it is only used with a key.
  const key = process.env.ODESLI_API_KEY?.trim();
  if (!key) return {};
  const params = new URLSearchParams({ url: seedUrl, userCountry: "RU", key });
  return mapOdesliLinks(await fetchJson(`https://api.song.link/v1-alpha.1/links?${params.toString()}`));
}

/**
 * Finds release links by UPC: Deezer and Apple look the album up directly (Spotify too with SPOTIFY_CLIENT_ID/SECRET),
 * then song.link (with ODESLI_API_KEY) expands one of them into YouTube Music, Яндекс Музыка, TIDAL, Amazon and others.
 */
export async function findSmartLinkPlatformLinksByUpc(upcInput: string | null | undefined): Promise<Record<string, string>> {
  const upc = normalizeSmartLinkUpc(upcInput);
  if (!upc) return {};

  const [deezer, apple, spotify] = await Promise.all([findDeezerAlbum(upc), findAppleAlbum(upc), findSpotifyAlbum(upc)]);
  const found: Record<string, string> = {};
  if (deezer) found.deezer = deezer;
  if (apple) found.apple_music = apple;
  if (spotify) found.spotify = spotify;

  const seed = spotify ?? apple ?? deezer;
  if (seed) {
    for (const [code, url] of Object.entries(await expandWithOdesli(seed))) {
      if (!found[code]) found[code] = url;
    }
  }
  return found;
}
