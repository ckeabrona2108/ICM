"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronRight, Share } from "lucide-react";

import {
  AppleMusicLogo,
  SpotifyLogo,
  VkMusicLogo,
  YandexMusicLogo,
  YouTubeMusicLogo
} from "@/components/landing/platform-logos";

const TEAL = "border-teal-500/55";

interface Row {
  name: string;
  href: string;
  Logo: React.ComponentType<{ size?: number }>;
}

const ROWS: Row[] = [
  { name: "Яндекс Музыка", href: "https://music.yandex.ru/", Logo: YandexMusicLogo },
  { name: "КИОН Музыка", href: "https://kion.ru/music", Logo: KionMusicGlyph },
  { name: "Spotify", href: "https://open.spotify.com/", Logo: SpotifyLogo },
  { name: "Apple Music", href: "https://music.apple.com/", Logo: AppleMusicLogo },
  { name: "VK Музыка", href: "https://vk.com/audio", Logo: VkMusicLogo },
  { name: "YouTube Music", href: "https://music.youtube.com/", Logo: YouTubeMusicLogo }
];

function KionMusicGlyph({ size = 24 }: { size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded bg-black text-[10px] font-bold text-white"
      style={{ width: size, height: size }}
    >
      K
    </div>
  );
}

export function PromoLanding({
  cover,
  title,
  artist
}: {
  cover: string;
  title: string;
  artist: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const share = () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <main className="min-h-screen bg-[#e4e4e8] px-4 py-10">
      <article className="mx-auto w-full max-w-[380px] overflow-hidden rounded-xl border border-black/[0.12] bg-white shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]">
        <div className="relative aspect-[4/3] w-full bg-neutral-200">
          <Image src={cover} alt="" fill className="object-cover" sizes="380px" priority />
        </div>

        <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] bg-white px-4 py-4">
          <div className="min-w-0">
            <h1 className="text-[22px] font-bold leading-tight tracking-tight text-neutral-900">
              {title}
            </h1>
            <p className="mt-1 text-[15px] text-neutral-500">{artist}</p>
          </div>
          <button
            type="button"
            onClick={share}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-neutral-200 text-neutral-600 transition-colors hover:border-teal-500/40 hover:bg-teal-500/[0.06] hover:text-teal-700"
            aria-label="Скопировать ссылку"
            title="Скопировать ссылку"
          >
            <Share className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        {copied ? (
          <p className="border-b border-teal-500/20 bg-teal-500/10 px-4 py-2 text-center text-[12px] text-teal-800">
            Ссылка скопирована
          </p>
        ) : null}

        <div className="space-y-2.5 bg-white p-4 pb-6">
          {ROWS.map((row) => {
            const Logo = row.Logo;
            return (
              <a
                key={row.name}
                href={row.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-3 rounded-lg border ${TEAL} bg-white px-3.5 py-3 transition-colors hover:bg-teal-500/[0.04]`}
              >
                <Logo size={26} />
                <span className="min-w-0 flex-1 text-left text-[14px] font-medium text-neutral-800">
                  {row.name}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={2} />
              </a>
            );
          })}
        </div>
      </article>

      <p className="mx-auto mt-6 max-w-[380px] text-center text-[11px] text-neutral-500">
        Промо-страница ICECREAMMUSIC · слушайте на любимых площадках
      </p>
    </main>
  );
}
