export const ARTIST_PROFILE_TYPES = ["artist", "group", "label", "producer"] as const;

export type ArtistProfileType = (typeof ARTIST_PROFILE_TYPES)[number];

export const ARTIST_PROFILE_TYPE_OPTIONS = [
  { value: "artist", label: "Артист", description: "Сольный исполнитель" },
  { value: "group", label: "Группа", description: "Общий каталог участников" },
  { value: "label", label: "Лейбл", description: "Каталог разных артистов" },
  { value: "producer", label: "Продюсер", description: "Профиль продюсера и коллабораций" }
] as const satisfies ReadonlyArray<{
  value: ArtistProfileType;
  label: string;
  description: string;
}>;

export function normalizeArtistProfileType(value: unknown): ArtistProfileType {
  return value === "group" || value === "label" || value === "producer" ? value : "artist";
}

export function artistProfileTypeLabel(value: ArtistProfileType): string {
  return ARTIST_PROFILE_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? "Артист";
}
