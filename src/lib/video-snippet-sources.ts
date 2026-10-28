import { prisma } from "@/lib/prisma";
import { getReleaseCoverAsset } from "@/lib/release-cover";
import { resolveTrackAudioAsset } from "@/lib/release-media-asset";
import { objectExists, resolveRenderableStoredFileUrl } from "@/lib/s3";
import { deriveArtistName, getBaseUrl } from "@/lib/smart-link-service";

export interface VideoSnippetSourceTrack {
  index: number;
  title: string;
}

export interface VideoSnippetSource {
  releaseId: string;
  title: string;
  artist: string;
  releaseDate: string;
  /** Same-origin URL, so the studio can draw the cover without tainting the export canvas. */
  coverUrl: string | null;
  smartLinkUrl: string | null;
  tracks: VideoSnippetSourceTrack[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function submissionTracksOf(roles: unknown): Record<string, unknown>[] {
  const tracks = asRecord(asRecord(roles)?.submissionData)?.tracks;
  return Array.isArray(tracks) ? tracks.map((track) => asRecord(track) ?? {}) : [];
}

export async function getVideoSnippetSources(userId: string): Promise<VideoSnippetSource[]> {
  const releases = await prisma.release.findMany({
    where: { userId },
    select: {
      id: true,
      userId: true,
      title: true,
      date: true,
      preview: true,
      performer: true,
      roles: true,
      user: { select: { name: true } },
      promo_links: { select: { shortName: true }, take: 1 },
      track: { select: { index: true, title: true }, orderBy: { index: "asc" } }
    },
    orderBy: { date: "desc" },
    take: 60
  });

  const baseUrl = getBaseUrl();
  return Promise.all(
    releases
      .filter((release) => release.track.length > 0)
      .map(async (release) => {
        const slug = release.promo_links[0]?.shortName ?? null;
        // Same resolver as the releases list, so the studio shows the cover the artist sees there.
        const cover = await getReleaseCoverAsset({
          id: release.id,
          preview: release.preview,
          roles: release.roles,
          userId: release.userId,
          title: release.title
        });
        return {
          releaseId: release.id,
          title: release.title,
          artist: deriveArtistName({ performer: release.performer, userName: release.user.name, roles: release.roles }),
          releaseDate: release.date.toISOString(),
          coverUrl: resolveRenderableStoredFileUrl({ storageKey: cover.storageKey, url: cover.url }),
          smartLinkUrl: slug ? `${baseUrl}/l/${encodeURIComponent(slug)}` : null,
          tracks: release.track.map((track) => ({ index: track.index, title: track.title }))
        };
      })
  );
}

/** Resolves one track's audio to a same-origin URL; null when the release is not the user's or the file is missing. */
export async function resolveVideoSnippetTrackAudioUrl(params: {
  userId: string;
  releaseId: string;
  trackIndex: number;
}): Promise<string | null> {
  const release = await prisma.release.findFirst({
    where: { id: params.releaseId, userId: params.userId },
    select: {
      id: true,
      title: true,
      roles: true,
      track: { select: { id: true, index: true, title: true, track: true }, orderBy: { index: "asc" } }
    }
  });
  if (!release) return null;

  const position = release.track.findIndex((track) => track.index === params.trackIndex);
  const dbTrack = release.track[position];
  if (!dbTrack) return null;
  const submissionTrack = submissionTracksOf(release.roles)[position] ?? {};

  const input = {
    releaseId: release.id,
    userId: params.userId,
    releaseTitle: release.title,
    trackId: dbTrack.id,
    trackTitle: dbTrack.title,
    audioFile: submissionTrack.audioFile,
    audioUpload: submissionTrack.audioUpload,
    audioUrl: submissionTrack.audioUrl,
    audio: submissionTrack.audio,
    track: submissionTrack.track ?? dbTrack.track
  };

  // Fast path: the key saved with the release. Only a confirmed miss falls through —
  // an unknown answer from storage must not hide a file that is there.
  const quick = await resolveTrackAudioAsset({ ...input, preferImmediateUrl: true });
  if (quick.storageKey && (await objectExists(quick.storageKey)) !== false) {
    return resolveRenderableStoredFileUrl({ storageKey: quick.storageKey, url: quick.url });
  }

  // Slow path: probe every legacy location for the file.
  const probed = await resolveTrackAudioAsset({ ...input, requireReachable: true });
  if (!probed.url && !probed.storageKey) return null;
  return resolveRenderableStoredFileUrl({ storageKey: probed.storageKey, url: probed.url });
}
