import {
  calculateReleasePrice,
  RELEASE_KARAOKE_PRICE_RUB,
  RELEASE_LYRICS_PRICE_RUB,
  RELEASE_VIDEO_PRICE_RUB,
  type ReleasePrice,
  type ReleasePriceExtraKind,
  type ReleasePriceLine,
  type ReleasePricingTrack
} from "@/lib/release-pricing";

/**
 * Paid extras (lyrics, karaoke, video) added to an already paid release.
 *
 * A paid release's tracks are what was paid for. When the artist re-sends a paid release
 * (an edited copy of an approved one, or a release returned for changes) with more tracks
 * carrying an extra than before, the difference is charged before the release goes to
 * moderation. Active subscribers have extras included and are never charged.
 */

export type ReleaseExtrasCounts = Record<ReleasePriceExtraKind, number>;

const filled = (value: string | null | undefined) => Boolean(value?.trim());

const EXTRAS: Array<{
  kind: ReleasePriceExtraKind;
  label: string;
  unitRub: number;
  has: (track: ReleasePricingTrack) => boolean;
}> = [
  { kind: "lyrics", label: "Текст трека", unitRub: RELEASE_LYRICS_PRICE_RUB, has: (t) => filled(t.text) },
  { kind: "karaoke", label: "Караоке (TTML)", unitRub: RELEASE_KARAOKE_PRICE_RUB, has: (t) => filled(t.text_sync) },
  { kind: "video", label: "Видео", unitRub: RELEASE_VIDEO_PRICE_RUB, has: (t) => filled(t.video) || filled(t.video_shot) }
];

export function countReleaseExtras(tracks: readonly ReleasePricingTrack[]): ReleaseExtrasCounts {
  const counts: ReleaseExtrasCounts = { lyrics: 0, karaoke: 0, video: 0 };
  for (const extra of EXTRAS) counts[extra.kind] = tracks.filter(extra.has).length;
  return counts;
}

/** Extras on `tracks` beyond what `paid` already covers. Base fee is never charged again. */
export function calculateExtrasSupplement(
  tracks: readonly ReleasePricingTrack[],
  paid: ReleaseExtrasCounts
): ReleasePrice {
  const now = countReleaseExtras(tracks);
  const lines: ReleasePriceLine[] = [];
  for (const extra of EXTRAS) {
    const count = Math.max(0, now[extra.kind] - (paid[extra.kind] ?? 0));
    if (count > 0) {
      lines.push({ kind: extra.kind, label: extra.label, unitRub: extra.unitRub, count, amountRub: count * extra.unitRub });
    }
  }
  return { lines, totalRub: lines.reduce((sum, line) => sum + line.amountRub, 0) };
}

/** Key in `release.roles` for a pending or paid extras supplement. */
export const RELEASE_EXTRAS_SUPPLEMENT_KEY = "extrasSupplement";

