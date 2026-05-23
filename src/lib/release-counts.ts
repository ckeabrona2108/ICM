// @ts-nocheck
export interface ReleaseSidebarCounts {
  all: number;
  draft: number;
  moderation: number;
  changes_required: number;
}

type LifecycleStatus =
  | "draft"
  | "pending_verification"
  | "moderation"
  | "changes_required"
  | "approved"
  | "archived";

const lifecycleAliases: Record<string, LifecycleStatus> = {
  draft: "draft",
  pending_verification: "pending_verification",
  waiting_verification: "pending_verification",
  moderating: "moderation",
  moderation: "moderation",
  on_moderation: "moderation",
  changes_required: "changes_required",
  requires_changes: "changes_required",
  need_changes: "changes_required",
  revision_required: "changes_required",
  rejected: "changes_required",
  not_paid: "draft",
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
  status: string | null | undefined,
  confirmed?: boolean | null,
  submittedToModeration?: boolean | null
): keyof ReleaseSidebarCounts | null {
  const lifecycle = normalizeLifecycleStatus(status);
  switch (lifecycle) {
    case "approved":
      return "all";
    case "changes_required":
      return "changes_required";
    case "pending_verification":
      return "moderation";
    case "moderation":
      if (submittedToModeration) return "moderation";
      return confirmed === false ? "draft" : "moderation";
    case "draft":
      return "draft";
    case "archived":
    default:
      return null;
  }
}

interface ReleaseGroupedItem {
  status: string;
  confirmed?: boolean;
  submittedToModeration?: boolean;
  _count: {
    _all: number;
  };
}

interface ReleaseCountItem {
  status: string;
  confirmed?: boolean | null;
  roles?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isSubmittedToModeration(roles: unknown): boolean {
  return asRecord(roles)?.submittedToModeration === true;
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

    const section = mapReleaseStatusToSection(
      item.status,
      item.confirmed,
      item.submittedToModeration
    );
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
        findMany(args: {
          where: { userId: string };
          select: { status: true; confirmed: true; roles: true };
        }): Promise<ReleaseCountItem[]>;
      };
    };
  }
): Promise<ReleaseSidebarCounts> {
  const releases = await params.prisma.release.findMany({
    where: { userId: params.userId },
    select: { status: true, confirmed: true, roles: true }
  });

  const counts: ReleaseSidebarCounts = {
    all: 0,
    draft: 0,
    moderation: 0,
    changes_required: 0
  };

  for (const release of releases) {
    const section = mapReleaseStatusToSection(
      release.status,
      release.confirmed,
      isSubmittedToModeration(release.roles)
    );
    if (section) counts[section] += 1;
  }

  return counts;
}
