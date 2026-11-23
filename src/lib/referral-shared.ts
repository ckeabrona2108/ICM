/**
 * Referral program rules. Client-safe (no server imports).
 *
 * A friend who signs up by an artist's link gets 20% off their first payment. The artist gets a
 * bonus release for every friend who pays real money (a release or a subscription) — the friend's
 * free first single never counts. The bonus is given 14 days after the payment, so a refunded
 * payment gives nothing. Ladder: 3 paying friends add a month of PRO, 5 a month of ENTERPRISE.
 */

export const REFERRAL_DISCOUNT_PERCENT = 20;
export const REFERRAL_REWARD_DELAY_DAYS = 14;
export const REFERRAL_COOKIE = "icm_ref";
export const REFERRAL_COOKIE_DAYS = 90;
/** A payment smaller than this (e.g. a lone extras supplement) does not make the friend "paying". */
export const REFERRAL_MIN_PAYMENT_RUB = 250;

export type ReferralLadderPlan = "PRO" | "ENTERPRISE";

export const REFERRAL_LADDER: ReadonlyArray<{ step: number; plan: ReferralLadderPlan; label: string }> = [
  { step: 3, plan: "PRO", label: "месяц PRO" },
  { step: 5, plan: "ENTERPRISE", label: "месяц ENTERPRISE" }
];

export function applyReferralDiscount(amountRub: number): number {
  return Math.round(amountRub * (100 - REFERRAL_DISCOUNT_PERCENT) / 100);
}

export function normalizeReferralCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toLowerCase();
  return /^[a-z0-9]{6,16}$/u.test(code) ? code : null;
}

export type ReferralFriendStatus = "registered" | "paid" | "rewarded" | "revoked";

export interface ReferralFriendView {
  nickname: string;
  joinedAt: string;
  status: ReferralFriendStatus;
  rewardDueAt: string | null;
}

export interface ReferralOverview {
  link: string;
  code: string;
  bonusBalance: number;
  /** Friends who paid (bonus given or on its way); the ladder counts these. */
  payingFriends: number;
  friends: ReferralFriendView[];
  ladder: Array<{ step: number; plan: ReferralLadderPlan; label: string; reached: boolean }>;
}

/** "Ещё 2 оплативших друга — и месяц ENTERPRISE твой." or null when the ladder is done. */
export function nextLadderHint(payingFriends: number): string | null {
  const next = REFERRAL_LADDER.find((rung) => payingFriends < rung.step);
  if (!next) return null;
  const left = next.step - payingFriends;
  const word = left === 1 ? "оплативший друг" : left < 5 ? "оплативших друга" : "оплативших друзей";
  return `Ещё ${left} ${word} — и ${next.label} твой.`;
}
