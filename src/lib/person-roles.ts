export interface PersonRoleOption {
  value: string;
  label: string;
}

export const MAIN_RELEASE_PERSON_ROLE_OPTIONS: PersonRoleOption[] = [
  { value: "Исполнитель", label: "Исполнитель" },
  { value: "feat.", label: "feat." },
  { value: "Remixer", label: "Remixer" }
];

export const TRACK_METADATA_PERSON_ROLE_OPTIONS: PersonRoleOption[] = [
  ...MAIN_RELEASE_PERSON_ROLE_OPTIONS,
  { value: "Соисполнитель", label: "Соисполнитель" },
  { value: "Продюсер", label: "Продюсер" },
  { value: "Автор музыки", label: "Автор музыки" },
  { value: "Автор слов", label: "Автор слов" }
];

/**
 * Backward-compatible aliases used by wizard components.
 * `releasePersonRoleOptions` => основная карточка релиза.
 * `trackPersonRoleOptions` => метаданные трека.
 */
export const releasePersonRoleOptions: PersonRoleOption[] = [
  ...MAIN_RELEASE_PERSON_ROLE_OPTIONS
];

export const trackPersonRoleOptions: PersonRoleOption[] = [
  ...TRACK_METADATA_PERSON_ROLE_OPTIONS
];

/**
 * Legacy roles from earlier versions that can still be present
 * in saved releases. We keep them valid on backend to avoid
 * breaking re-submission of old data.
 */
const LEGACY_RELEASE_COMPAT_ROLE_VALUES = [
  "Соисполнитель",
  "Продюсер",
  "Автор",
  "Автор музыки",
  "Автор текста",
  "Автор слов"
];

const normalize = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/gu, " ");

const releaseRoleSet = new Set(
  [
    ...releasePersonRoleOptions.map((option) => option.value),
    ...LEGACY_RELEASE_COMPAT_ROLE_VALUES
  ].map(normalize)
);

const trackRoleSet = new Set(
  [
    ...trackPersonRoleOptions.map((option) => option.value),
    // legacy compatibility: keep old saved values valid on backend
    "Автор",
    "Автор текста"
  ].map(normalize)
);

export function isAllowedReleasePersonRole(value: string): boolean {
  return releaseRoleSet.has(normalize(value));
}

export function isAllowedTrackPersonRole(value: string): boolean {
  return trackRoleSet.has(normalize(value));
}
