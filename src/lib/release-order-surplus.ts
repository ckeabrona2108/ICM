import { readExtrasSupplement } from "@/lib/release-extras-supplement";

/**
 * What a succeeded YooKassa payment for a release does.
 * - `covers`: the release waits for payment and this payment confirms it.
 * - `record`: an admin marked the release paid without a payment record; this order is noted on it.
 * - `already_applied`: this very order is the release's recorded payment.
 * - `surplus`: the release was already covered (another payment, a partner code, a subscription
 *   slot, the free single, a bonus): the money came on top and has to be refunded by hand.
 */
export type ReleaseOrderPaymentOutcome =
  | { kind: "no_release" }
  | { kind: "covers" }
  | { kind: "record" }
  | { kind: "already_applied" }
  | { kind: "surplus"; coveredBy: string };

/** Key in `orders.metadata` of a payment that came on top of an already covered release. */
export const ORDER_SURPLUS_KEY = "surplusPayment";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function classifyReleaseOrderPayment(params: {
  release: { confirmed: boolean | null; roles: unknown } | null;
  orderId: string;
  isSupplement: boolean;
}): ReleaseOrderPaymentOutcome {
  const { release, orderId } = params;
  if (!release) return { kind: "no_release" };
  if (!release.confirmed) return { kind: "covers" };

  const roles = asRecord(release.roles);
  const usage = asRecord(roles?.paymentUsage);
  const supplement = readExtrasSupplement(roles);
  if (supplement?.orderId === orderId || asString(usage?.orderId) === orderId) return { kind: "already_applied" };

  if (params.isSupplement) {
    return { kind: "surplus", coveredBy: supplement?.paidAt ? "extras_supplement" : "no_supplement_due" };
  }
  const usageType = asString(usage?.type);
  if (!usageType) return { kind: "record" };
  return { kind: "surplus", coveredBy: usageType };
}

export function isSurplusOrder(metadata: unknown): boolean {
  return Boolean(asRecord(asRecord(metadata)?.[ORDER_SURPLUS_KEY]));
}

const COVERED_BY_LABELS: Record<string, string> = {
  standalone_payment: "другой оплатой картой",
  partner_code: "партнёрским кодом",
  subscription: "слотом подписки",
  free_first_release: "бесплатным первым релизом",
  referral_bonus: "бонусом за друзей",
  extras_supplement: "другой доплатой за дополнения",
  no_supplement_due: "без доплаты (доплата уже не требовалась)"
};

export function describeSurplusCoverage(coveredBy: string): string {
  return COVERED_BY_LABELS[coveredBy] ?? coveredBy;
}
