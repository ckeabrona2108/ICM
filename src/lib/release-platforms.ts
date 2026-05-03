export type ReleasePlatformKind = "streaming" | "video" | "utility";

export interface ReleasePlatformDefinition {
  code: string;
  label: string;
  kind: ReleasePlatformKind;
}

export const releasePlatformDefinitions: ReleasePlatformDefinition[] = [
  { code: "apple_music", label: "Apple Music", kind: "streaming" },
  { code: "spotify", label: "Spotify", kind: "streaming" },
  { code: "seven_digital", label: "7digital", kind: "streaming" },
  { code: "acr_cloud", label: "ACRCloud", kind: "utility" },
  { code: "amazon_music", label: "Amazon Music", kind: "streaming" },
  { code: "anghami", label: "Anghami", kind: "streaming" },
  { code: "audible_magic", label: "AudibleMagic", kind: "utility" },
  { code: "awa", label: "AWA", kind: "streaming" },
  { code: "base_nda", label: "BASE_NDA", kind: "utility" },
  { code: "beeline_kz", label: "BeeLine KZ", kind: "streaming" },
  { code: "other_distribution", label: "Иная дистрибуция", kind: "utility" },
  { code: "mobi_music_kz", label: "Mobi Music KZ", kind: "streaming" },
  { code: "jaxsta", label: "Jaxsta", kind: "utility" },
  { code: "cron_telecom", label: "Cron Telecom", kind: "streaming" },
  { code: "lyric_find", label: "LyricFind", kind: "utility" },
  { code: "beeline_t2_rbt", label: "Билайн, t2 (РБТ)", kind: "streaming" },
  { code: "mts_rbt", label: "МТС (РБТ)", kind: "streaming" },
  { code: "vk_video", label: "VK Видео", kind: "video" },
  { code: "peloton", label: "Peloton", kind: "streaming" },
  { code: "smule", label: "Smule", kind: "streaming" },
  { code: "spotify_video", label: "Spotify Видео", kind: "video" },
  { code: "tiktok", label: "TikTok", kind: "streaming" },
  { code: "yandex_video", label: "Яндекс Видео", kind: "video" },
  { code: "zvuk_wink_music", label: "Звук / Wink Music", kind: "streaming" },
  { code: "clicknclear", label: "ClicknClear", kind: "utility" },
  { code: "flo", label: "FLO", kind: "streaming" },
  { code: "iheart", label: "iHeart", kind: "streaming" },
  { code: "jiosaavn", label: "JioSaavn", kind: "streaming" },
  { code: "likee", label: "Likee", kind: "streaming" },
  { code: "mobi_music", label: "mobi music", kind: "streaming" },
  { code: "megafon_rbt", label: "МегаФон (РБТ)", kind: "streaming" },
  { code: "youtube_sound_recording", label: "YouTube (Sound Recording)", kind: "streaming" },
  { code: "vk_music", label: "VK Музыка", kind: "streaming" },
  { code: "pretzel", label: "Pretzel", kind: "streaming" },
  { code: "soundcloud", label: "SoundCloud", kind: "streaming" },
  { code: "tencent", label: "Tencent", kind: "streaming" },
  { code: "trebel", label: "TREBEL", kind: "streaming" },
  { code: "youtube_copyright", label: "YouTube Copyright", kind: "utility" },
  { code: "zvuk_video", label: "Звук Видео", kind: "video" },
  { code: "deezer", label: "Deezer", kind: "streaming" },
  { code: "go_music", label: "GoMusic", kind: "streaming" },
  { code: "ipex", label: "IPEX", kind: "utility" },
  { code: "kkbox", label: "KKBOX", kind: "streaming" },
  { code: "line_music_rythm", label: "LINE MUSIC / Rythm", kind: "streaming" },
  { code: "musixmatch", label: "MusixMatch", kind: "utility" },
  { code: "rbt_partner", label: "РБТ-Партнёрка", kind: "streaming" },
  { code: "netease", label: "Netease", kind: "streaming" },
  { code: "pandora", label: "Pandora", kind: "streaming" },
  { code: "qobuz", label: "Qobuz", kind: "streaming" },
  { code: "soundexchange", label: "SoundExchange", kind: "utility" },
  { code: "tidal", label: "TIDAL", kind: "streaming" },
  { code: "yandex_music", label: "Яндекс Музыка", kind: "streaming" },
  { code: "youtube_music", label: "YouTube Music", kind: "streaming" }
];

export const allReleasePlatformCodes = releasePlatformDefinitions.map((platform) => platform.code);

export const streamingPlatformCodes = releasePlatformDefinitions
  .filter((platform) => platform.kind === "streaming")
  .map((platform) => platform.code);

export const videoPlatformCodes = releasePlatformDefinitions
  .filter((platform) => platform.kind === "video" || platform.kind === "utility")
  .map((platform) => platform.code);

export function getReleasePlatformLabel(code: string): string {
  return (
    releasePlatformDefinitions.find((platform) => platform.code === code)?.label ?? code
  );
}
