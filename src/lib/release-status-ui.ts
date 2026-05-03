import type { VariantProps } from "class-variance-authority";

import { type badgeVariants } from "@/components/ui/badge";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export type UiReleaseStatus =
  | "draft"
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
  moderation: { label: "На модерации", variant: "warning" },
  changes_required: { label: "Требуются изменения", variant: "warning" },
  approved: { label: "Принят", variant: "success" },
  distributed: { label: "Опубликован", variant: "success" },
  rejected: { label: "Отклонён", variant: "danger" },
  archived: { label: "Архив", variant: "muted" }
};

const statusAliases: Record<string, UiReleaseStatus> = {
  draft: "draft",
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

export function getPaymentStatusDescriptor(paid: boolean): {
  label: string;
  variant: BadgeVariant;
  className?: string;
} {
  if (paid) {
    return {
      label: "Оплачен",
      variant: "muted"
    };
  }

  return {
    label: "Не оплачен",
    variant: "muted",
    className: "border-rose-400/20 bg-rose-500/10 text-rose-200/85"
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
