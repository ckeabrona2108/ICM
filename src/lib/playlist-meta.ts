import { getYandexPlaylistInfo } from "@/lib/platform-catalog-providers";

/**
 * Playlist cover and followers for the artist's "Плейлисты" page, read from the platform by the
 * playlist link. Editorial playlists change slowly, so answers are kept for a few hours per server.
 */

export interface PlaylistMeta {
  coverUrl: string | null;
  followers: number | null;
}

const TTL_MS = 6 * 60 * 60 * 1000;
const FAILED_TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { meta: PlaylistMeta | null; expiresAt: number }>();

/** `{ owner, kind }` of a https://music.yandex.ru/users/{owner}/playlists/{kind} link. */
export function parseYandexPlaylistUrl(url: string): { owner: string; kind: string } | null {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)music\.yandex\.(ru|com|by|kz|uz)$/u.test(parsed.hostname)) return null;
    const match = parsed.pathname.match(/^\/users\/([^/]+)\/playlists\/(\d+)\/?$/u);
    return match ? { owner: decodeURIComponent(match[1]!), kind: match[2]! } : null;
  } catch {
    return null;
  }
}

async function fetchPlaylistMeta(url: string): Promise<PlaylistMeta | null> {
  const yandex = parseYandexPlaylistUrl(url);
  if (yandex) {
    const info = await getYandexPlaylistInfo(yandex.owner, yandex.kind);
    return info ? { coverUrl: info.coverUrl, followers: info.followers } : null;
  }
  return null;
}

export async function getPlaylistMeta(url: string, now = Date.now()): Promise<PlaylistMeta | null> {
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) return cached.meta;
  const meta = await fetchPlaylistMeta(url).catch(() => null);
  cache.set(url, { meta, expiresAt: now + (meta ? TTL_MS : FAILED_TTL_MS) });
  return meta;
}

/** Meta for many links at once; each distinct playlist is asked for once. */
export async function getPlaylistMetaMap(urls: string[]): Promise<Map<string, PlaylistMeta | null>> {
  const unique = [...new Set(urls)];
  const entries = await Promise.all(unique.map(async (url) => [url, await getPlaylistMeta(url)] as const));
  return new Map(entries);
}
