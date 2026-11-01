import type { ReleaseSubmitRequest } from "@/lib/api/contracts";
import type { ReleaseDraftSnapshot } from "@/lib/release-submit-flow";

/** Only fixed-size fields are persisted: the release data (cover/audio data URLs,
 * lyrics, karaoke TTML) can exceed the localStorage quota, so it is kept as hashes. */
export interface PendingReleaseSubmission {
  key: string;
  snapshotHash: string;
  payloadHash: string;
  draft: ReleaseDraftSnapshot;
}

type SubmissionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
const PREFIX = "icm:release-submission:";
const slot = (releaseId: string) => `${PREFIX}${releaseId}`;

/** Non-cryptographic 53-bit hash (cyrb53); only used to compare local snapshots. */
export function hashSubmissionValue(value: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < value.length; i += 1) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${value.length.toString(36)}-${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

function safeRemove(storage: SubmissionStorage, key: string): void {
  try { storage.removeItem(key); } catch { /* storage unavailable */ }
}

export function readPendingSubmission(storage: SubmissionStorage, releaseId: string | null | undefined, snapshot: string): PendingReleaseSubmission | null {
  if (!releaseId) return null;
  let raw: string | null;
  try { raw = storage.getItem(slot(releaseId)); } catch { return null; }
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as Partial<PendingReleaseSubmission>;
    const valid = typeof pending.key === "string" && typeof pending.snapshotHash === "string" &&
      typeof pending.payloadHash === "string" && pending.draft?.releaseId === releaseId;
    // Drop malformed and legacy (full-payload) records so they stop occupying the quota.
    if (!valid) { safeRemove(storage, slot(releaseId)); return null; }
    return pending.snapshotHash === hashSubmissionValue(snapshot) ? pending as PendingReleaseSubmission : null;
  } catch {
    safeRemove(storage, slot(releaseId));
    return null;
  }
}

/** The server replays a key only for an identical payload, so a key is reused only
 * when the rebuilt payload matches the one it was first sent with. */
export function resolveSubmissionKey(pending: PendingReleaseSubmission | null, payload: ReleaseSubmitRequest, createKey: () => string): string {
  return pending && pending.payloadHash === hashSubmissionValue(JSON.stringify(payload)) ? pending.key : createKey();
}

/** Best effort: a full or unavailable storage must never block the submission itself.
 * Returns whether the record was stored. */
export function savePendingSubmission(storage: SubmissionStorage, pending: { key: string; snapshot: string; draft: ReleaseDraftSnapshot; payload: ReleaseSubmitRequest }): boolean {
  const releaseId = pending.draft.releaseId;
  const record: PendingReleaseSubmission = {
    key: pending.key,
    snapshotHash: hashSubmissionValue(pending.snapshot),
    payloadHash: hashSubmissionValue(JSON.stringify(pending.payload)),
    draft: { releaseId, draftsCount: pending.draft.draftsCount }
  };
  const value = JSON.stringify(record);
  try {
    storage.setItem(slot(releaseId), value);
    return true;
  } catch {
    // Free space taken by other releases' pending records, then retry once.
    pruneSubmissionRecords(storage, slot(releaseId));
    try {
      storage.setItem(slot(releaseId), value);
      return true;
    } catch {
      return false;
    }
  }
}

export function pruneSubmissionRecords(storage: SubmissionStorage, keep?: string): void {
  const stale: string[] = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(PREFIX) && key !== keep) stale.push(key);
    }
  } catch { return; }
  for (const key of stale) safeRemove(storage, key);
}

export function completePendingSubmission(storage: SubmissionStorage, releaseId: string): void {
  safeRemove(storage, slot(releaseId));
}
