/**
 * Release and track performers are separate lists in the wizard. A track performer missing from
 * the release performers is usually a typo or a wrong artist (it is how the track goes out to
 * platforms), but it is also legitimate for compilations, so this only warns.
 */

const PERFORMER_ROLE = "исполнитель";

export interface TrackPerformerMismatch {
  trackIndex: number;
  trackTitle: string;
  /** Track performers that are not performers of the release. */
  extraPerformers: string[];
  releasePerformers: string[];
}

type PersonLike = { name?: unknown; role?: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/ё/gu, "е").replace(/\s+/gu, " ");
}

function performerNames(persons: unknown): string[] {
  if (!Array.isArray(persons)) return [];
  const names: string[] = [];
  for (const item of persons as PersonLike[]) {
    const person = asRecord(item);
    const name = typeof person?.name === "string" ? person.name.trim() : "";
    const role = typeof person?.role === "string" ? person.role.trim().toLowerCase() : "";
    if (name && role === PERFORMER_ROLE) names.push(name);
  }
  return names;
}

export function findTrackPerformerMismatches(submissionData: unknown): TrackPerformerMismatch[] {
  const data = asRecord(submissionData);
  if (!data) return [];
  const releasePerformers = performerNames(data.persons);
  if (releasePerformers.length === 0) return [];
  const known = new Set(releasePerformers.map(normalizeName));
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  const mismatches: TrackPerformerMismatch[] = [];
  tracks.forEach((value, trackIndex) => {
    const track = asRecord(value);
    if (!track) return;
    const extraPerformers = performerNames(track.trackPersons).filter((name) => !known.has(normalizeName(name)));
    if (extraPerformers.length === 0) return;
    mismatches.push({
      trackIndex,
      trackTitle: typeof track.title === "string" ? track.title.trim() : "",
      extraPerformers,
      releasePerformers
    });
  });
  return mismatches;
}

export function describeTrackPerformerMismatch(mismatch: TrackPerformerMismatch): string {
  const track = `Трек ${mismatch.trackIndex + 1}${mismatch.trackTitle ? ` «${mismatch.trackTitle}»` : ""}`;
  const extra = mismatch.extraPerformers.map((name) => `«${name}»`).join(", ");
  const release = mismatch.releasePerformers.map((name) => `«${name}»`).join(", ");
  return `${track}: исполнитель ${extra} не совпадает с исполнителем релиза ${release}.`;
}

/** Main release roles a new track starts with, so the artist does not retype them. */
const INHERITED_TRACK_ROLES = new Set(["исполнитель", "feat.", "remixer"]);

export function inheritReleasePersonsForTrack<T extends { name: string; role: string }>(
  releasePersons: readonly T[]
): Array<{ name: string; role: string }> {
  return releasePersons
    .filter((person) => person.name.trim() && INHERITED_TRACK_ROLES.has(person.role.trim().toLowerCase()))
    .map((person) => ({ name: person.name.trim(), role: person.role.trim() }));
}
