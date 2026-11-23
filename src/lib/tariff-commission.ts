/**
 * ICECREAMMUSIC commission withheld from royalties during a financial import, and why.
 *
 * The rate belongs to the release: a release sent under a subscription keeps that tariff's rate
 * for good — STANDARD 10%, PRO 5%, ENTERPRISE 0% (the artist gets 100%). A pay-as-you-go release,
 * a partner code, the free single and old releases without a payment record use the global rate.
 * A contract, an artist's individual rate or a label rate still win over the tariff.
 *
 * Admin-only like every commission rate: the artist cabinet never shows the rate or the basis.
 */

import { describeCommissionBasis, type CommissionBasis, type CommissionTariffPlan } from "@/lib/commission-basis";
import { getReleasePaymentUsageFromRoles } from "@/lib/release-quota";

export type { CommissionBasis, CommissionTariffPlan } from "@/lib/commission-basis";
export { COMMISSION_BASIS_KEY, describeCommissionBasis, readCommissionBasis } from "@/lib/commission-basis";

export const TARIFF_COMMISSION_RATES: Record<CommissionTariffPlan, number> = {
  STANDARD: 0.1,
  PRO: 0.05,
  ENTERPRISE: 0
};

export interface ResolvedCommission {
  rate: number;
  basis: CommissionBasis;
}

/** Tariff a release was sent under, or null when it was not sent by subscription. */
export function readReleaseSubscriptionPlan(roles: unknown): CommissionTariffPlan | null {
  const usage = getReleasePaymentUsageFromRoles(roles);
  if (usage?.type !== "subscription") return null;
  const plan = String(usage.plan ?? "STANDARD").toUpperCase();
  if (plan === "PRO") return "PRO";
  if (plan === "ENTERPRISE" || plan === "LABEL") return "ENTERPRISE";
  return "STANDARD";
}

/** Commission fixed by the release's own subscription, or null when the global rate applies. */
export function resolveReleaseTariffCommission(roles: unknown): ResolvedCommission | null {
  const plan = readReleaseSubscriptionPlan(roles);
  if (!plan) return null;
  return { rate: TARIFF_COMMISSION_RATES[plan], basis: { kind: "tariff", plan } };
}

/** How the release was paid, for a release that falls back to the global rate. */
export function readGlobalCommissionPayment(
  roles: unknown,
  hasRelease: boolean
): Extract<CommissionBasis, { kind: "global" }>["payment"] {
  if (!hasRelease) return "no_release";
  const usage = getReleasePaymentUsageFromRoles(roles);
  if (usage?.type === "standalone_payment" || usage?.type === "partner_code" || usage?.type === "free_first_release" || usage?.type === "referral_bonus") {
    return usage.type;
  }
  return "unknown";
}


/**
 * Admin label for how a release's royalties are commissioned when no contract, individual or
 * label rate applies, e.g. "Подписка PRO · 5%" or "Общая ставка (разовая оплата)".
 */
export function describeReleaseCommissionBasis(roles: unknown): string {
  const tariff = resolveReleaseTariffCommission(roles);
  if (tariff) return describeCommissionBasis(tariff.basis, tariff.rate);
  return describeCommissionBasis({ kind: "global", payment: readGlobalCommissionPayment(roles, true) });
}
