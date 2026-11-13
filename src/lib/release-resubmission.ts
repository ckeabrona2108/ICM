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

/** Key in `release.roles` linking a moderation copy to the approved release it was made from. */
export const RELEASE_COPY_SOURCE_KEY = "copyOfReleaseId";

/** Id of the approved release this release was copied from in the edit wizard, if any. */
export function readReleaseCopySourceId(roles: unknown): string | null {
  return asString(asRecord(roles)?.[RELEASE_COPY_SOURCE_KEY]);
}

export function withReleaseCopySource(roles: Record<string, unknown>, sourceReleaseId: string): Record<string, unknown> {
  return { ...roles, [RELEASE_COPY_SOURCE_KEY]: sourceReleaseId };
}

/** Finds an approved paid release of the same artist that this release re-sends: either the release
 * it was copied from (`sourceReleaseId`) or one with the same UPC. */
export async function findPaidPredecessorRelease(
  db: { release: Pick<PrismaClient["release"], "findMany"> },
  params: {
    userId: string;
    releaseId: string;
    upc: string | null | undefined | ReadonlyArray<string | null | undefined>;
    sourceReleaseId?: string | null;
  }
): Promise<{ id: string; title: string } | null> {
  const upcs = new Set(
    (Array.isArray(params.upc) ? params.upc : [params.upc])
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean)
  );
  const sourceReleaseId = params.sourceReleaseId?.trim() || null;
  if (upcs.size === 0 && !sourceReleaseId) return null;

  const candidates = await db.release.findMany({
    where: { userId: params.userId, confirmed: true, id: { not: params.releaseId } },
    select: { id: true, title: true, status: true, upc: true, roles: true }
  });
  const isApproved = (candidate: (typeof candidates)[number]) =>
    shouldTreatReleaseAsApproved({ ...candidate, confirmed: true, upc: readReleaseUpc(candidate) });
  const match =
    (sourceReleaseId
      ? candidates.find((candidate) => candidate.id === sourceReleaseId && isApproved(candidate))
      : undefined) ??
    candidates.find((candidate) => {
      const upc = readReleaseUpc(candidate);
      return Boolean(upc && upcs.has(upc)) && isApproved(candidate);
    });
  return match ? { id: match.id, title: match.title } : null;
}
