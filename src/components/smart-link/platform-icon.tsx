"use client";

import * as React from "react";

const TILE_CLASS = "grid shrink-0 place-items-center overflow-hidden rounded-[24%] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]";

function Glyph({ label, size = 26 }: { label: string; size?: number }) {
  return (
    <div className={`${TILE_CLASS} bg-white/[0.08] text-[10px] font-semibold uppercase text-white/78`} style={{ width: size, height: size }}>
      {label}
    </div>
  );
}

/**
 * Every icon is drawn as the same rounded tile: full-bleed artwork uses "cover",
 * logos on transparent or padded canvases sit on their brand background via "contain".
 */
function ImageTile({
  size = 26,
  bg = "transparent",
  src,
  alt,
  fit = "cover",
  scale = 1
}: {
  size?: number;
  bg?: string;
  src: string;
  alt: string;
  fit?: "cover" | "contain";
  scale?: number;
}) {
  return (
    <div className={TILE_CLASS} style={{ width: size, height: size, backgroundColor: bg }}>
      <img
        alt={alt}
        className={`block h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
        style={scale !== 1 ? { transform: `scale(${scale})` } : undefined}
        draggable={false}
        loading="lazy"
        src={src}
      />
    </div>
  );
}

function AppleMusicTile({ size = 26 }: { size?: number }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Apple Music" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fa5c76" />
          <stop offset="1" stopColor="#fa233b" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <path
        d="M42.5 13.6 25.4 17.2a1.6 1.6 0 0 0-1.3 1.6v20.4a6.4 6.4 0 1 0 3.2 5.5V27l13.6-2.9v11.6a6.4 6.4 0 1 0 3.2 5.5V15.2a1.6 1.6 0 0 0-1.6-1.6z"
        fill="#fff"
      />
    </svg>
  );
}

function ITunesTile({ size = 26 }: { size?: number }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="iTunes" className="shrink-0">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f45dff" />
          <stop offset="1" stopColor="#8a2be2" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id})`} />
      <path
        d="M32 13.5l5.4 11.4 12.5 1.6-9.2 8.6 2.4 12.4L32 41.4l-11.1 6.1 2.4-12.4-9.2-8.6 12.5-1.6z"
        fill="#fff"
      />
    </svg>
  );
}

export function SmartLinkPlatformIcon({ code, size = 26 }: { code: string; size?: number }) {
  switch (code) {
    case "spotify":
      return <ImageTile alt="Spotify" src="/landing/platforms/spotify-smart-link.jpg" size={size} />;
    case "apple_music":
      return <AppleMusicTile size={size} />;
    case "itunes":
      return <ITunesTile size={size} />;
    case "yandex_music":
      return <ImageTile alt="Яндекс Музыка" bg="#16161a" fit="contain" scale={0.78} src="/landing/platforms/yandex-music.png" size={size} />;
    case "vk_music":
      return <ImageTile alt="VK Музыка" src="/landing/platforms/vk-music.png" size={size} />;
    case "youtube_music":
      return <ImageTile alt="YouTube Music" bg="#ff0033" fit="contain" scale={1.12} src="/landing/platforms/youtube-music.png" size={size} />;
    case "soundcloud":
      return <ImageTile alt="SoundCloud" bg="#ffffff" fit="contain" scale={0.92} src="/landing/platforms/soundcloud.png" size={size} />;
    case "tidal":
      return <ImageTile alt="TIDAL" src="/landing/platforms/tidal.png" size={size} />;
    case "tiktok":
      return <ImageTile alt="TikTok" bg="#000000" fit="contain" scale={1.45} src="/landing/platforms/tiktok.webp" size={size} />;
    case "mts_music":
      return <ImageTile alt="МТС Музыка" src="/landing/platforms/mts-music.png" size={size} />;
    case "deezer":
      return <ImageTile alt="Deezer" bg="#000000" src="/landing/platforms/deezer.avif" size={size} />;
    case "amazon_music":
      return <ImageTile alt="Amazon Music" bg="#000000" src="/landing/platforms/amazon-music.png" size={size} />;
    case "zvuk_wink_music":
      return <ImageTile alt="Звук" src="/landing/platforms/zvuk-smart-link.jpg" size={size} />;
    case "odnoklassniki":
      return <ImageTile alt="Одноклассники" bg="#f7931e" fit="contain" scale={1.06} src="/landing/platforms/odnoklassniki.webp" size={size} />;
    case "anghami":
      return <ImageTile alt="Anghami" bg="#ffffff" fit="contain" scale={0.82} src="/landing/platforms/anghami.png" size={size} />;
    case "qobuz":
      return <ImageTile alt="Qobuz" bg="#ffffff" fit="contain" scale={0.8} src="/landing/platforms/qobuz.svg" size={size} />;
    case "pandora":
      return <ImageTile alt="Pandora" bg="#ffffff" fit="contain" scale={1.12} src="/landing/platforms/pandora.png" size={size} />;
    case "kkbox":
      return <ImageTile alt="KKBOX" bg="#0aa6e8" src="/landing/platforms/kkbox.png" size={size} />;
    case "jiosaavn":
      return <ImageTile alt="JioSaavn" bg="#2bc5b4" fit="contain" scale={1.04} src="/landing/platforms/jiosaavn.png" size={size} />;
    case "netease":
      return <ImageTile alt="Netease Cloud Music" bg="#e60026" fit="contain" scale={1.1} src="/landing/platforms/netease-cloud-music.png" size={size} />;
    case "line_music_rythm":
      return <ImageTile alt="LINE MUSIC" src="/landing/platforms/line-music.png" size={size} />;
    case "iheart":
      return <ImageTile alt="iHeartRadio" bg="#ffffff" src="/landing/platforms/iheartradio.webp" size={size} />;
    case "awa":
      return <ImageTile alt="AWA" bg="#ffffff" fit="contain" scale={0.8} src="/landing/platforms/awa.png" size={size} />;
    case "trebel":
      return <ImageTile alt="TREBEL" src="/landing/platforms/trebel.png" size={size} />;
    default:
      return <Glyph label={code.slice(0, 2)} size={size} />;
  }
}
