export interface SmartLinkPlatformMeta {
  code: string;
  label: string;
}

export const SMART_LINK_PRIMARY_PLATFORM_CATALOG: SmartLinkPlatformMeta[] = [
  { code: "yandex_music", label: "Яндекс Музыка" },
  { code: "vk_music", label: "VK Музыка" },
  { code: "zvuk_wink_music", label: "Звук" },
  { code: "spotify", label: "Spotify" },
  { code: "apple_music", label: "Apple Music" }
];

export const SMART_LINK_SECONDARY_PLATFORM_CATALOG: SmartLinkPlatformMeta[] = [
  { code: "youtube_music", label: "YouTube Music" },
  { code: "deezer", label: "Deezer" },
  { code: "amazon_music", label: "Amazon Music" },
  { code: "soundcloud", label: "SoundCloud" },
  { code: "tidal", label: "TIDAL" },
  { code: "tiktok", label: "TikTok" },
  { code: "mts_music", label: "МТС Музыка" },
  { code: "itunes", label: "iTunes" },
  { code: "odnoklassniki", label: "Одноклассники" },
  { code: "anghami", label: "Anghami" },
  { code: "qobuz", label: "Qobuz" },
  { code: "pandora", label: "Pandora" },
  { code: "kkbox", label: "KKBOX" },
  { code: "jiosaavn", label: "JioSaavn" },
  { code: "netease", label: "Netease" },
  { code: "line_music_rythm", label: "LINE MUSIC" },
  { code: "iheart", label: "iHeart" },
  { code: "awa", label: "AWA" },
  { code: "trebel", label: "TREBEL" }
];

export const SMART_LINK_PLATFORM_CATALOG: SmartLinkPlatformMeta[] = [
  ...SMART_LINK_PRIMARY_PLATFORM_CATALOG,
  ...SMART_LINK_SECONDARY_PLATFORM_CATALOG
];

export const SMART_LINK_PRIMARY_PLATFORM_CODES = SMART_LINK_PRIMARY_PLATFORM_CATALOG.map((item) => item.code);

export const SMART_LINK_PLATFORM_CODES = SMART_LINK_PLATFORM_CATALOG.map((item) => item.code);

export function getSmartLinkPlatformLabel(code: string): string {
  return SMART_LINK_PLATFORM_CATALOG.find((item) => item.code === code)?.label ?? code;
}
