"use client";

import { useEffect } from "react";

export default function FeedError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[feed] render failed", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-3xl rounded-[32px] border border-white/10 bg-[#12111b] p-8 text-white">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#c8b7ff]">Сообщество</p>
      <h1 className="mt-3 text-3xl font-bold">Не удалось открыть ленту</h1>
      <p className="mt-3 text-sm leading-relaxed text-white/64">Сегмент /feed упал во время рендера. Можно перезагрузить только этот экран без полного refresh страницы.</p>
      <button type="button" onClick={() => reset()} className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-[#7b61ff] px-6 text-sm font-semibold text-white">Повторить</button>
    </div>
  );
}
