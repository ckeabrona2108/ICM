const MAX_QUALIFIED_PLAY_SECONDS = 30;
const SHORT_PREVIEW_RATIO = 0.5;
const MAX_CONTIGUOUS_MEDIA_DELTA_SECONDS = 2;

export function getQualifiedPlayThresholdSeconds(durationSeconds: number): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return Math.min(MAX_QUALIFIED_PLAY_SECONDS, durationSeconds * SHORT_PREVIEW_RATIO);
}

export function accumulateQualifiedPlayback(input: {
  listenedSeconds: number;
  previousMediaTime: number | null;
  currentMediaTime: number;
}): number {
  if (input.previousMediaTime === null) return input.listenedSeconds;
  const delta = input.currentMediaTime - input.previousMediaTime;
  if (!Number.isFinite(delta) || delta <= 0 || delta > MAX_CONTIGUOUS_MEDIA_DELTA_SECONDS) {
    return input.listenedSeconds;
  }
  return input.listenedSeconds + delta;
}
