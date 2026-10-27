const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/iu;
const HOST_LIKE_PATTERN = /^[^\s/?#@]+\.[^\s/?#@]{2,}(?:[/?#]\S*)?$/u;

/**
 * Normalizes a user-provided link for storage: only http(s) URLs survive,
 * bare domains get an https:// prefix, everything else (javascript:, data:, junk) becomes "".
 */
export function normalizeSmartLinkHref(input: unknown): string {
  if (typeof input !== "string") return "";
  const trimmed = input.trim();
  if (!trimmed) return "";

  let candidate = trimmed;
  if (candidate.startsWith("//")) {
    candidate = `https:${candidate}`;
  } else if (!SCHEME_PATTERN.test(candidate)) {
    if (!HOST_LIKE_PATTERN.test(candidate)) return "";
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

/** Render-time guard for values stored before normalization existed. */
export function safeSmartLinkHref(input: unknown): string | null {
  return normalizeSmartLinkHref(input) || null;
}

export interface SmartLinkPixelIds {
  meta: string[];
  vkRetargeting: string[];
  topMailRu: string[];
}

/**
 * Picks pixel ids out of owner-entered rows. Only strictly formatted ids are accepted,
 * so the values can be embedded into tracking snippets without escaping concerns.
 */
export function parseSmartLinkPixelIds(entries: Array<{ label: string; value: string; enabled: boolean }>): SmartLinkPixelIds {
  const result: SmartLinkPixelIds = { meta: [], vkRetargeting: [], topMailRu: [] };

  for (const entry of entries) {
    if (!entry.enabled) continue;
    const value = entry.value.trim();
    if (!value) continue;
    const label = entry.label.trim().toLowerCase();

    if (/^vk-rtrg-\d+-[a-z0-9]+$/iu.test(value)) {
      result.vkRetargeting.push(value);
      continue;
    }
    if (!/^\d{5,20}$/u.test(value)) continue;
    if (/meta|facebook|fb/u.test(label)) {
      result.meta.push(value);
    } else if (/vk|вк|mail|top/u.test(label)) {
      result.topMailRu.push(value);
    }
  }

  return {
    meta: Array.from(new Set(result.meta)),
    vkRetargeting: Array.from(new Set(result.vkRetargeting)),
    topMailRu: Array.from(new Set(result.topMailRu))
  };
}

function decodeHeaderValue(value: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

/** Reads visitor geo from whichever proxy is in front of the app (Vercel, Cloudflare, nginx geoip). */
export function readSmartLinkGeo(headers: Headers): { country: string | null; city: string | null } {
  const country =
    decodeHeaderValue(headers.get("x-vercel-ip-country")) ??
    decodeHeaderValue(headers.get("cf-ipcountry")) ??
    decodeHeaderValue(headers.get("x-geo-country"));
  const city =
    decodeHeaderValue(headers.get("x-vercel-ip-city")) ??
    decodeHeaderValue(headers.get("cf-ipcity")) ??
    decodeHeaderValue(headers.get("x-geo-city"));

  return {
    country: country && country.toUpperCase() !== "XX" ? country : null,
    city
  };
}

/**
 * Route params for non-ASCII slugs ("олег-jijo") arrive percent-encoded, so lookups by the raw param miss.
 * Decodes once and falls back to the raw value for malformed input.
 */
export function decodeSmartLinkSlug(input: string | null | undefined): string {
  const raw = (input ?? "").trim();
  if (!raw.includes("%")) return raw;
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw;
  }
}
