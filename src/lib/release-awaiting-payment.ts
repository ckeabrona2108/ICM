import { getReleaseLifecycleStatus } from "@/lib/release-counts";
import { readPendingExtrasSupplement } from "@/lib/release-extras-supplement";
import { getReleaseResubmission } from "@/lib/release-resubmission";

/**
 * A release the artist sent but has not paid for yet (the release itself, or extras added to a
 * paid one). It waits for payment, not for a moderator: it stays out of the moderation queue and
 * goes there by itself once the payment is confirmed (or an admin marks it paid).
 * A copy of an already paid release without a pending supplement counts as paid.
 */
export function isReleaseAwaitingPayment(release: {
  status: string;
  confirmed: boolean | null;
  roles: unknown;
}): boolean {
  if (release.confirmed) return false;
  if (getReleaseLifecycleStatus(release.status, release.roles) !== "moderation") return false;
  const paidEarlier =
    Boolean(getReleaseResubmission(release.roles)?.sourceReleaseId) && !readPendingExtrasSupplement(release.roles);
  return !paidEarlier;
}
