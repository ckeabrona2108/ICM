export interface SceneDiscoveryRelease {
  id: string;
  genre: string;
  releaseDate: string;
  coverUrl: string | null;
  audioUrl: string | null;
}

export interface SearchableSceneRelease {
  title: string;
  artist: string;
}

export interface SceneDiscoveryScore {
  weeklyScore: number;
  weeklyUniqueListeners?: number;
  todayPlaylistCount: number;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function searchSceneReleases<T extends SearchableSceneRelease>(
  releases: T[],
  query: string
): T[] {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return releases;

  const terms = normalizedQuery.split(" ");
  return releases.filter((release) => {
    const searchableText = normalizeSearchValue(`${release.artist} ${release.title}`);
    return terms.every((term) => searchableText.includes(term));
  });
}

export function getDailySceneRelease<T extends SceneDiscoveryRelease>(
  releases: T[],
  now = new Date()
): T | null {
  if (releases.length === 0) return null;
  const candidates = releases.filter((release) => release.audioUrl && release.coverUrl);
  const pool = [...(candidates.length > 0 ? candidates : releases)]
    .sort((left, right) => left.id.localeCompare(right.id));
  return pool[hashString(dateKey(now)) % pool.length] ?? null;
}

export function getUnderratedSceneRelease<T extends SceneDiscoveryRelease>(
  releases: T[],
  scores: Record<string, SceneDiscoveryScore>,
  excludedIds: string[] = []
): T | null {
  const excluded = new Set(excludedIds);
  return releases
    .filter((release) => release.audioUrl && release.coverUrl && !excluded.has(release.id))
    .sort((left, right) => {
      const scoreDifference = (scores[left.id]?.weeklyScore ?? 0) - (scores[right.id]?.weeklyScore ?? 0);
      if (scoreDifference !== 0) return scoreDifference;
      return new Date(right.releaseDate).getTime() - new Date(left.releaseDate).getTime();
    })[0] ?? null;
}

export function getWeeklySceneLeader<T extends SceneDiscoveryRelease>(
  releases: T[],
  scores: Record<string, SceneDiscoveryScore>
): T | null {
  return [...releases].sort((left, right) => {
    const leftScore = scores[left.id];
    const rightScore = scores[right.id];
    const scoreDifference = (rightScore?.weeklyScore ?? 0) - (leftScore?.weeklyScore ?? 0);
    if (scoreDifference !== 0) return scoreDifference;

    const listenerDifference =
      (rightScore?.weeklyUniqueListeners ?? 0) - (leftScore?.weeklyUniqueListeners ?? 0);
    if (listenerDifference !== 0) return listenerDifference;

    const dateDifference =
      new Date(right.releaseDate).getTime() - new Date(left.releaseDate).getTime();
    if (dateDifference !== 0) return dateDifference;
    return left.id.localeCompare(right.id);
  })[0] ?? null;
}

export function getSimilarMoodReleases<T extends SceneDiscoveryRelease>(
  releases: T[],
  currentId: string,
  limit = 3
): T[] {
  const current = releases.find((release) => release.id === currentId);
  if (!current) return [];

  return releases
    .filter((release) => release.id !== currentId)
    .sort((left, right) => {
      const leftGenreMatch = left.genre === current.genre ? 1 : 0;
      const rightGenreMatch = right.genre === current.genre ? 1 : 0;
      if (leftGenreMatch !== rightGenreMatch) return rightGenreMatch - leftGenreMatch;
      const leftPlayable = left.audioUrl ? 1 : 0;
      const rightPlayable = right.audioUrl ? 1 : 0;
      if (leftPlayable !== rightPlayable) return rightPlayable - leftPlayable;
      return new Date(right.releaseDate).getTime() - new Date(left.releaseDate).getTime();
    })
    .slice(0, limit);
}

export function getNextPlayableRelease<T extends SceneDiscoveryRelease>(
  releases: T[],
  currentId: string
): T | null {
  if (releases.length < 2) return null;
  const currentIndex = releases.findIndex((release) => release.id === currentId);
  if (currentIndex < 0) return releases.find((release) => release.audioUrl) ?? null;

  for (let offset = 1; offset < releases.length; offset += 1) {
    const candidate = releases[(currentIndex + offset) % releases.length];
    if (candidate?.audioUrl) return candidate;
  }
  return null;
}
