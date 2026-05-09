import type { VariantProps } from "class-variance-authority";

import { type badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export type UiReleaseStatus =
  | "draft"
  | "pending_verification"
  | "moderation"
  | "changes_required"
  | "approved"
  | "distributed"
  | "rejected"
  | "archived";

interface ReleaseStatusDescriptor {
  label: string;
  variant: BadgeVariant;
}

const releaseStatusDescriptorMap: Record<UiReleaseStatus, ReleaseStatusDescriptor> = {
  draft: { label: "Черновик", variant: "warning" },
  pending_verification: { label: "Ожидает верификацию", variant: "warning" },
  moderation: { label: "На модерации", variant: "warning" },
  changes_required: { label: "Требуются изменения", variant: "warning" },
  approved: { label: "Принят", variant: "success" },
  distributed: { label: "Опубликован", variant: "success" },
  rejected: { label: "Отклонён", variant: "danger" },
  archived: { label: "Архив", variant: "muted" }
};

const statusAliases: Record<string, UiReleaseStatus> = {
  draft: "draft",
  pending_verification: "pending_verification",
  waiting_verification: "pending_verification",
  moderation: "moderation",
  on_moderation: "moderation",
  changes_required: "changes_required",
  requires_changes: "changes_required",
  need_changes: "changes_required",
  revision_required: "changes_required",
  approved: "approved",
  distributed: "distributed",
  rejected: "rejected",
  archived: "archived"
};

function normalizeStatusKey(status: string): UiReleaseStatus | null {
  const normalized = status.trim().toLowerCase();
  return statusAliases[normalized] ?? null;
}

export function getReleaseStatusDescriptor(status: string): ReleaseStatusDescriptor | null {
  const key = normalizeStatusKey(status);
  if (!key) return null;
  return releaseStatusDescriptorMap[key];
}

export function getPaymentStatusDescriptor(params: {
  paid: boolean;
  label?: string;
  kind?: "paid" | "subscription" | "unpaid";
}): {
  label: string;
  variant: BadgeVariant;
  className?: string;
} {
  if (params.label?.trim()) {
    if (params.kind === "subscription") {
      return {
        label: params.label.trim(),
        variant: "warning",
        className: "border-cyan-400/25 bg-cyan-500/10 text-cyan-200"
      };
    }

    if (params.kind === "paid") {
      return {
        label: params.label.trim(),
        variant: "success"
      };
    }

    if (params.kind === "unpaid") {
      return {
        label: params.label.trim(),
        variant: "danger"
      };
    }
  }

  if (params.paid) {
    return {
      label: "Оплачен",
      variant: "success"
    };
  }

  return {
    label: "Не оплачен",
    variant: "danger"
  };
}

export function getPriorityBadgeDescriptor(priority: boolean): {
  label: string;
} | null {
  if (!priority) return null;
  return {
    label: "Приоритетный"
  };
}
