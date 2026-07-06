import { isPrismaConnectionError } from "@/lib/prisma-errors";
import type { ReleaseLifecycleStatus } from "@/lib/release-policy";

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

const lifecycleRoleKeys = [
  "lifecycleState",
  "lifecycleStatus",
  "releaseLifecycleState",
  "releaseLifecycleStatus"
] as const;

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

export function getExplicitReleaseLifecycleStatus(roles: unknown): LifecycleStatus | null {
  const root = asRecord(roles);
  if (!root) return null;

  for (const key of lifecycleRoleKeys) {
    const normalized = normalizeLifecycleStatus(normalizeOptionalString(root[key]));
    if (normalized) return normalized;
  }

  const lifecycle = asRecord(root.lifecycle);
  const nested = normalizeLifecycleStatus(normalizeOptionalString(lifecycle?.state));
  if (nested) return nested;

  return null;
}

export function getReleaseLifecycleStatus(
  status: string | null | undefined,
  roles?: unknown
): LifecycleStatus | null {
  return getExplicitReleaseLifecycleStatus(roles) ?? normalizeLifecycleStatus(status);
}

export function withReleaseLifecycleState(
  roles: unknown,
  lifecycleState: ReleaseLifecycleStatus | LifecycleStatus
): Record<string, unknown> {
  const root = asRecord(roles) ? structuredClone(roles as Record<string, unknown>) : {};
  const submittedToModeration =
    lifecycleState === "moderation" || lifecycleState === "pending_verification";

  root.lifecycleState = lifecycleState;
  root.submittedToModeration = submittedToModeration;

  return root;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function collectRoleRecords(roles: unknown): Array<Record<string, unknown>> {
  const root = asRecord(roles);
  if (!root) return [];
  const records: Array<Record<string, unknown>> = [root];
  const submission = asRecord(root.submissionData);
  if (submission) records.push(submission);
  return records;
}

function readLegacyReleaseSignals(roles: unknown): {
  statusValues: string[];
  hasApprovedAt: boolean;
  hasDistributedAt: boolean;
  isPublished: boolean;
  needsChanges: boolean | null;
  upcValues: string[];
} {
  const records = collectRoleRecords(roles);
  const statusValues: string[] = [];
  const upcValues: string[] = [];
  let hasApprovedAt = false;
  let hasDistributedAt = false;
  let isPublished = false;
  let needsChanges: boolean | null = null;

  for (const record of records) {
    for (const key of ["status", "moderationStatus", "releaseStatus", "distributionStatus"]) {
      const value = normalizeOptionalString(record[key]);
      if (value) statusValues.push(value);
    }
    for (const key of ["upc", "releaseUpc", "release_upc"]) {
      const value = normalizeOptionalString(record[key]);
      if (value) upcValues.push(value);
    }
    if (normalizeOptionalString(record.approvedAt)) hasApprovedAt = true;
    if (normalizeOptionalString(record.distributedAt)) hasDistributedAt = true;
    if (normalizeOptionalBoolean(record.isPublished) === true) isPublished = true;
    if (normalizeOptionalBoolean(record.published) === true) isPublished = true;
    if (normalizeOptionalBoolean(record.distributed) === true) isPublished = true;

    const localNeedsChanges = normalizeOptionalBoolean(record.needsChanges);
    if (localNeedsChanges !== null) {
      needsChanges = localNeedsChanges;
    }
  }

  return {
    statusValues,
    hasApprovedAt,
    hasDistributedAt,
    isPublished,
    needsChanges,
    upcValues
  };
}

export function shouldTreatReleaseAsApproved(params: {
  status: string | null | undefined;
  confirmed?: boolean | null;
  upc?: string | null;
  roles?: unknown;
}): boolean {
  const explicitLifecycle = getExplicitReleaseLifecycleStatus(params.roles);
  if (explicitLifecycle && explicitLifecycle !== "approved" && explicitLifecycle !== "archived") {
    return false;
  }

  const lifecycle = getReleaseLifecycleStatus(params.status, params.roles);
  if (lifecycle === "approved") return true;

  const signals = readLegacyReleaseSignals(params.roles);
  const explicitUpc = normalizeOptionalString(params.upc);
  const upc = explicitUpc ?? signals.upcValues[0] ?? null;
  // Production rule: a release with assigned UPC is considered accepted in cabinet views.
  if (upc) return true;

  const hasApprovedStatusSignal = signals.statusValues.some((value) => {
    const normalized = normalizeLifecycleStatus(value);
    return normalized === "approved";
  });
  const hasPublishedEvidence =
    hasApprovedStatusSignal ||
    signals.hasApprovedAt ||
    signals.hasDistributedAt ||
    signals.isPublished;

  if (hasPublishedEvidence && (Boolean(upc) || params.confirmed === true)) {
    return true;
  }

  if (
    lifecycle === "changes_required" &&
    Boolean(upc) &&
    params.confirmed === true &&
    signals.needsChanges !== true
  ) {
    return true;
  }

  return false;
}

export function mapReleaseStatusToSection(
  status: string | null | undefined,
  confirmed?: boolean | null,
  submittedToModeration?: boolean | null,
  options?: {
    upc?: string | null;
    roles?: unknown;
  }
): keyof ReleaseSidebarCounts | null {
  if (
    shouldTreatReleaseAsApproved({
      status,
      confirmed,
      upc: options?.upc,
      roles: options?.roles
    })
  ) {
    return "all";
  }

  const explicitLifecycle = getExplicitReleaseLifecycleStatus(options?.roles);
  const lifecycle = getReleaseLifecycleStatus(status, options?.roles);
  switch (lifecycle) {
    case "approved":
      return "all";
    case "changes_required":
      return "changes_required";
    case "pending_verification":
      return "moderation";
    case "moderation":
      if (explicitLifecycle === "moderation" || explicitLifecycle === "pending_verification") {
        return "moderation";
      }
      if (submittedToModeration) return "moderation";
      return "moderation";
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
  upc?: string | null;
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
          select: { status: true; confirmed: true; upc: true; roles: true };
        }): Promise<ReleaseCountItem[]>;
      };
    };
  }
): Promise<ReleaseSidebarCounts> {
  const counts: ReleaseSidebarCounts = {
    all: 0,
    draft: 0,
    moderation: 0,
    changes_required: 0
  };

  let releases: ReleaseCountItem[];
  try {
    releases = await params.prisma.release.findMany({
      where: { userId: params.userId },
      select: { status: true, confirmed: true, upc: true, roles: true }
    });
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      return counts;
    }
    throw error;
  }

  for (const release of releases) {
    const section = mapReleaseStatusToSection(
      release.status,
      release.confirmed,
      isSubmittedToModeration(release.roles),
      {
        upc: release.upc,
        roles: release.roles
      }
    );
    if (section) counts[section] += 1;
  }

  return counts;
}
