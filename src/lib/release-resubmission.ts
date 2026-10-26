import type { PrismaClient } from "@prisma/client";

import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";

/** Marker of an already approved release that the artist sent to moderation again.
 * `sourceReleaseId` is set when the resubmission is a separate copy of the approved release. */
export interface ReleaseResubmission {
  resubmittedAt: string;
  previousStatus?: string;
  sourceReleaseId?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

export function getReleaseResubmission(roles: unknown): ReleaseResubmission | null {
  const marker = asRecord(asRecord(roles)?.resubmission);
  const resubmittedAt = asString(marker?.resubmittedAt);
  if (!marker || !resubmittedAt) return null;

  const state: ReleaseResubmission = { resubmittedAt };
  const previousStatus = asString(marker.previousStatus);
  const sourceReleaseId = asString(marker.sourceReleaseId);
  if (previousStatus) state.previousStatus = previousStatus;
  if (sourceReleaseId) state.sourceReleaseId = sourceReleaseId;
  return state;
}

export function withReleaseResubmission(
  roles: Record<string, unknown>,
  params: {
    previousStatus?: string | null;
    sourceReleaseId?: string | null;
    resubmittedAt?: Date;
  }
): Record<string, unknown> {
  const marker: ReleaseResubmission = {
    resubmittedAt: (params.resubmittedAt ?? new Date()).toISOString()
  };
  if (params.previousStatus) marker.previousStatus = params.previousStatus;
  if (params.sourceReleaseId) marker.sourceReleaseId = params.sourceReleaseId;
  return { ...roles, resubmission: marker };
}

export function readReleaseUpc(source: { upc?: string | null; roles: unknown }): string | null {
  const explicit = source.upc?.trim();
  if (explicit) return explicit;
  const submission = asRecord(asRecord(source.roles)?.submissionData);
  return asString(submission?.upc);
}

/** Finds an approved paid release of the same artist with the same UPC: the artist re-sent it as a new copy. */
export async function findPaidPredecessorRelease(
  db: { release: Pick<PrismaClient["release"], "findMany"> },
  params: { userId: string; releaseId: string; upc: string | null | undefined }
): Promise<{ id: string; title: string } | null> {
  const upc = params.upc?.trim();
  if (!upc) return null;

  const candidates = await db.release.findMany({
    where: { userId: params.userId, confirmed: true, id: { not: params.releaseId } },
    select: { id: true, title: true, status: true, upc: true, roles: true }
  });
  const match = candidates.find(
    (candidate) =>
      readReleaseUpc(candidate) === upc &&
      shouldTreatReleaseAsApproved({ ...candidate, confirmed: true, upc: readReleaseUpc(candidate) })
  );
  return match ? { id: match.id, title: match.title } : null;
}
