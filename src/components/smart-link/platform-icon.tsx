"use client";

import * as React from "react";

function Glyph({
  label,
  size = 26,
  className = "bg-white/[0.08] text-white/78"
}: {
  label: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-lg text-[10px] font-semibold uppercase ${className}`}
      style={{ width: size, height: size }}
    >
      {label}
    </div>
  );
}

function ImageTile({
  size = 26,
  bg = "transparent",
  src,
  alt,
  imageClassName = "h-full w-full object-contain scale-[1.18]"
}: {
  size?: number;
  bg?: string;
  src: string;
  alt: string;
  imageClassName?: string;
}) {
  return (
    <div
      className="grid shrink-0 place-items-center overflow-hidden rounded-lg"
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      <img
        alt={alt}
        className={`block ${imageClassName}`}
        draggable={false}
        loading="lazy"
        src={src}
      />
    </div>
  );
}

export function SmartLinkPlatformIcon({
  code,
  size = 26
}: {
  code: string;
  size?: number;
}) {
  switch (code) {
    case "spotify":
      return <ImageTile alt="Spotify" src="/landing/platforms/spotify-smart-link.jpg" size={size} />;
    case "apple_music":
      return <ImageTile alt="Apple Music" src="/landing/platforms/apple-music.png" size={size} />;
    case "itunes":
      return (
        <ImageTile
          alt="iTunes"
          bg="#ffffff"
          imageClassName="max-h-[92%] max-w-[92%] object-contain scale-[1.1]"
          src="/landing/platforms/itunes.png"
          size={size}
        />
      );
    case "yandex_music":
      return <ImageTile alt="Яндекс Музыка" src="/landing/platforms/yandex-music.png" size={size} />;
    case "vk_music":
      return <ImageTile alt="VK Музыка" src="/landing/platforms/vk-music.png" size={size} />;
    case "youtube_music":
      return <ImageTile alt="YouTube Music" src="/landing/platforms/youtube-music.png" size={size} />;
    case "soundcloud":
      return <ImageTile alt="SoundCloud" src="/landing/platforms/soundcloud.png" size={size} />;
    case "tidal":
      return <ImageTile alt="TIDAL" src="/landing/platforms/tidal.png" size={size} />;
    case "tiktok":
      return <ImageTile alt="TikTok" src="/landing/platforms/tiktok.webp" size={size} />;
    case "mts_music":
      return <ImageTile alt="МТС Музыка" src="/landing/platforms/mts-music.png" size={size} />;
    case "deezer":
      return <ImageTile alt="Deezer" src="/landing/platforms/deezer.avif" size={size} />;
    case "amazon_music":
      return <ImageTile alt="Amazon Music" src="/landing/platforms/amazon-music.png" size={size} />;
    case "zvuk_wink_music":
      return <ImageTile alt="Звук" src="/landing/platforms/zvuk-smart-link.jpg" size={size} />;
    case "odnoklassniki":
      return (
        <ImageTile
          alt="Одноклассники"
          imageClassName="max-h-[94%] max-w-[94%] object-contain object-center"
          src="/landing/platforms/odnoklassniki.webp"
          size={size}
        />
      );
    case "anghami":
      return <ImageTile alt="Anghami" bg="#ffffff" src="/landing/platforms/anghami.png" size={size} />;
    case "qobuz":
      return <ImageTile alt="Qobuz" bg="#ffffff" src="/landing/platforms/qobuz.svg" size={size} />;
    case "pandora":
      return <ImageTile alt="Pandora" src="/landing/platforms/pandora.png" size={size} />;
    case "kkbox":
      return <ImageTile alt="KKBOX" src="/landing/platforms/kkbox.png" size={size} />;
    case "jiosaavn":
      return <ImageTile alt="JioSaavn" src="/landing/platforms/jiosaavn.png" size={size} />;
    case "netease":
      return <ImageTile alt="Netease Cloud Music" src="/landing/platforms/netease-cloud-music.png" size={size} />;
    case "line_music_rythm":
      return <ImageTile alt="LINE MUSIC" src="/landing/platforms/line-music.png" size={size} />;
    case "iheart":
      return <ImageTile alt="iHeartRadio" src="/landing/platforms/iheartradio.webp" size={size} />;
    case "awa":
      return <ImageTile alt="AWA" bg="#ffffff" src="/landing/platforms/awa.png" size={size} />;
    case "trebel":
      return <ImageTile alt="TREBEL" src="/landing/platforms/trebel.png" size={size} />;
    default:
      return <Glyph label={code.slice(0, 2)} size={size} />;
  }
}
