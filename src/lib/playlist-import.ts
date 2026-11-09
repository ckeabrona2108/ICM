import type { PrismaClient } from "@prisma/client";

import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";

/**
 * Editorial playlist reports from the distributor (Zvonko). The Yandex report has no UPC:
 * "Артист | Наименование трека | Позиция | Плейлист | Ссылка на плейлист", so a row is tied to a
 * release by track title + artist nickname. Older reports with a UPC/ISRC column still work.
 */

export interface PlaylistReportRow {
  upc: string;
  artistName: string;
  trackTitle: string;
  position: string;
  playlistName: string;
  playlistUrl: string;
}

function cell(row: Record<string, unknown>, names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((candidate) => candidate.trim().toLowerCase() === name.toLowerCase());
    if (key === undefined) continue;
    const value = row[key];
    if (value === null || value === undefined) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function parsePlaylistReportRow(row: Record<string, unknown>): PlaylistReportRow | null {
  const parsed: PlaylistReportRow = {
    upc: cell(row, ["UPC", "ISRC"]),
    artistName: cell(row, ["Артист", "Исполнитель"]),
    trackTitle: cell(row, ["Наименование трека", "Наименование", "Трек", "Название трека"]),
    position: cell(row, ["Позиция"]),
    playlistName: cell(row, ["Плейлист"]),
    playlistUrl: cell(row, ["Ссылка на плейлист", "Ссылка на", "Ссылка"])
  };
  if (!parsed.playlistName || !parsed.playlistUrl) return null;
  if (!parsed.upc && !(parsed.artistName && parsed.trackTitle)) return null;
  return parsed;
}

/** Platform from the playlist link, for when the admin did not pick one. */
export function detectPlaylistPlatform(url: string): string | null {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host.includes("yandex")) return "YANDEX";
  if (host.includes("vk.com") || host.includes("vk.ru")) return "VK";
  if (host.includes("apple.com")) return "APPLE";
  if (host.includes("spotify.com")) return "SPOTIFY";
  return null;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/**
 * Key that identifies one track in one playlist. Rows without a UPC are keyed by artist + title so
 * a repeated upload updates the same record instead of adding a copy.
 */
export function placementTrackKey(row: Pick<PlaylistReportRow, "upc" | "artistName" | "trackTitle">): string {
  if (row.upc) return row.upc;
  return `track:${normalizeName(row.artistName)}|${normalizeName(row.trackTitle)}`;
}

function artistMatches(performer: string | null | undefined, artist: string): boolean {
  if (!performer) return false;
  const target = normalizeName(artist);
  return normalizeName(performer)
    .split(/\s*(?:,|&|\/|\bfeat\.?|\bft\.?|\bx\b)\s*/u)
    .concat(normalizeName(performer))
    .some((name) => name === target);
}

export interface PlaylistReleaseMatch {
  releaseId: string;
  userId: string;
  upc: string | null;
}

/**
 * Finds the release a row belongs to. Returns null when nothing or several different artists'
 * releases match, so a wrong cabinet never gets someone else's playlist.
 */
export async function matchPlaylistRowToRelease(
  prisma: PrismaClient,
  row: PlaylistReportRow
): Promise<PlaylistReleaseMatch | null> {
  if (row.upc) {
    const release = await prisma.release.findFirst({
      where: { upc: row.upc },
      select: { id: true, userId: true, upc: true }
    });
    if (release) return { releaseId: release.id, userId: release.userId, upc: release.upc };
  }
  if (!row.trackTitle || !row.artistName) return null;

  const tracks = await prisma.track.findMany({
    where: { title: { equals: row.trackTitle, mode: "insensitive" } },
    select: {
      release: {
        select: {
          id: true,
          userId: true,
          upc: true,
          status: true,
          confirmed: true,
          roles: true,
          performer: true,
          feat: true,
          date: true
        }
      }
    },
    take: 50
  });

  const candidates = tracks
    .map((track) => track.release)
    .filter((release) => artistMatches(release.performer, row.artistName) || artistMatches(release.feat, row.artistName))
    .filter((release) =>
      shouldTreatReleaseAsApproved({
        status: release.status,
        confirmed: release.confirmed,
        upc: release.upc,
        roles: release.roles
      })
    );
  if (candidates.length === 0) return null;
  if (new Set(candidates.map((release) => release.userId)).size > 1) return null;

  // The same track can sit in a single and in a later album: prefer the newest release.
  const best = [...candidates].sort((a, b) => b.date.getTime() - a.date.getTime())[0]!;
  return { releaseId: best.id, userId: best.userId, upc: best.upc };
}
