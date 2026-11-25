import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-metadata";

// schema.org JSON-LD for public pages, so Google and Yandex can show releases and events as rich results.

function absoluteMediaUrl(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return absoluteSiteUrl(trimmed.startsWith("/") ? trimmed : `/${trimmed}`);
}

function validDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export interface ReleaseJsonLdInput {
  title: string;
  artist: string;
  publicSlug: string;
  coverUrl: string | null;
  releaseDate: string;
  genre: string;
  upc: string | null;
  /** Live platform links: they become sameAs and listen actions. */
  platformUrls: string[];
}

export function buildReleaseJsonLd(input: ReleaseJsonLdInput) {
  const url = absoluteSiteUrl(`/l/${encodeURIComponent(input.publicSlug)}`);
  const platformUrls = [...new Set(input.platformUrls.filter((href) => /^https?:\/\//i.test(href)))];

  return {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: input.title,
    url,
    image: absoluteMediaUrl(input.coverUrl),
    datePublished: validDate(input.releaseDate),
    genre: input.genre.trim() || undefined,
    byArtist: { "@type": "MusicGroup", name: input.artist },
    inAlbum: input.upc ? { "@type": "MusicAlbum", name: input.title, identifier: input.upc } : undefined,
    sameAs: platformUrls.length ? platformUrls : undefined,
    potentialAction: platformUrls.length
      ? platformUrls.map((target) => ({ "@type": "ListenAction", target }))
      : undefined,
    publisher: { "@type": "Organization", name: SITE_NAME, url: absoluteSiteUrl("/") }
  };
}

export interface EventJsonLdInput {
  title: string;
  slug: string;
  description: string;
  startsAt: string;
  endsAt: string;
  status: string;
  city: string;
  venueName: string;
  address: string;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  coverImageUrl: string;
  posterImageUrl: string;
  imageUrls: string[];
  artists: Array<{ displayName: string }>;
  ticketTypes: Array<{ name: string; price: number | string; currency: string; remaining: number }>;
  ticketSalesEnabled: boolean;
}

const EVENT_STATUS: Record<string, string> = {
  CANCELLED: "https://schema.org/EventCancelled"
};

export function buildEventJsonLd(input: EventJsonLdInput) {
  const url = absoluteSiteUrl(`/events/${encodeURIComponent(input.slug)}`);
  const images = [input.coverImageUrl, input.posterImageUrl, ...input.imageUrls]
    .map((value) => absoluteMediaUrl(value))
    .filter((value): value is string => Boolean(value));
  const hasGeo = typeof input.latitude === "number" && typeof input.longitude === "number";
  const locationName = input.venueName || input.city || input.address;

  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: input.title,
    url,
    description: input.description.trim() || undefined,
    startDate: validDate(input.startsAt),
    endDate: validDate(input.endsAt),
    eventStatus: EVENT_STATUS[input.status] ?? "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: images.length ? [...new Set(images)] : undefined,
    location: locationName
      ? {
          "@type": "Place",
          name: locationName,
          address: input.address || input.city || undefined,
          geo: hasGeo ? { "@type": "GeoCoordinates", latitude: input.latitude, longitude: input.longitude } : undefined
        }
      : undefined,
    performer: input.artists.length
      ? input.artists.map((artist) => ({ "@type": "MusicGroup", name: artist.displayName }))
      : undefined,
    offers: input.ticketTypes.length
      ? input.ticketTypes.map((ticket) => ({
          "@type": "Offer",
          name: ticket.name,
          price: Number(ticket.price),
          priceCurrency: ticket.currency || "RUB",
          url,
          availability:
            input.ticketSalesEnabled && ticket.remaining > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut"
        }))
      : undefined
  };
}