export interface ReleaseExtrasSupplement {
  /** Extras covered by the earlier payment. */
  paid: ReleaseExtrasCounts;
  /** Sum asked when the release was re-sent. */
  amountRub: number;
  requestedAt: string;
  /** Approved release the supplement belongs to, for an edited copy. */
  sourceReleaseId?: string;
  paidAt?: string;
  orderId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function readExtrasSupplement(roles: unknown): ReleaseExtrasSupplement | null {
  const marker = asRecord(asRecord(roles)?.[RELEASE_EXTRAS_SUPPLEMENT_KEY]);
  const paid = asRecord(marker?.paid);
  if (!marker || !paid || typeof marker.requestedAt !== "string") return null;
  const state: ReleaseExtrasSupplement = {
    paid: { lyrics: readCount(paid.lyrics), karaoke: readCount(paid.karaoke), video: readCount(paid.video) },
    amountRub: readCount(marker.amountRub),
    requestedAt: marker.requestedAt
  };
  if (typeof marker.sourceReleaseId === "string" && marker.sourceReleaseId) state.sourceReleaseId = marker.sourceReleaseId;
  if (typeof marker.paidAt === "string" && marker.paidAt) state.paidAt = marker.paidAt;
  if (typeof marker.orderId === "string" && marker.orderId) state.orderId = marker.orderId;
  return state;
}

/** A supplement that was asked and not paid yet. */
export function readPendingExtrasSupplement(roles: unknown): ReleaseExtrasSupplement | null {
  const marker = readExtrasSupplement(roles);
  return marker && !marker.paidAt ? marker : null;
}

export function withExtrasSupplement(
  roles: Record<string, unknown>,
  params: { paid: ReleaseExtrasCounts; amountRub: number; sourceReleaseId?: string | null; at?: Date }
): Record<string, unknown> {
  const marker: ReleaseExtrasSupplement = {
    paid: params.paid,
    amountRub: params.amountRub,
    requestedAt: (params.at ?? new Date()).toISOString()
  };
  if (params.sourceReleaseId) marker.sourceReleaseId = params.sourceReleaseId;
  return { ...roles, [RELEASE_EXTRAS_SUPPLEMENT_KEY]: marker };
}

/** Drops an earlier supplement marker: the release is re-sent and priced again. */
export function withoutExtrasSupplement(roles: Record<string, unknown>): Record<string, unknown> {
  if (!(RELEASE_EXTRAS_SUPPLEMENT_KEY in roles)) return roles;
  const next = { ...roles };
  delete next[RELEASE_EXTRAS_SUPPLEMENT_KEY];
  return next;
}

export function withExtrasSupplementPaid(
  roles: Record<string, unknown>,
  params: { orderId: string; at?: Date }
): Record<string, unknown> {
  const marker = asRecord(roles[RELEASE_EXTRAS_SUPPLEMENT_KEY]);
  if (!marker) return roles;
  return {
    ...roles,
    [RELEASE_EXTRAS_SUPPLEMENT_KEY]: { ...marker, paidAt: (params.at ?? new Date()).toISOString(), orderId: params.orderId }
  };
}

/** What an unpaid release costs now: the extras supplement for a re-sent paid release, else the full price. */
export function resolveReleaseAmountDue(
  roles: unknown,
  tracks: readonly ReleasePricingTrack[]
): { price: ReleasePrice; supplement: boolean } {
  const pending = readPendingExtrasSupplement(roles);
  if (pending) return { price: calculateExtrasSupplement(tracks, pending.paid), supplement: true };
  return { price: calculateReleasePrice([...tracks]), supplement: false };
}

/**
 * Decides whether a paid release re-sent with `nextTracks` owes a supplement.
 * `paidTracks` are the tracks of the paid release before this edit (the approved original for a copy).
 */
export function planExtrasSupplement(params: {
  paidTracks: readonly ReleasePricingTrack[];
  nextTracks: readonly ReleasePricingTrack[];
  /** An earlier unpaid supplement keeps its baseline, so a second edit cannot reset it. */
  pending?: ReleaseExtrasSupplement | null;
  extrasIncluded: boolean;
}): { paid: ReleaseExtrasCounts; price: ReleasePrice } | null {
  if (params.extrasIncluded) return null;
  const paid = params.pending?.paid ?? countReleaseExtras(params.paidTracks);
  const price = calculateExtrasSupplement(params.nextTracks, paid);
  return price.totalRub > 0 ? { paid, price } : null;
}

/** Payment label for a release waiting for an extras supplement, or null. */
export function describePendingExtrasSupplement(roles: unknown, confirmed: boolean): string | null {
  if (confirmed) return null;
  const pending = readPendingExtrasSupplement(roles);
  if (!pending) return null;
  return pending.amountRub > 0 ? `Ждёт доплату за дополнения: ${pending.amountRub} ₽` : "Ждёт доплату за дополнения";
}
