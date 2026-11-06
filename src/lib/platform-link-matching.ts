/** Pure helpers that decide whether an album found on a platform is the artist's release. */

export interface PlatformAlbum {
  platform: string;
  externalId: string;
  title: string;
  artists: Array<{ id: string | null; name: string }>;
  /** YYYY-MM-DD, or YYYY when the platform only knows the year. */
  releaseDate: string | null;
  trackCount: number | null;
  url: string;
  coverUrl: string | null;
  upc: string | null;
}

export interface ReleaseForMatching {
  title: string;
  artistNames: string[];
  releaseDate: string;
  trackCount: number;
}

export interface MatchCheck {
  field: "title" | "artists" | "date" | "tracks";
  ok: boolean | null;
  note: string;
}

export interface AlbumMatch {
  album: PlatformAlbum;
  score: number;
  checks: MatchCheck[];
}

/** Score from which a match inside a confirmed artist profile is saved without asking. */
export const AUTO_MATCH_SCORE = 80;
/** Lowest score still shown to the artist as "Это он?". */
export const REVIEW_MATCH_SCORE = 45;

const FEAT_PATTERN = /\s*[([]?\s*(?:feat\.?|ft\.?|featuring|при\s+уч\.?|prod\.?(?:\s+by)?)\s+[^)\]]*[)\]]?/giu;

export function normalizeMatchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/gu, "е")
    .replace(FEAT_PATTERN, " ")
    .replace(/\s*-\s*(?:single|ep|альбом|album)$/giu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function normalizeArtistMatchName(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/ё/gu, "е").replace(/[^\p{L}\p{N}]+/gu, "");
}

function daysBetween(left: string, right: string): number | null {
  const a = Date.parse(left.length === 4 ? `${left}-01-01` : left);
  const b = Date.parse(right.length === 4 ? `${right}-01-01` : right);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.abs(a - b) / 86_400_000;
}

export function scoreAlbumMatch(release: ReleaseForMatching, album: PlatformAlbum): AlbumMatch {
  const checks: MatchCheck[] = [];
  let score = 0;

  const ours = normalizeMatchText(release.title);
  const theirs = normalizeMatchText(album.title);
  if (ours && ours === theirs) {
    score += 55;
    checks.push({ field: "title", ok: true, note: "совпадает" });
  } else if (ours && theirs && (theirs.startsWith(ours) || ours.startsWith(theirs))) {
    score += 30;
    checks.push({ field: "title", ok: null, note: "похоже, но отличается" });
  } else {
    checks.push({ field: "title", ok: false, note: "другое название" });
  }

  const ourArtists = release.artistNames.map(normalizeArtistMatchName).filter(Boolean);
  const theirArtists = album.artists.map((artist) => normalizeArtistMatchName(artist.name)).filter(Boolean);
  if (theirArtists.length === 0) {
    checks.push({ field: "artists", ok: null, note: "площадка не указала" });
  } else if (ourArtists.length > 0 && ourArtists[0] === theirArtists[0]) {
    score += 10;
    checks.push({ field: "artists", ok: true, note: "совпадают" });
  } else if (ourArtists.some((name) => theirArtists.includes(name))) {
    score += 5;
    checks.push({ field: "artists", ok: null, note: `основной — ${album.artists[0]?.name ?? "другой"}` });
  } else {
    score -= 20;
    checks.push({ field: "artists", ok: false, note: album.artists.map((artist) => artist.name).join(", ") });
  }

  if (album.releaseDate) {
    const diff = daysBetween(release.releaseDate.slice(0, 10), album.releaseDate);
    const sameYear = release.releaseDate.slice(0, 4) === album.releaseDate.slice(0, 4);
    if (album.releaseDate.length > 4 && diff !== null && diff <= 7) {
      score += 25;
      checks.push({ field: "date", ok: true, note: album.releaseDate });
    } else if (album.releaseDate.length === 4 && sameYear) {
      score += 12;
      checks.push({ field: "date", ok: null, note: `${album.releaseDate} год` });
    } else {
      score -= 5;
      checks.push({ field: "date", ok: false, note: album.releaseDate });
    }
  } else {
    checks.push({ field: "date", ok: null, note: "площадка не указала" });
  }

  if (album.trackCount !== null && release.trackCount > 0) {
    if (album.trackCount === release.trackCount) {
      score += 10;
      checks.push({ field: "tracks", ok: true, note: String(album.trackCount) });
    } else {
      score -= 5;
      checks.push({ field: "tracks", ok: false, note: `${album.trackCount} вместо ${release.trackCount}` });
    }
  } else {
    checks.push({ field: "tracks", ok: null, note: "площадка не указала" });
  }

  return { album, score: Math.max(0, Math.min(100, score)), checks };
}

/**
 * Picks what to do with the albums found in the artist's confirmed profile:
 * one clear winner is saved, close or weak candidates go to the artist, nothing plausible means "not found".
 */
export function pickAlbumMatch(
  release: ReleaseForMatching,
  albums: PlatformAlbum[],
  rejectedUrls: string[] = []
): { decision: "auto" | "review" | "none"; matches: AlbumMatch[] } {
  const rejected = new Set(rejectedUrls);
  const matches = albums
    .filter((album) => !rejected.has(album.url))
    .map((album) => scoreAlbumMatch(release, album))
    .filter((match) => match.score >= REVIEW_MATCH_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const [best, second] = matches;
  if (!best) return { decision: "none", matches: [] };
  const clearWinner = !second || best.score - second.score >= 20;
  return { decision: best.score >= AUTO_MATCH_SCORE && clearWinner ? "auto" : "review", matches };
}

/** How many of the artist's release titles show up in a platform profile's discography. */
export function countCatalogOverlap(releaseTitles: string[], albums: PlatformAlbum[]): number {
  const theirs = new Set(albums.map((album) => normalizeMatchText(album.title)).filter(Boolean));
  return new Set(releaseTitles.map(normalizeMatchText).filter((title) => title && theirs.has(title))).size;
}
