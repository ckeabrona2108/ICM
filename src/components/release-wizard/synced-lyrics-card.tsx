"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowUpRight, Check, Loader2, Mic2, Upload, X } from "lucide-react";

import { writeKaraokeHandoff, type KaraokeHandoff } from "@/components/karaoke/karaoke-handoff";
import { cn } from "@/lib/utils";

import { useExtrasIncludedInPlan } from "./use-extras-included";

/** Illustration only: a demo track, the same for every release. */
const DEMO_TRACK = {
  title: "Влюбить тебя",
  artist: "ФЕНИКС",
  cover: "/wizard/synced-lyrics-demo-cover.jpg",
  lines: [
    "Москва",
    "Как же мне влюбить тебя в себя?",
    "У нас годовщина в середине ноября",
    "То как ты сияешь - никогда так не сияла"
  ]
} as const;

const LINE_MS = 2400;

/** A player screen where the lines light up one by one, the current one filling like karaoke. */
function SyncedLyricsIllustration({ className }: { className?: string }) {
  const [active, setActive] = React.useState(1);
  const [animate, setAnimate] = React.useState(false);

  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setAnimate(true);
    const timer = window.setInterval(() => setActive((value) => (value + 1) % DEMO_TRACK.lines.length), LINE_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      aria-hidden
      className={cn(
        "relative h-full overflow-hidden rounded-[18px]",
        className
      )}
      style={{
        background:
          "radial-gradient(120% 120% at 100% 0%, rgba(123,97,255,0.55), rgba(123,97,255,0.12) 45%, rgba(11,13,22,0.9) 75%)"
      }}
    >
      <div className="absolute -left-10 top-6 h-px w-[140%] rotate-[14deg] bg-white/15" />
      <div className="absolute -left-10 top-28 h-px w-[140%] -rotate-[9deg] bg-white/10" />

      <div className="absolute right-4 top-4 w-[292px] max-w-[calc(100%-2rem)] rounded-[16px] border border-white/10 bg-[#11131d]/95 p-3 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.9)]">
        <div className="flex items-center gap-2.5">
          <Image
            src={DEMO_TRACK.cover}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-[11.5px] font-semibold text-white">{DEMO_TRACK.title}</p>
            <p className="truncate text-[10px] text-white/45">{DEMO_TRACK.artist}</p>
          </div>
          <span className="ml-auto rounded-md border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold text-white/50">Тт</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {DEMO_TRACK.lines.map((line, index) => {
            const isActive = index === active;
            return (
              <p
                key={line}
                className={cn(
                  "relative truncate text-[11.5px] font-semibold leading-[17px] transition-colors duration-500",
                  isActive ? (animate ? "text-white/25" : "text-white") : index < active ? "text-white/40" : "text-white/20"
                )}
              >
                {line}
                {isActive && animate ? (
                  <span
                    key={`fill-${active}`}
                    className="absolute inset-0 overflow-hidden whitespace-nowrap text-white"
                    style={{ animation: `icm-karaoke-fill ${LINE_MS - 100}ms linear forwards` }}
                  >
                    {line}
                  </span>
                ) : null}
              </p>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-3 left-4 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] font-medium text-white/70 backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
        Строчки подсвечиваются в такт
      </div>
      <style>{"@keyframes icm-karaoke-fill { from { width: 0% } to { width: 100% } }"}</style>
    </div>
  );
}

/** «Подробнее»: a small popover over the page, the card itself does not grow. */
function MoreInfo() {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="font-medium text-[#c4b5fd] underline-offset-2 hover:underline"
      >
        Подробнее
      </button>
      {open ? (
        <span
          role="dialog"
          aria-label="Что такое синхронизированный текст"
          className="absolute left-0 top-full z-40 mt-2 block w-[min(340px,calc(100vw-3rem))] rounded-[14px] border border-white/10 bg-[#141622] p-4 pr-9 text-left text-[12px] font-normal leading-5 text-white/75 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.95)]"
        >
          <span aria-hidden className="absolute -top-[6px] left-6 h-3 w-3 rotate-45 border-l border-t border-white/10 bg-[#141622]" />
          <button
            type="button"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
            className="absolute right-3 top-3 text-white/40 transition hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span className="block">
            Этот формат часто называют «караоке»: каждая строчка показывается вместе с музыкой. Площадки
            принимают его в формате TTML.
          </span>
          <span className="mt-2 block">
            Делать файл вручную не нужно: в нашем редакторе вы слушаете трек и нажимаете пробел на каждой
            строчке, а TTML собирается сам. Готовый файл загрузите сюда.
          </span>
        </span>
      ) : null}
    </span>
  );
}

/** Shown only to subscribers whose plan includes karaoke; nobody else sees a price here. */
function PriceBadge() {
  const included = useExtrasIncludedInPlan();
  if (!included) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-200">
      <Check className="h-3 w-3" strokeWidth={2.5} />
      Входит в ваш тариф
    </span>
  );
}

/**
 * Synced (karaoke, TTML) lyrics of a track: made in our free karaoke editor with this track's
 * text, or uploaded as a ready .ttml file.
 */
export function SyncedLyricsCard({
  fileName,
  uploading,
  handoff,
  onUpload,
  onRemove
}: {
  fileName: string | null;
  uploading: boolean;
  /** This track's title and text: the editor opens with them filled in. */
  handoff: KaraokeHandoff;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  // The track form is narrow next to the sidebar: two columns only when the card itself is wide.
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= 640));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const hasLyrics = Boolean(handoff.lyrics?.trim());

  return (
    <div ref={cardRef} className="rounded-[22px] border border-white/[0.08] bg-white/[0.03]">
      <div className={cn("grid", wide ? "grid-cols-[1.15fr_1fr]" : "grid-cols-1")}>
        <div className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] border border-[#7b61ff]/30 bg-[#7b61ff]/15 text-[#c4b5fd]">
              <Mic2 className="h-4 w-4" strokeWidth={2} />
            </span>
            <h4 className="text-[15px] font-semibold text-white">Синхронизированный текст</h4>
            <PriceBadge />
          </div>

          <p className="mt-3 text-[12.5px] leading-5 text-white/65">
            Караоке-текст: строчки подсвечиваются вместе с музыкой в Яндекс Музыке, VK Музыке и Apple Music.
            Слушатели могут подпевать прямо в приложении. <MoreInfo />
          </p>

          {fileName ? (
            <div className="mt-4 flex items-center gap-2 rounded-[12px] border border-emerald-300/20 bg-emerald-400/[0.07] px-3 py-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-300" strokeWidth={2.5} />
              <span className="truncate text-[12px] font-medium text-emerald-100">{fileName}</span>
              <button
                type="button"
                onClick={onRemove}
                disabled={uploading}
                className="ml-auto shrink-0 text-[11.5px] font-medium text-white/50 transition hover:text-rose-200 disabled:opacity-50"
              >
                Удалить
              </button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {hasLyrics ? (
                  <a
                    href="/dashboard/karaoke"
                    target="_blank"
                    rel="noopener"
                    onClick={() => writeKaraokeHandoff(handoff)}
                    className="group inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#7b61ff] px-3.5 text-[12.5px] font-semibold text-white shadow-[0_14px_40px_-14px_rgba(123,97,255,0.9)] transition hover:bg-[#8b74ff]"
                  >
                    Сделать в нашем редакторе
                    <ArrowUpRight className="h-3.5 w-3.5 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </a>
                ) : (
                  <span className="inline-flex h-9 cursor-not-allowed items-center gap-1.5 rounded-[10px] bg-white/[0.08] px-3.5 text-[12.5px] font-semibold text-white/40">
                    Сделать в нашем редакторе
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-white/[0.14] px-3.5 text-[12.5px] font-semibold text-white/80 transition hover:border-white/25 hover:text-white disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" strokeWidth={2} />}
                  {uploading ? "Загружаем..." : "Загрузить .ttml"}
                </button>
              </div>
              <p className="mt-2.5 text-[11px] text-white/40">
                {hasLyrics
                  ? "Редактор бесплатный, текст этого трека подставится сам."
                  : "Сначала вставьте текст трека выше: редактор разметит его по времени."}
              </p>
            </>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".ttml"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
        </div>
        <div className={wide ? "flex flex-col p-2 [&>*]:flex-1" : "px-2 pb-2"}>
          <SyncedLyricsIllustration className={wide ? "min-h-[232px]" : "min-h-[212px]"} />
        </div>
      </div>
    </div>
  );
}
