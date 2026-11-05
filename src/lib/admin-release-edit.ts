/**
 * Pure helpers for the admin "edit release" form, kept apart from the route so they can be tested.
 */

export interface PersonGroups {
  performers: string[];
  feats: string[];
  remixers: string[];
  coPerformers: string[];
  producers: string[];
  musicAuthors: string[];
  lyricsAuthors: string[];
}

/** Role labels exactly as the release wizard saves them (see src/lib/person-roles.ts). */
const WIZARD_ROLE_BY_GROUP: Record<keyof PersonGroups, string> = {
  performers: "Исполнитель",
  feats: "feat.",
  remixers: "Remixer",
  coPerformers: "Соисполнитель",
  producers: "Продюсер",
  musicAuthors: "Автор музыки",
  lyricsAuthors: "Автор слов"
};

export const EMPTY_PERSON_GROUPS: PersonGroups = {
  performers: [],
  feats: [],
  remixers: [],
  coPerformers: [],
  producers: [],
  musicAuthors: [],
  lyricsAuthors: []
};

export function normalizePersonGroups(value: unknown): PersonGroups {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const list = (key: keyof PersonGroups) => {
    const raw = source[key];
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const item of raw) {
      const name = typeof item === "string" ? item.trim() : "";
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      names.push(name);
    }
    return names;
  };
  return {
    performers: list("performers"),
    feats: list("feats"),
    remixers: list("remixers"),
    coPerformers: list("coPerformers"),
    producers: list("producers"),
    musicAuthors: list("musicAuthors"),
    lyricsAuthors: list("lyricsAuthors")
  };
}

/** The same people as the wizard's `persons` list: one `{ name, role }` row per person and role. */
export function toWizardPersons(groups: PersonGroups): Array<{ name: string; role: string }> {
  return (Object.keys(WIZARD_ROLE_BY_GROUP) as Array<keyof PersonGroups>).flatMap((group) =>
    groups[group].map((name) => ({ name, role: WIZARD_ROLE_BY_GROUP[group] }))
  );
}

/** Comma-joined names for the release's flat performer / feat / remixer columns. */
export function joinNames(names: string[]): string | null {
  const joined = names.join(", ").trim();
  return joined || null;
}

function sameNames(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (list: string[]) => list.map((name) => name.trim().toLowerCase()).sort();
  const left = norm(a);
  const right = norm(b);
  return left.every((name, index) => name === right[index]);
}

/**
 * Carries release-level edits down to tracks the admin did not touch themselves:
 * - a new release performer replaces the old one on tracks that listed exactly the old release performers;
 * - on a single, a new release title replaces the track title when the track was named like the release.
 * Anything the admin changed on the track explicitly is kept as is.
 */
export function carryReleaseEditsToTrack(params: {
  isSingle: boolean;
  releaseTitleBefore: string;
  releaseTitleAfter: string;
  releasePerformersBefore: string[];
  releasePerformersAfter: string[];
  trackTitleBefore: string;
  trackTitleIncoming: string;
  trackPerformersBefore: string[];
  trackPerformersIncoming: string[];
}): { title: string; performers: string[] } {
  let title = params.trackTitleIncoming;
  const titleUntouched = params.trackTitleIncoming.trim() === params.trackTitleBefore.trim();
  const releaseRenamed = params.releaseTitleAfter.trim() !== params.releaseTitleBefore.trim();
  const trackNamedLikeRelease =
    params.trackTitleBefore.trim().toLowerCase() === params.releaseTitleBefore.trim().toLowerCase();
  if (params.isSingle && releaseRenamed && titleUntouched && trackNamedLikeRelease) {
    title = params.releaseTitleAfter.trim();
  }

  let performers = params.trackPerformersIncoming;
  const performersUntouched = sameNames(params.trackPerformersIncoming, params.trackPerformersBefore);
  const releasePerformersChanged = !sameNames(params.releasePerformersAfter, params.releasePerformersBefore);
  const trackFollowedRelease = sameNames(params.trackPerformersBefore, params.releasePerformersBefore);
  if (releasePerformersChanged && performersUntouched && trackFollowedRelease && params.releasePerformersAfter.length > 0) {
    performers = [...params.releasePerformersAfter];
  }

  return { title, performers };
}
