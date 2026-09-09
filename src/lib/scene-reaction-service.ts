import { createHash, randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { isReleaseVisibleOnScene } from "@/lib/scene-policy";
import { getSceneShowcaseState } from "@/lib/scene-showcase-state";

export const SCENE_VISITOR_COOKIE = "icm_scene_visitor";
export const SCENE_REACTIONS = ["playlist", "hit", "cover"] as const;
export type SceneReaction = (typeof SCENE_REACTIONS)[number];

export interface SceneReactionSummary {
  counts: Record<SceneReaction, number>;
  active: SceneReaction[];
  weeklyScore: number;
  weeklyUniqueListeners: number;
  todayPlaylistCount: number;
}

export function isSceneReaction(value: unknown): value is SceneReaction {
  return typeof value === "string" && SCENE_REACTIONS.includes(value as SceneReaction);
}

export function normalizeSceneVisitorId(value: string | null | undefined): string {
  if (value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    return value.toLowerCase();
  }
  return randomUUID();
}

export function hashSceneVisitorIp(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  const secret = process.env.SCENE_REACTION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  return createHash("sha256").update(`${secret}:${ip}`).digest("hex");
}

export async function assertSceneReleaseExists(prisma: PrismaClient, releaseId: string) {
  const release = await prisma.release.findUnique({
    where: { id: releaseId },
    select: { id: true, status: true, confirmed: true, upc: true, roles: true, date: true }
  });
  if (!release || !isReleaseVisibleOnScene({
    status: release.status,
    confirmed: release.confirmed,
    upc: release.upc,
    roles: release.roles,
    releaseDate: release.date
  })) {
    throw new Error("SCENE_RELEASE_NOT_FOUND");
  }
  return release;
}

export async function toggleSceneReaction(params: {
  prisma: PrismaClient;
  releaseId: string;
  visitorId: string;
  reaction: SceneReaction;
  ipHash: string | null;
}) {
  const release = await assertSceneReleaseExists(params.prisma, params.releaseId);
  const showcase = getSceneShowcaseState(release.roles);
  if (params.reaction !== "cover" && (!showcase.enabled || !showcase.previewAsset)) {
    throw new Error("SCENE_PREVIEW_REQUIRED");
  }
  return params.prisma.$transaction(async (tx) => {
    const existing = await tx.scene_release_reactions.findUnique({
      where: {
        release_id_visitor_id_reaction: {
          release_id: params.releaseId,
          visitor_id: params.visitorId,
          reaction: params.reaction
        }
      },
      select: { id: true }
    });
    if (existing) {
      await tx.scene_release_reactions.delete({ where: { id: existing.id } });
      return { active: false };
    }
    if (params.reaction === "playlist" || params.reaction === "hit") {
      await tx.scene_release_reactions.deleteMany({
        where: {
          release_id: params.releaseId,
          visitor_id: params.visitorId,
          reaction: { in: params.reaction === "playlist" ? ["hit"] : ["playlist"] }
        }
      });
    }
    await tx.scene_release_reactions.create({
      data: {
        release_id: params.releaseId,
        visitor_id: params.visitorId,
        reaction: params.reaction,
        ip_hash: params.ipHash
      }
    });
    return { active: true };
  });
}

export async function getSceneReactionSummaries(params: {
  prisma: PrismaClient;
  releaseIds: string[];
  visitorId?: string | null;
  now?: Date;
}): Promise<Record<string, SceneReactionSummary>> {
  const releaseIds = Array.from(new Set(params.releaseIds)).slice(0, 48);
  if (releaseIds.length === 0) return {};
  const weekStart = new Date(params.now ?? new Date());
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const todayStart = new Date(params.now ?? new Date());
  todayStart.setUTCHours(0, 0, 0, 0);

  const [allRows, weeklyListeners, weeklyRows, todayRows, activeRows] = await Promise.all([
    params.prisma.scene_release_reactions.groupBy({
      by: ["release_id", "reaction"],
      where: { release_id: { in: releaseIds } },
      _count: { _all: true }
    }),
    params.prisma.scene_release_reactions.findMany({
      where: {
        release_id: { in: releaseIds },
        reaction: { in: ["playlist", "hit"] },
        created_at: { gte: weekStart }
      },
      select: { release_id: true, visitor_id: true },
      distinct: ["release_id", "visitor_id"]
    }),
    params.prisma.scene_release_reactions.groupBy({
      by: ["release_id"],
      where: {
        release_id: { in: releaseIds },
        reaction: { in: ["playlist", "hit"] },
        created_at: { gte: weekStart }
      },
      _count: { _all: true }
    }),
    params.prisma.scene_release_reactions.groupBy({
      by: ["release_id"],
      where: {
        release_id: { in: releaseIds },
        reaction: "playlist",
        created_at: { gte: todayStart }
      },
      _count: { _all: true }
    }),
    params.visitorId
      ? params.prisma.scene_release_reactions.findMany({
          where: { release_id: { in: releaseIds }, visitor_id: params.visitorId },
          select: { release_id: true, reaction: true }
        })
      : Promise.resolve([])
  ]);

  const result = Object.fromEntries(releaseIds.map((id) => [id, {
    counts: { playlist: 0, hit: 0, cover: 0 },
    active: [] as SceneReaction[],
    weeklyScore: 0,
    weeklyUniqueListeners: 0,
    todayPlaylistCount: 0
  } satisfies SceneReactionSummary])) as Record<string, SceneReactionSummary>;
  for (const row of allRows) {
    if (isSceneReaction(row.reaction)) result[row.release_id]!.counts[row.reaction] = row._count._all;
  }
  for (const row of weeklyRows) result[row.release_id]!.weeklyScore = row._count._all;
  for (const row of weeklyListeners) result[row.release_id]!.weeklyUniqueListeners += 1;
  for (const row of todayRows) result[row.release_id]!.todayPlaylistCount = row._count._all;
  for (const row of activeRows) {
    if (isSceneReaction(row.reaction)) result[row.release_id]!.active.push(row.reaction);
  }
  return result;
}
