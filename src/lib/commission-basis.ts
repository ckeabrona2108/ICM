/** Why a royalty row got its commission rate. Client-safe: no server imports. */

export type CommissionTariffPlan = "STANDARD" | "PRO" | "ENTERPRISE";

export type CommissionBasis =
  | { kind: "contract" }
  | { kind: "user" }
  | { kind: "label" }
  | { kind: "tariff"; plan: CommissionTariffPlan }
  | { kind: "global"; payment: "standalone_payment" | "partner_code" | "free_first_release" | "referral_bonus" | "unknown" | "no_release" };

const GLOBAL_PAYMENT_LABELS: Record<Extract<CommissionBasis, { kind: "global" }>["payment"], string> = {
  standalone_payment: "разовая оплата",
  partner_code: "партнёрский код",
  free_first_release: "бесплатный сингл",
  referral_bonus: "бонус за друзей",
  unknown: "без отметки об оплате",
  no_release: "без релиза"
};

/** Admin label for a commission basis, e.g. "Подписка PRO · 5%". */
export function describeCommissionBasis(basis: CommissionBasis | null | undefined, rate?: number | null): string {
  const percent = typeof rate === "number" && Number.isFinite(rate) ? ` · ${Number((rate * 100).toFixed(2))}%` : "";
  if (!basis) return `—${percent}`;
  switch (basis.kind) {
    case "contract":
      return `Договор${percent}`;
    case "user":
      return `Индивидуальная ставка${percent}`;
    case "label":
      return `Ставка лейбла${percent}`;
    case "tariff":
      return `Подписка ${basis.plan}${percent}`;
    case "global":
      return `Общая ставка (${GLOBAL_PAYMENT_LABELS[basis.payment]})${percent}`;
  }
}

export function readCommissionBasis(value: unknown): CommissionBasis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "contract" || record.kind === "user" || record.kind === "label") return { kind: record.kind };
  if (record.kind === "tariff" && (record.plan === "STANDARD" || record.plan === "PRO" || record.plan === "ENTERPRISE")) {
    return { kind: "tariff", plan: record.plan };
  }
  if (record.kind === "global") {
    const payment = record.payment;
    return {
      kind: "global",
      payment:
        payment === "standalone_payment" || payment === "partner_code" || payment === "free_first_release" || payment === "referral_bonus" || payment === "no_release"
          ? payment
          : "unknown"
    };
  }
  return null;
}

/** Key in a financial import row's normalized_data that keeps the commission basis. */
export const COMMISSION_BASIS_KEY = "__commission";
