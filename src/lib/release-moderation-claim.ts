import { getReleaseLifecycleStatus } from "@/lib/release-counts";
import { RELEASE_MODERATION_CLAIMED_MESSAGE } from "@/lib/release-policy";

export { RELEASE_MODERATION_CLAIMED_MESSAGE };

/**
 * "Взять в работу": a moderator marks a release on moderation as the one they are checking and
 * passing to the platforms. Until their decision the artist cannot change it (edit, cancel the
 * moderation, send a new copy). Kept in `roles.moderationClaim`, like `roles.timeline`.
 */
export const RELEASE_MODERATION_CLAIM_KEY = "moderationClaim";

export interface ReleaseModerationClaim {
  adminId: string;
  adminName: string | null;
  claimedAt: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asTime(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** The stored mark, whatever the release's state now. */
export function readReleaseModerationClaim(roles: unknown): ReleaseModerationClaim | null {
  const claim = asRecord(asRecord(roles)?.[RELEASE_MODERATION_CLAIM_KEY]);
  const adminId = typeof claim?.adminId === "string" ? claim.adminId.trim() : "";
  const claimedAt = typeof claim?.claimedAt === "string" ? claim.claimedAt : "";
  if (!adminId || asTime(claimedAt) === null) return null;
  const adminName = typeof claim?.adminName === "string" && claim.adminName.trim() ? claim.adminName.trim() : null;
  return { adminId, adminName, claimedAt };
}

/**
 * The mark that locks the release now: only while it is on moderation, and only for the copy the
 * artist sent last (a mark left from an earlier round never locks a resubmitted version).
 */
export function getActiveReleaseModerationClaim(
  status: string | null | undefined,
  roles: unknown
): ReleaseModerationClaim | null {
  if (getReleaseLifecycleStatus(status, roles) !== "moderation") return null;
  const claim = readReleaseModerationClaim(roles);
  if (!claim) return null;
  const submittedAt = asTime(asRecord(asRecord(roles)?.timeline)?.submittedAt);
  const claimedAt = asTime(claim.claimedAt) as number;
  if (submittedAt !== null && claimedAt < submittedAt) return null;
  return claim;
}

export function isReleaseClaimedByModerator(status: string | null | undefined, roles: unknown): boolean {
  return getActiveReleaseModerationClaim(status, roles) !== null;
}

export function withReleaseModerationClaim(
  roles: unknown,
  params: { adminId: string; adminName?: string | null; at?: Date }
): Record<string, unknown> {
  const root: Record<string, unknown> = { ...(asRecord(roles) ?? {}) };
  root[RELEASE_MODERATION_CLAIM_KEY] = {
    adminId: params.adminId,
    adminName: params.adminName?.trim() || null,
    claimedAt: (params.at ?? new Date()).toISOString()
  };
  return root;
}

export function withoutReleaseModerationClaim(roles: unknown): Record<string, unknown> {
  const root: Record<string, unknown> = { ...(asRecord(roles) ?? {}) };
  delete root[RELEASE_MODERATION_CLAIM_KEY];
  return root;
}
