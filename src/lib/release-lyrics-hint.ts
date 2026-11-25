/** A track the review step suggests adding lyrics to. */
export interface TrackWithoutLyrics {
  index: number;
  title: string;
}

/**
 * Tracks that are sung but go without lyrics. Moderation is quicker with the text, so the review
 * step recommends adding it. Instrumentals have nothing to add.
 */
export function findTracksWithoutLyrics(
  tracks: ReadonlyArray<{
    name?: string;
    meta: { title: string; lyrics: string; versionInstrumental: boolean; syncedLyrics?: readonly unknown[] };
  }>
): TrackWithoutLyrics[] {
  return tracks.flatMap((track, index) => {
    if (track.meta.versionInstrumental) return [];
    if (track.meta.lyrics.trim() || (track.meta.syncedLyrics?.length ?? 0) > 0) return [];
    return [{ index, title: track.meta.title.trim() || track.name?.trim() || `Трек ${index + 1}` }];
  });
}
