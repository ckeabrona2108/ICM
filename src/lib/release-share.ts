/**
 * The artist's share of a release's royalties, as the cabinet shows it: "Ваша доля 90 / 95 / 100%".
 *
 * Client-safe (no server imports). Only the three public tariff shares are ever shown. A release
 * with a contract, individual or label rate gets no share at all, and so does any rate that does
 * not come out as exactly 90, 95 or 100% — the cabinet never names another percentage.
 */

import type { CommissionBasis, CommissionTariffPlan } from "@/lib/commission-basis";

export type ReleaseSharePercent = 90 | 95 | 100;

export interface ReleaseShare {
  percent: ReleaseSharePercent;
  /** Tooltip heading, e.g. "Подписка PRO". */
  title: string;
  /** Tooltip text: why this share. */
  hint: string;
  /** A softer line about a higher tariff, only for 90 and 95%. */
  upsell: string | null;
}

export const RELEASE_SHARE_PERCENTS: readonly ReleaseSharePercent[] = [90, 95, 100];

/** 90 / 95 / 100 for a commission rate of 10 / 5 / 0%, otherwise null. */
export function sharePercentFromRate(rate: number | null | undefined): ReleaseSharePercent | null {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
  const percent = Math.round((1 - rate) * 1000) / 10;
  return RELEASE_SHARE_PERCENTS.find((value) => value === percent) ?? null;
}

const TARIFF_TITLES: Record<CommissionTariffPlan, string> = {
  STANDARD: "Подписка STANDARD",
  PRO: "Подписка PRO",
  ENTERPRISE: "Подписка ENTERPRISE"
};

function upsellFor(percent: ReleaseSharePercent): string | null {
  if (percent === 90) return "На PRO новые релизы приносят 95%, на ENTERPRISE — 100%.";
  if (percent === 95) return "На ENTERPRISE новые релизы приносят 100%.";
  return null;
}

/** What the artist sees for a release whose commission was resolved as `rate` for `basis`. */
export function describeReleaseShare(basis: CommissionBasis | null | undefined, rate: number): ReleaseShare | null {
  if (!basis || basis.kind === "contract" || basis.kind === "user" || basis.kind === "label") return null;
  const percent = sharePercentFromRate(rate);
  if (!percent) return null;

  if (basis.kind === "tariff") {
    return {
      percent,
      title: TARIFF_TITLES[basis.plan],
      hint: `Релиз отправлен на подписке ${basis.plan} — вам идёт ${percent}% дохода с площадок.`,
      upsell: upsellFor(percent)
    };
  }

  const title =
    basis.payment === "standalone_payment"
      ? "Оплата за релиз"
      : basis.payment === "free_first_release"
        ? "Бесплатный релиз"
        : basis.payment === "partner_code"
          ? "Партнёрский код"
          : basis.payment === "referral_bonus"
            ? "Бонус за друзей"
          : "Ваш релиз";
  return {
    percent,
    title,
    hint: `Вам идёт ${percent}% дохода с площадок по этому релизу.`,
    upsell: upsellFor(percent)
  };
}

/**
 * Share of one report line from its own numbers: what reached the artist (`amount`) against what
 * the platforms paid (`authorAmount + relatedAmount`). Null when the line has no source amounts
 * or the result is not exactly one of the public shares.
 */
export function reportLineSharePercent(line: {
  amount: number | null | undefined;
  authorAmount?: number | null;
  relatedAmount?: number | null;
}): ReleaseSharePercent | null {
  const net = typeof line.amount === "number" && Number.isFinite(line.amount) ? line.amount : null;
  const gross = (line.authorAmount ?? 0) + (line.relatedAmount ?? 0);
  if (net === null || net <= 0 || !Number.isFinite(gross) || gross <= 0) return null;
  const ratio = net / gross;
  // Line amounts are rounded to kopecks, so allow a little drift around 0.90 / 0.95 / 1.00.
  const tolerance = Math.max(0.005, 0.02 / gross);
  return RELEASE_SHARE_PERCENTS.find((percent) => Math.abs(ratio - percent / 100) <= tolerance) ?? null;
}

/**
 * Shares for a whole report, or null when the report must not show the column: reports loaded
 * before the tariff shares started, and any report where even one line has no exact share.
 */
export const REPORT_SHARES_SINCE = new Date("2026-11-20T00:00:00.000Z");

export function reportLineShares<T extends { amount: number; authorAmount?: number | null; relatedAmount?: number | null }>(
  report: { createdAt: Date | string | null | undefined; items: T[] }
): Array<ReleaseSharePercent> | null {
  const createdAt = report.createdAt ? new Date(report.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || createdAt < REPORT_SHARES_SINCE) return null;
  if (report.items.length === 0) return null;
  const shares = report.items.map(reportLineSharePercent);
  return shares.every((share): share is ReleaseSharePercent => share !== null) ? shares : null;
}

/** The report's lines with `sharePercent` set, or unchanged when the report shows no shares. */
export function withReportLineShares<T extends { amount: number; authorAmount?: number | null; relatedAmount?: number | null }>(
  report: { createdAt: Date | string | null | undefined; items: T[] }
): Array<T & { sharePercent?: ReleaseSharePercent }> {
  const shares = reportLineShares(report);
  if (!shares) return report.items;
  return report.items.map((item, index) => ({ ...item, sharePercent: shares[index] }));
}
