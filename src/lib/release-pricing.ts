/** Pay-as-you-go release price: a base fee plus per-track extras.
 * Subscribers within their release quota never reach this price. */
export const RELEASE_BASE_PRICE_RUB = 350;
export const RELEASE_LYRICS_PRICE_RUB = 75;
export const RELEASE_KARAOKE_PRICE_RUB = 75;
export const RELEASE_VIDEO_PRICE_RUB = 150;

export interface ReleasePricingTrack {
  text?: string | null;
  text_sync?: string | null;
  video?: string | null;
  video_shot?: string | null;
}

export type ReleasePriceExtraKind = "lyrics" | "karaoke" | "video";

export interface ReleasePriceLine {
  kind: "base" | ReleasePriceExtraKind;
  label: string;
  unitRub: number;
  count: number;
  amountRub: number;
}

export interface ReleasePrice {
  lines: ReleasePriceLine[];
  totalRub: number;
}

const filled = (value: string | null | undefined) => Boolean(value?.trim());

const EXTRAS: Array<{
  kind: ReleasePriceExtraKind;
  label: string;
  unitRub: number;
  has: (track: ReleasePricingTrack) => boolean;
}> = [
  { kind: "lyrics", label: "Текст трека", unitRub: RELEASE_LYRICS_PRICE_RUB, has: (t) => filled(t.text) },
  { kind: "karaoke", label: "Караоке (TTML)", unitRub: RELEASE_KARAOKE_PRICE_RUB, has: (t) => filled(t.text_sync) },
  // The wizard stores its single video upload in both columns; it is one video per track.
  { kind: "video", label: "Видео", unitRub: RELEASE_VIDEO_PRICE_RUB, has: (t) => filled(t.video) || filled(t.video_shot) }
];

export function calculateReleasePrice(tracks: ReleasePricingTrack[]): ReleasePrice {
  const lines: ReleasePriceLine[] = [
    { kind: "base", label: "Релиз", unitRub: RELEASE_BASE_PRICE_RUB, count: 1, amountRub: RELEASE_BASE_PRICE_RUB }
  ];
  for (const extra of EXTRAS) {
    const count = tracks.filter(extra.has).length;
    if (count > 0) {
      lines.push({ kind: extra.kind, label: extra.label, unitRub: extra.unitRub, count, amountRub: count * extra.unitRub });
    }
  }
  return { lines, totalRub: lines.reduce((sum, line) => sum + line.amountRub, 0) };
}

export const RELEASE_PRICING_TRACK_SELECT = {
  text: true,
  text_sync: true,
  video: true,
  video_shot: true
} as const;
