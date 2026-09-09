"use client";

import Image from "next/image";
import * as React from "react";
import { Search, X } from "lucide-react";

type ReleaseSearchControlProps = {
  title: string;
  artist: string;
  compact?: boolean;
};

function buildSearchUrl(platform: "yandex" | "vk", artist: string, title: string) {
  const query = encodeURIComponent(`${artist} ${title}`.trim());
  return platform === "yandex"
    ? `https://music.yandex.ru/search?text=${query}`
    : `https://vk.com/audio?q=${query}`;
}

export function ReleaseSearchControl({ title, artist, compact = false }: ReleaseSearchControlProps) {
  const [open, setOpen] = React.useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] font-semibold text-white/68 transition hover:border-[#7b61ff]/45 hover:text-white ${compact ? "px-3 py-2 text-xs" : "px-5 py-3 text-sm"}`}
      >
        <Search className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        Найти релиз
      </button>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${compact ? "w-full" : "flex-wrap"}`}>
      <a
        href={buildSearchUrl("yandex", artist, title)}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] font-semibold text-white/78 transition hover:border-[#7b61ff]/45 hover:text-white ${compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"}`}
      >
        <Image src="/landing/platforms/yandex-music.png" alt="" width={18} height={18} className="h-4 w-4 rounded" />
        Яндекс
      </a>
      <a
        href={buildSearchUrl("vk", artist, title)}
        target="_blank"
        rel="noreferrer"
        className={`inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.04] font-semibold text-white/78 transition hover:border-[#7b61ff]/45 hover:text-white ${compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm"}`}
      >
        <Image src="/landing/platforms/vk-music.png" alt="" width={18} height={18} className="h-4 w-4 rounded" />
        VK
      </a>
      <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-white/38 transition hover:bg-white/[0.05] hover:text-white" aria-label="Скрыть площадки">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
