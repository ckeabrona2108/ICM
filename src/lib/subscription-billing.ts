// @ts-nocheck
import { SubscriptionPlan } from "@prisma/client";

export interface SubscriptionTariffConfig {
  id: "standard" | "pro" | "enterprise";
  title: string;
  amountRub: number;
  plan: SubscriptionPlan;
}

export const subscriptionTariffs: SubscriptionTariffConfig[] = [
  {
    id: "standard",
    title: "STANDART",
    amountRub: 350,
    plan: SubscriptionPlan.STANDARD
  },
  {
    id: "pro",
    title: "PRO",
    amountRub: 990,
    plan: SubscriptionPlan.PRO
  },
  {
    id: "enterprise",
    title: "ENTERPRISE",
    amountRub: 1990,
    plan: SubscriptionPlan.ENTERPRISE
  }
];

export function getSubscriptionTariffConfig(tariffId: string) {
  return subscriptionTariffs.find((tariff) => tariff.id === tariffId) ?? null;
}

export function mapPlanToTariffId(plan: SubscriptionPlan | undefined): string {
  if (!plan) return "standard";
  if (plan === SubscriptionPlan.STANDARD) return "standard";
  if (plan === SubscriptionPlan.PRO) return "pro";
  if (plan === SubscriptionPlan.ENTERPRISE) return "enterprise";
  if (plan === SubscriptionPlan.LABEL) return "enterprise";
  return "standard";
}

export function mapActivePlanToTariffId(
  plan: SubscriptionPlan | null | undefined
): "standard" | "pro" | "enterprise" | null {
  if (!plan) return null;
  if (plan === SubscriptionPlan.STANDARD) return "standard";
  if (plan === SubscriptionPlan.PRO) return "pro";
  if (plan === SubscriptionPlan.ENTERPRISE || plan === SubscriptionPlan.LABEL) {
    return "enterprise";
  }
  return null;
}
