import type { PrismaClient } from "@prisma/client";

import { getReleaseLifecycleStatus } from "@/lib/release-counts";
import { isReleaseHiddenFromCabinet } from "@/lib/release-deletion-state";

export interface ReleaseResumeCandidate {
  id: string;
  title: string;
  kind: "draft" | "awaiting_payment";
  updatedAt: string | null;
  tracksCount: number;
}

function readUpdatedAt(roles: unknown): string | null {
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return null;
  const value = (roles as Record<string, unknown>).draftUpdatedAt;
  if (typeof value !== "string") return null;
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

/** Unfinished releases the artist should continue instead of starting a duplicate "Новый релиз". */
export async function listReleaseResumeCandidates(
  prisma: Pick<PrismaClient, "release">,
  userId: string,
  limit = 3
): Promise<ReleaseResumeCandidate[]> {
  const releases = await prisma.release.findMany({
    where: { userId, confirmed: false },
    select: { id: true, title: true, status: true, roles: true, _count: { select: { track: true } } }
  });

  return releases
    .filter((release) => !isReleaseHiddenFromCabinet(release.roles))
    .map((release): ReleaseResumeCandidate | null => {
      const lifecycle = getReleaseLifecycleStatus(release.status, release.roles);
      const kind = lifecycle === "draft" ? "draft" : lifecycle === "moderation" ? "awaiting_payment" : null;
      if (!kind) return null;
      return {
        id: release.id,
        title: release.title?.trim() || "Без названия",
        kind,
        updatedAt: readUpdatedAt(release.roles),
        tracksCount: release._count.track
      };
    })
    .filter((item): item is ReleaseResumeCandidate => item !== null)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))
    .slice(0, limit);
}
