// @ts-nocheck
import { addMonths } from "date-fns";
import type { SubscriptionPlan } from "@prisma/client";

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
}

export const subscriptionTariffs: SubscriptionTariffConfig[] = [
  {
    id: "standard",
    title: "STANDARD",
    plan: "STANDARD" as SubscriptionPlan,
    monthlyAmountRub: 550,
    yearlyAmountRub: 5490,
    yearlyMonthlyEquivalentRub: 458,
    yearlySavingsRub: 1110,
    yearlySavingsPercent: 17,
    yearlyBadge: "2 месяца бесплатно"
  },
  {
    id: "pro",
    title: "PRO",
    plan: "PRO" as SubscriptionPlan,
    monthlyAmountRub: 990,
    yearlyAmountRub: 9490,
    yearlyMonthlyEquivalentRub: 790,
    yearlySavingsRub: 2390,
    yearlySavingsPercent: 20,
    yearlyBadge: "Экономия 20%"
  },
  {
    id: "enterprise",
    title: "ENTERPRISE",
    plan: "ENTERPRISE" as SubscriptionPlan,
    monthlyAmountRub: 1990,
    yearlyAmountRub: 18990,
    yearlyMonthlyEquivalentRub: 1582,
    yearlySavingsRub: 4890,
    yearlySavingsPercent: 20,
    yearlyBadge: "Экономия 20%"
  }
];

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
