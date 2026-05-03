function clean(value: string): string {
  return value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "").trim();
}

const platformAliasesByKey = new Map<string, string>([
  ["spotify", "Spotify"],
  ["spotifymusic", "Spotify"],
  ["apple", "Apple Music"],
  ["applemusic", "Apple Music"],
  ["musicapple", "Apple Music"],
  ["youtube", "YouTube Music"],
  ["youtubemusic", "YouTube Music"],
  ["yt", "YouTube Music"],
  ["ytmusic", "YouTube Music"],
  ["yandex", "Яндекс Музыка"],
  ["yandexmusic", "Яндекс Музыка"],
  ["yandexmuzyka", "Яндекс Музыка"],
  ["yamusic", "Яндекс Музыка"],
  ["vk", "VK Музыка"],
  ["vkontakte", "VK Музыка"],
  ["vkmusic", "VK Музыка"],
  ["umavk", "VK Музыка"],
  ["zvooq", "Звук"],
  ["zvook", "Звук"],
  ["zvuk", "Звук"],
  ["zvuc", "Звук"],
  ["sberzvuk", "Звук"],
  ["sberzvooq", "Звук"],
  ["mts", "МТС Музыка"],
  ["mtsmusic", "МТС Музыка"],
  ["deezer", "Deezer"],
  ["tiktok", "TikTok"]
]);

function toKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-zа-яё0-9]/giu, "");
}

export function normalizeAnalyticsPlatform(value: unknown): string {
  const raw = clean(String(value ?? ""));
  if (!raw) return "Unknown";

  const key = toKey(raw);
  const aliased = platformAliasesByKey.get(key);
  if (aliased) return aliased;

  if (key === "unknown" || key === "unk") return "Unknown";
  return raw;
}

export function normalizeAnalyticsPlatformHeader(value: string): string {
  const normalized = clean(value).toLowerCase();
  if (normalized === "platform") return "platform";
  if (normalized === "store") return "platform";
  if (normalized === "service") return "platform";
  if (normalized === "площадка") return "platform";
  return normalized;
}
