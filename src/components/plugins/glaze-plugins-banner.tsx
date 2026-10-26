"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, X } from "lucide-react";

const DISMISS_KEY = "icm:glaze-plugins-banner-dismissed";

export function GlazePluginsBanner() {
  // Пока не прочитали localStorage, баннер не показываем — иначе у закрывших он мигнёт.
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(DISMISS_KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // без localStorage баннер просто вернётся после перезагрузки
    }
  };

  if (!visible) return null;

  return (
    <div className="relative">
      <Link
        href="/dashboard/plugins"
        className="group relative flex flex-col overflow-hidden rounded-[28px] border border-[#3b82f6]/20 bg-[linear-gradient(120deg,rgba(10,16,34,0.96),rgba(12,13,22,0.94))] shadow-[0_24px_80px_-50px_rgba(59,130,246,0.7)] transition-colors hover:border-[#3b82f6]/40 sm:flex-row sm:items-center"
      >
        <div className="relative aspect-[16/9] w-full shrink-0 overflow-hidden sm:aspect-auto sm:h-40 sm:w-72">
          <Image
            src="/plugins/glaze-vocal.webp"
            alt="GLAZE Vocal"
            fill
            sizes="(min-width: 640px) 288px, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
        </div>
        <div className="flex flex-1 flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pr-14">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#93c5fd]">
              Новинка · GLAZE Plugins
            </p>
            <p className="mt-2 text-[20px] font-semibold tracking-tight text-white">
              GLAZE Vocal и GLAZE Downloader
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-white/60">
              Вокал одной ручкой и биты с YouTube прямо в DAW. VST3/AU для macOS и Windows.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-[linear-gradient(90deg,#2563eb,#6d5dfc)] px-5 py-3 text-[14px] font-semibold text-white sm:self-auto">
            Смотреть
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Закрыть рекламу"
        title="Закрыть"
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/50 text-white/60 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
