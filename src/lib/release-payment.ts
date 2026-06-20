import type { LimitDecision, EffectivePlan } from "@/lib/subscription-limits";

export type ReleasePaymentKind = "paid" | "subscription" | "unpaid" | "partner_code";

export interface ReleasePaymentSnapshot {
  version: 1;
  kind: "subscription_included";
  plan: EffectivePlan;
  releasesUsedAfterSubmit: number;
  releasesLimit: number | null;
}

export interface ReleasePaymentDisplay {
  kind: ReleasePaymentKind;
  label: string;
  plan: EffectivePlan | null;
  usageLabel: string | null;
}

interface SnapshotLike {
  version?: unknown;
  kind?: unknown;
  plan?: unknown;
  releasesUsedAfterSubmit?: unknown;
  releasesLimit?: unknown;
}

export function parseReleasePaymentSnapshot(input: unknown): ReleasePaymentSnapshot | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as SnapshotLike;
  if (value.kind !== "subscription_included") return null;
  if (value.version !== 1) return null;
  if (value.plan !== "STANDARD" && value.plan !== "PRO" && value.plan !== "ENTERPRISE") {
    return null;
  }

  const releasesUsedAfterSubmit =
    typeof value.releasesUsedAfterSubmit === "number"
      ? value.releasesUsedAfterSubmit
      : Number.NaN;
  if (!Number.isFinite(releasesUsedAfterSubmit) || releasesUsedAfterSubmit <= 0) return null;

  const releasesLimit =
    value.releasesLimit == null
      ? null
      : typeof value.releasesLimit === "number" && Number.isFinite(value.releasesLimit)
        ? value.releasesLimit
        : Number.NaN;
  if (Number.isNaN(releasesLimit)) return null;

  return {
    version: 1,
    kind: "subscription_included",
    plan: value.plan,
    releasesUsedAfterSubmit: Math.floor(releasesUsedAfterSubmit),
    releasesLimit: releasesLimit == null ? null : Math.floor(releasesLimit)
  };
}

export function buildReleasePaymentSnapshotFromLimitDecision(
  decision: LimitDecision | null
): ReleasePaymentSnapshot | null {
  if (!decision) return null;
  if (!decision.allowed) return null;
  if (decision.limits.releasesLimit === 0) return null;

  return {
    version: 1,
    kind: "subscription_included",
    plan: decision.plan,
    releasesUsedAfterSubmit: decision.usage.releasesUsed + 1,
    releasesLimit: decision.limits.releasesLimit
  };
}

export function formatReleasePaymentUsage(
  usedAfterSubmit: number,
  limit: number | null
): string {
  const normalizedUsed = Math.max(1, Math.floor(usedAfterSubmit));
  if (limit == null) return `${normalizedUsed}/∞`;
  return `${normalizedUsed}/${Math.max(0, Math.floor(limit))}`;
}

export function buildReleasePaymentDisplay(params: {
  paid: boolean;
  snapshot: ReleasePaymentSnapshot | null;
}): ReleasePaymentDisplay {
  if (params.snapshot) {
    const usageLabel = formatReleasePaymentUsage(
      params.snapshot.releasesUsedAfterSubmit,
      params.snapshot.releasesLimit
    );
    return {
      kind: "subscription",
      label: `${params.snapshot.plan} ${usageLabel}`,
      plan: params.snapshot.plan,
      usageLabel
    };
  }

  if (params.paid) {
    return {
      kind: "paid",
      label: "Оплачен",
      plan: null,
      usageLabel: null
    };
  }

  return {
    kind: "unpaid",
    label: "Не оплачен",
    plan: null,
    usageLabel: null
  };
}

export function buildPartnerCodePaymentDisplay(params: {
  code?: string | null;
}): ReleasePaymentDisplay {
  const normalized = typeof params.code === "string" ? params.code.trim() : "";
  return {
    kind: "partner_code",
    label: normalized ? `Партнёрский код ${normalized}` : "Оплачено партнёром",
    plan: null,
    usageLabel: null
  };
}
