import type { PrismaClient } from "@prisma/client";

import { resolveTrackAudioAsset } from "@/lib/release-media-asset";
import { shouldTreatReleaseAsApproved } from "@/lib/release-counts";
import { getSceneShowcaseState } from "@/lib/scene-showcase-state";

const PLAY_DEDUPLICATION_WINDOW_MS = 5 * 60_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

export async function recordSceneReleasePlay(params: {
  prisma: PrismaClient;
  releaseId: string;
  visitorId: string;
  ipHash: string | null;
  now?: Date;
  resolveTrackAudio?: typeof resolveTrackAudioAsset;
}) {
  const now = params.now ?? new Date();
  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: {
      id: true,
      title: true,
      date: true,
      status: true,
      confirmed: true,
      roles: true,
      track: {
        orderBy: { index: "asc" },
        take: 1,
        select: {
          id: true,
          index: true,
          title: true,
          track: true,
          roles: true
        }
      }
    }
  });
  if (!release || release.date > now || !shouldTreatReleaseAsApproved(release)) {
    throw new Error("SCENE_RELEASE_NOT_FOUND");
  }
  const showcase = getSceneShowcaseState(release.roles);
  let hasPlayableAudio = Boolean(showcase.previewAsset);

  if (!hasPlayableAudio) {
    const firstTrack = release.track[0] ?? null;
    const firstTrackRoles = asRecord(firstTrack?.roles) ?? {};
    const releaseRoles = asRecord(release.roles);
    const submissionData = asRecord(releaseRoles?.submissionData);
    const submissionTracks = Array.isArray(submissionData?.tracks)
      ? submissionData.tracks.map(asRecord).filter((track): track is Record<string, unknown> => Boolean(track))
      : [];
    const submissionTrack = firstTrack
      ? submissionTracks.find((track) => asString(track.id) === firstTrack.id)
        ?? submissionTracks[Math.max(0, firstTrack.index - 1)]
        ?? null
      : null;

    if (firstTrack) {
      const resolvedTrackAudio = await (params.resolveTrackAudio ?? resolveTrackAudioAsset)({
        releaseId: release.id,
        releaseTitle: release.title,
        trackId: firstTrack.id,
        trackTitle: firstTrack.title,
        audioFile: firstTrackRoles.audioFile ?? submissionTrack?.audioFile,
        audioUpload: firstTrackRoles.audioUpload ?? submissionTrack?.audioUpload,
        audioUrl: firstTrackRoles.audioUrl ?? submissionTrack?.audioUrl,
        audio: firstTrackRoles.audio ?? submissionTrack?.audio,
        track: firstTrack.track ?? submissionTrack?.track
      });
      hasPlayableAudio = Boolean(resolvedTrackAudio.url || resolvedTrackAudio.candidateUrls[0]);
    }
  }

  if (!hasPlayableAudio) {
    throw new Error("SCENE_PREVIEW_REQUIRED");
  }

  return params.prisma.$transaction(async (tx) => {
    const lockKey = `${params.releaseId}:${params.visitorId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;

    const recentPlay = await tx.scene_release_plays.findFirst({
      where: {
        release_id: params.releaseId,
        visitor_id: params.visitorId,
        created_at: { gte: new Date(now.getTime() - PLAY_DEDUPLICATION_WINDOW_MS) }
      },
      select: { id: true }
    });
    if (!recentPlay) {
      await tx.scene_release_plays.create({
        data: {
          release_id: params.releaseId,
          visitor_id: params.visitorId,
          ip_hash: params.ipHash,
          created_at: now
        }
      });
    }

    const count = await tx.scene_release_plays.count({
      where: { release_id: params.releaseId }
    });
    return { count, counted: !recentPlay };
  });
}
