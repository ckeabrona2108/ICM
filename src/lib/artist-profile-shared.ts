const compactUuidPattern = /-([0-9a-f]{32})$/iu;

export const PERSONAL_ARTIST_PROFILE_KEY = "__personal__";

function transliterate(value: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya"
  };
  return Array.from(value.toLowerCase()).map((character) => map[character] ?? character).join("");
}

function slugifyArtistName(value: string): string {
  return transliterate(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "artist";
}

export function sanitizeArtistProfileSlugSegment(value: string): string {
  return slugifyArtistName(value);
}

export function normalizeArtistProfileKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
}

export function extractArtistPublicNames(value: string): string[] {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!normalized) return [];

  const parenthesized = Array.from(normalized.matchAll(/\(([^()]{1,100})\)/gu))
    .map((match) => match[1]?.trim())
    .filter((name): name is string => Boolean(name));
  if (parenthesized.length > 0) return Array.from(new Set(parenthesized));

  const slashNicknames = Array.from(normalized.matchAll(
    /\/\s*([^/]+?)(?=\s+\p{Lu}[\p{L}'’-]+\s+\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+)?\s*\/|$)/gu
  ))
    .map((match) => match[1]?.trim())
    .filter((name): name is string => Boolean(name));
  if (slashNicknames.length > 0) return Array.from(new Set(slashNicknames));

  return [normalized];
}

export function buildArtistProfileSlug(displayName: string, userId: string): string {
  return `${slugifyArtistName(displayName)}-${userId.replace(/-/gu, "").toLowerCase()}`;
}

export function buildPersonalProfileSlug(displayName: string, userId: string): string {
  return `user-${slugifyArtistName(displayName)}-${userId.replace(/-/gu, "").toLowerCase()}`;
}

export function parseArtistProfileUserId(slug: string): string | null {
  const compact = compactUuidPattern.exec(slug.trim())?.[1]?.toLowerCase();
  if (!compact) return null;
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20)
  ].join("-");
}
