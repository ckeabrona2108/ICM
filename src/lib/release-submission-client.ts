import type { ReleaseSubmitRequest } from "@/lib/api/contracts";
import type { ReleaseDraftSnapshot } from "@/lib/release-submit-flow";

export interface PendingReleaseSubmission {
  key: string;
  snapshot: string;
  draft: ReleaseDraftSnapshot;
  payload: ReleaseSubmitRequest;
}

type SubmissionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const slot = (releaseId: string) => `icm:release-submission:${releaseId}`;

export function readPendingSubmission(storage: SubmissionStorage, releaseId: string | null | undefined, snapshot: string): PendingReleaseSubmission | null {
  if (!releaseId) return null;
  const raw = storage.getItem(slot(releaseId));
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as PendingReleaseSubmission;
    return pending.snapshot === snapshot && pending.draft?.releaseId === releaseId && pending.payload?.releaseId === releaseId && typeof pending.key === "string" ? pending : null;
  } catch { return null; }
}

export function savePendingSubmission(storage: SubmissionStorage, pending: PendingReleaseSubmission): void {
  // Fail before sending if durable retry storage is unavailable.
  storage.setItem(slot(pending.draft.releaseId), JSON.stringify(pending));
}

export function completePendingSubmission(storage: SubmissionStorage, releaseId: string): void {
  storage.removeItem(slot(releaseId));
}
