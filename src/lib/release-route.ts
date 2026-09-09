export function buildReleaseDetailHref(releaseId: string): string {
  return `/feed/release_${encodeURIComponent(releaseId)}`;
}
