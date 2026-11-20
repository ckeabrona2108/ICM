import { addMonths } from "date-fns";
import type { SubscriptionPlan } from "@/lib/legacy-business-enums";

export type SubscriptionTariffId = "standard" | "pro" | "enterprise";
export type SubscriptionBillingPeriod = "monthly" | "yearly";

export interface SubscriptionTariffConfig {
  id: SubscriptionTariffId;
  title: string;
  plan: SubscriptionPlan;
  monthlyAmountRub: number;
  yearlyAmountRub: number;
  yearlyMonthlyEquivalentRub: number;
  yearlySavingsRub: number;
  yearlySavingsPercent: number;
  yearlyBadge: string;
  /** Prices of earlier price lists, kept for payments started before a change. */
  previousAmountsRub: { monthly: number[]; yearly: number[] };
}

/** Yearly payment is 40% off twelve monthly payments. */
const YEARLY_DISCOUNT_PERCENT = 40;

function tariff(params: {
  id: SubscriptionTariffId;
  plan: SubscriptionPlan;
  monthlyAmountRub: number;
  previousAmountsRub: { monthly: number[]; yearly: number[] };
}): SubscriptionTariffConfig {
  const fullYearRub = params.monthlyAmountRub * 12;
  const yearlyAmountRub = Math.round((fullYearRub * (100 - YEARLY_DISCOUNT_PERCENT)) / 100);
  return {
    id: params.id,
    title: params.id.toUpperCase(),
    plan: params.plan,
    monthlyAmountRub: params.monthlyAmountRub,
    yearlyAmountRub,
    yearlyMonthlyEquivalentRub: Math.round(yearlyAmountRub / 12),
    yearlySavingsRub: fullYearRub - yearlyAmountRub,
    yearlySavingsPercent: YEARLY_DISCOUNT_PERCENT,
    yearlyBadge: `Экономия ${YEARLY_DISCOUNT_PERCENT}%`,
    previousAmountsRub: params.previousAmountsRub
  };
}

export const subscriptionTariffs: SubscriptionTariffConfig[] = [
  tariff({
    id: "standard",
    plan: "STANDARD" as SubscriptionPlan,
    monthlyAmountRub: 350,
    previousAmountsRub: { monthly: [550], yearly: [5490] }
  }),
  tariff({
    id: "pro",
    plan: "PRO" as SubscriptionPlan,
    monthlyAmountRub: 990,
    previousAmountsRub: { monthly: [], yearly: [9490] }
  }),
  tariff({
    id: "enterprise",
    plan: "ENTERPRISE" as SubscriptionPlan,
    monthlyAmountRub: 1990,
    previousAmountsRub: { monthly: [], yearly: [18990] }
  })
];

/**
 * A payment started at the price shown before a price change is still accepted when the bank
 * confirms it later: the artist paid what the page asked.
 */
export function isAcceptedSubscriptionAmount(
  tariffId: string,
  billingPeriod: SubscriptionBillingPeriod,
  amountRub: number
): boolean {
  const config = getSubscriptionTariffConfig(tariffId, billingPeriod);
  if (!config) return false;
  if (amountRub === config.amountRub) return true;
  return config.previousAmountsRub[billingPeriod].includes(amountRub);
}

export function getSubscriptionTariffConfig(
  tariffId: string,
  billingPeriod: SubscriptionBillingPeriod = "monthly"
) {
  const tariff = subscriptionTariffs.find((item) => item.id === tariffId) ?? null;
  if (!tariff) return null;

  return {
    ...tariff,
    billingPeriod,
    amountRub: billingPeriod === "yearly" ? tariff.yearlyAmountRub : tariff.monthlyAmountRub,
    durationMonths: billingPeriod === "yearly" ? 12 : 1
  };
}

export function normalizeSubscriptionBillingPeriod(
  value: unknown
): SubscriptionBillingPeriod {
  return value === "yearly" ? "yearly" : "monthly";
}

export function getSubscriptionDurationMonths(
  billingPeriod: SubscriptionBillingPeriod
): number {
  return billingPeriod === "yearly" ? 12 : 1;
}

export function calculateSubscriptionEndDate(params: {
  billingPeriod: SubscriptionBillingPeriod;
  now?: Date;
  currentEnd?: Date | null;
}): Date {
  const now = params.now ?? new Date();
  const anchor =
    params.currentEnd && params.currentEnd.getTime() > now.getTime()
      ? params.currentEnd
      : now;
  return addMonths(anchor, getSubscriptionDurationMonths(params.billingPeriod));
}

export function mapPlanToTariffId(plan: SubscriptionPlan | undefined): string {
  if (!plan) return "standard";
  if (plan === "STANDARD") return "standard";
  if (plan === "PRO") return "pro";
  if (plan === "ENTERPRISE") return "enterprise";
  if (plan === "LABEL") return "enterprise";
  return "standard";
}

export function mapActivePlanToTariffId(
  plan: SubscriptionPlan | null | undefined
): "standard" | "pro" | "enterprise" | null {
  if (!plan) return null;
  if (plan === "STANDARD") return "standard";
  if (plan === "PRO") return "pro";
  if (plan === "ENTERPRISE" || plan === "LABEL") {
    return "enterprise";
  }
  return null;
}
