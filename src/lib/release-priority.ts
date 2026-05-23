function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

export function canUsePriorityRelease(params: {
  plan: string | null | undefined;
  isActive: boolean;
}): boolean {
  if (!params.isActive) return false;
  const plan = String(params.plan ?? "").trim().toUpperCase();
  return plan === "PRO" || plan === "ENTERPRISE";
}

export function sanitizePriorityReleaseFlag(params: {
  requested: unknown;
  plan: string | null | undefined;
  isActive: boolean;
}): boolean {
  return Boolean(params.requested) && canUsePriorityRelease(params);
}

export function getReleasePriorityFromRoles(roles: unknown, fallback = false): boolean {
  const root = asRecord(roles);
  if (!root) return fallback;

  const submission = asRecord(root.submissionData);
  return (
    asBoolean(submission?.priorityRelease) ??
    asBoolean(root.priorityRelease) ??
    asBoolean(root.isPriorityRelease) ??
    fallback
  );
}
