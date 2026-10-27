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
  if (code === "presave") return "Пре-сейв";
  return SMART_LINK_PLATFORM_CATALOG.find((item) => item.code === code)?.label ?? code;
}

// Host (optionally with a path prefix) → platform code. Order matters: more specific entries first.
const SMART_LINK_PLATFORM_HOSTS: Array<{ code: string; prefixes: string[] }> = [
  { code: "yandex_music", prefixes: ["music.yandex.ru", "music.yandex.com", "music.yandex.by", "music.yandex.kz", "music.yandex.uz"] },
  {
    code: "vk_music",
    prefixes: [
      // vk.com and vk.ru serve the same music links: albums, playlists, artists and single tracks (audio<owner>_<id>).
      ...["vk.com", "vk.ru", "m.vk.com", "m.vk.ru"].flatMap((host) => [
        `${host}/music`,
        `${host}/audio`,
        `${host}/artist`,
        `${host}/playlist`
      ]),
      "music.vk.com",
      "boom.ru"
    ]
  },
  { code: "zvuk_wink_music", prefixes: ["zvuk.com", "sber-zvuk.com"] },
  { code: "spotify", prefixes: ["open.spotify.com", "spotify.link", "play.spotify.com"] },
  { code: "apple_music", prefixes: ["music.apple.com", "geo.music.apple.com"] },
  { code: "itunes", prefixes: ["itunes.apple.com"] },
  { code: "youtube_music", prefixes: ["music.youtube.com"] },
  { code: "mts_music", prefixes: ["music.mts.ru"] },
  { code: "deezer", prefixes: ["deezer.com", "deezer.page.link", "link.deezer.com"] },
  { code: "amazon_music", prefixes: ["music.amazon."] },
  { code: "soundcloud", prefixes: ["soundcloud.com", "on.soundcloud.com", "m.soundcloud.com"] },
  { code: "tidal", prefixes: ["tidal.com", "listen.tidal.com"] },
  { code: "tiktok", prefixes: ["tiktok.com", "vm.tiktok.com"] },
  { code: "odnoklassniki", prefixes: ["ok.ru"] },
  { code: "anghami", prefixes: ["anghami.com", "play.anghami.com"] },
  { code: "qobuz", prefixes: ["qobuz.com", "open.qobuz.com", "play.qobuz.com"] },
  { code: "pandora", prefixes: ["pandora.com"] },
  { code: "kkbox", prefixes: ["kkbox.com"] },
  { code: "jiosaavn", prefixes: ["jiosaavn.com"] },
  { code: "netease", prefixes: ["music.163.com", "y.music.163.com"] },
  { code: "line_music_rythm", prefixes: ["music.line.me"] },
  { code: "iheart", prefixes: ["iheart.com"] },
  { code: "awa", prefixes: ["awa.fm", "s.awa.fm"] },
  { code: "trebel", prefixes: ["trebel.io", "home.trebel.io"] }
];

/** Recognizes which streaming platform a release link belongs to; null when the link is not a known platform. */
export function detectSmartLinkPlatform(input: string): string | null {
  let candidate = input.trim();
  if (!candidate) return null;
  if (!/^[a-z][a-z0-9+.-]*:/iu.test(candidate)) candidate = `https://${candidate.replace(/^\/\//u, "")}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./u, "");
  const hostAndPath = `${host}${parsed.pathname.toLowerCase()}`;
  for (const entry of SMART_LINK_PLATFORM_HOSTS) {
    for (const prefix of entry.prefixes) {
      if (prefix.includes("/")) {
        // "vk.com/audio123_45" and "vk.com/music/album" match, a profile like "vk.com/audiophile" does not.
        if (hostAndPath.startsWith(prefix) && !/^[a-zа-яё]/iu.test(hostAndPath.slice(prefix.length))) return entry.code;
      } else if (prefix.endsWith(".")) {
        if (host.startsWith(prefix)) return entry.code;
      } else if (host === prefix || host.endsWith(`.${prefix}`)) {
        return entry.code;
      }
    }
  }
  return null;
}
