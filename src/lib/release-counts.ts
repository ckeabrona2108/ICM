import { ReleaseStatus } from "@prisma/client";

export interface ReleaseSidebarCounts {
  all: number;
  draft: number;
  moderation: number;
  changes_required: number;
}

type LifecycleStatus = "draft" | "moderation" | "changes_required" | "approved" | "archived";

const lifecycleAliases: Record<string, LifecycleStatus> = {
  draft: "draft",
  moderation: "moderation",
  on_moderation: "moderation",
  changes_required: "changes_required",
  requires_changes: "changes_required",
  need_changes: "changes_required",
  revision_required: "changes_required",
  rejected: "changes_required",
  approved: "approved",
  distributed: "approved",
  archived: "archived"
};

export function normalizeLifecycleStatus(status: string | null | undefined): LifecycleStatus | null {
  if (!status) return null;
  const normalized = status.trim().toLowerCase();
  return lifecycleAliases[normalized] ?? null;
}

export function mapReleaseStatusToSection(
  status: ReleaseStatus
): keyof ReleaseSidebarCounts | null {
  switch (status) {
    case ReleaseStatus.DRAFT:
      return "draft";
    case ReleaseStatus.MODERATION:
      return "moderation";
    case ReleaseStatus.CHANGES_REQUIRED:
    case ReleaseStatus.REJECTED:
      return "changes_required";
    case ReleaseStatus.APPROVED:
    case ReleaseStatus.DISTRIBUTED:
      return "all";
    case ReleaseStatus.ARCHIVED:
    default:
      return null;
  }
}

interface ReleaseGroupedItem {
  status: ReleaseStatus;
  _count: {
    _all: number;
  };
}

export function buildReleaseSidebarCounts(grouped: ReleaseGroupedItem[]): ReleaseSidebarCounts {
  const counts: ReleaseSidebarCounts = {
    all: 0,
    draft: 0,
    moderation: 0,
    changes_required: 0
  };

  for (const item of grouped) {
    const amount = Math.max(0, Number(item._count._all) || 0);
    if (amount === 0) continue;

    const section = mapReleaseStatusToSection(item.status);
    if (section) {
      counts[section] += amount;
    }
  }

  return counts;
}

export async function getReleaseSidebarCountsForUser(
  params: {
    userId: string;
    prisma: {
      release: {
        groupBy(args: {
          by: ["status"];
          where: { userId: string };
          _count: { _all: true };
        }): Promise<ReleaseGroupedItem[]>;
      };
    };
  }
): Promise<ReleaseSidebarCounts> {
  const grouped = await params.prisma.release.groupBy({
    by: ["status"],
    where: { userId: params.userId },
    _count: { _all: true }
  });

  return buildReleaseSidebarCounts(grouped);
}
