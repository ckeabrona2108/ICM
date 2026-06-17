"use client";

import * as React from "react";
import { Download, Minus, Pause, Play, Plus, Square } from "lucide-react";

import { cn } from "@/lib/utils";

import { KaraokeLyricsGuidelines } from "./lyrics-karaoke-guidelines";
import type { SyncedLine } from "./wizard-context";

function splitLyricLines(lyrics: string): string[] {
  return lyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatTtmlSeconds(sec: number): string {
  return `${Math.max(0, sec).toFixed(3)}s`;
}

/** Отображение как в караоке-плеерах: MM:SS:hh (минуты : секунды : сотые) */
function formatKaraokeClock(sec: number): string {
  const t = Math.max(0, sec);
  const hundredths = Math.floor(t * 100);
  const cs = hundredths % 100;
  const totalSec = Math.floor(hundredths / 100);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(m)}:${pad(s)}:${pad(cs)}`;
}

function metadataToXmlLang(lang: string): string {
  const map: Record<string, string> = {
    Русский: "ru",
    English: "en",
    Українська: "uk",
    Қазақша: "kk",
    Español: "es",
    Deutsch: "de",
    Français: "fr",
    Italiano: "it",
    Português: "pt",
    中文: "zh",
    日本語: "ja",
    한국어: "ko",
    العربية: "ar",
    Türkçe: "tr",
    Беларуская: "be",
    Hindi: "hi",
    Инструментал: "zxx",
    "Без слов": "zxx"
  };
  return map[lang] || "ru";
}

export function buildTtmlDocument(lines: SyncedLine[], xmlLang: string): string {
  const paragraphs = lines
    .map((line, i) => {
      const b = formatTtmlSeconds(line.begin);
      const e = formatTtmlSeconds(line.end);
      return `      <p xml:id="L${i}" begin="${b}" end="${e}">${escapeXml(line.text)}</p>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:tts="http://www.w3.org/ns/ttml#styling" xml:lang="${escapeXml(xmlLang)}">
  <head>
    <layout>
      <region xml:id="karaoke" tts:origin="4% 78%" tts:extent="92% 18%" tts:displayAlign="center" tts:textAlign="center"/>
    </layout>
  </head>
  <body>
    <div region="karaoke">
${paragraphs}
    </div>
  </body>
</tt>`;
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

const WORKFLOW_SHORT = [
  "Метаданные релиза — во вкладке слева; здесь — текст построчно, как в ЛКПО.",
  "Play → удерживайте Пробел на время строки, отпустите в конце; повторите для всех строк.",
  "Скачайте .ttml и прикрепите в «Синхронизированный текст»; при доработке отгрузки — комментарий модератору."
];

async function decodePeaks(url: string, barCount: number): Promise<number[] | null> {
  const ctx = new AudioContext();
  try {
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    const buf = await ctx.decodeAudioData(ab.slice(0));
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / barCount));
    const peaks: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const start = i * step;
      let m = 0;
      for (let j = 0; j < step && start + j < data.length; j++) {
        m = Math.max(m, Math.abs(data[start + j]!));
      }
      peaks.push(m);
    }
    return peaks;
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

function WaveformBlock({
  url,
  currentTime,
  duration,
  zoom,
  onZoomChange
}: {
  url: string;
  currentTime: number;
  duration: number;
  zoom: number;
  onZoomChange: (z: number) => void;
}) {
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(400);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);

  React.useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const bars = Math.min(2400, Math.max(400, Math.floor(width * zoom)));
    (async () => {
      const p = await decodePeaks(url, bars);
      if (!cancelled) setPeaks(p);
    })();
    return () => {
      cancelled = true;
    };
  }, [url, width, zoom]);

  const innerW = Math.max(width, Math.floor(width * zoom));
  const playX = duration > 0 ? (currentTime / duration) * innerW : 0;

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || duration <= 0) return;
    const viewW = el.clientWidth;
    const target = playX - viewW * 0.35;
    el.scrollLeft = Math.max(0, Math.min(target, innerW - viewW));
  }, [currentTime, duration, innerW, playX]);

  const waveH = 48;
  return (
    <div className="rounded-md border border-white/[0.1] bg-white/[0.04] p-1.5">
      <div className="mb-1 flex items-center justify-between gap-2 text-[10px] tabular-nums text-white/50">
        <span>
          {formatKaraokeClock(currentTime)} / {duration > 0 ? formatKaraokeClock(duration) : "00:00:00"}
        </span>
        <div className="flex items-center gap-1 text-white/40">
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded border border-white/10 hover:bg-white/[0.06]"
            onClick={() => onZoomChange(Math.max(1, zoom - 0.35))}
            aria-label="Уменьшить масштаб"
          >
            <Minus className="h-3 w-3" />
          </button>
          <input
            type="range"
            min={1}
            max={4}
            step={0.05}
            value={zoom}
            onChange={(e) => onZoomChange(Number(e.target.value))}
            className="h-1 w-16 cursor-pointer accent-[#2dd4bf]"
            aria-label="Масштаб волны"
          />
          <button
            type="button"
            className="grid h-6 w-6 place-items-center rounded border border-white/10 hover:bg-white/[0.06]"
            onClick={() => onZoomChange(Math.min(4, zoom + 0.35))}
            aria-label="Увеличить масштаб"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div
        ref={wrapRef}
        className="relative h-[58px] overflow-x-auto overflow-y-hidden rounded border border-white/[0.08] bg-[#0f1014]"
      >
        {peaks && peaks.length > 0 ? (
          <svg width={innerW} height={waveH} className="block" role="img" aria-label="Форма волны трека">
            {peaks.map((h, i) => {
              const x = (i / peaks.length) * innerW;
              const barW = Math.max(1, innerW / peaks.length - 0.5);
              const hh = Math.max(2, h * (waveH - 8));
              return (
                <rect
                  key={i}
                  x={x}
                  y={(waveH - hh) / 2}
                  width={barW}
                  height={hh}
                  fill="rgba(255,255,255,0.2)"
                  rx={0.5}
                />
              );
            })}
            {duration > 0 ? (
              <line
                x1={playX}
                y1={0}
                x2={playX}
                y2={waveH}
                stroke="#14b8a6"
                strokeOpacity={0.95}
                strokeWidth={2}
              />
            ) : null}
          </svg>
        ) : (
          <div className="flex h-[48px] items-center justify-center text-[10px] text-white/35">
            {peaks === null ? "Волна…" : "Нет волны"}
          </div>
        )}
      </div>
    </div>
  );
}

export function LyricsTtmlSyncPanel({
  lyrics,
  syncedLyrics: syncedLyricsProp,
  onAppendLine,
  onSetLines,
  audioUrl,
  exportBaseName,
  metadataLanguage,
  releaseTitle,
  performersLabel,
  trackTitle
}: {
  lyrics: string;
  syncedLyrics?: SyncedLine[] | null;
  onAppendLine: (line: SyncedLine) => void;
  onSetLines: (lines: SyncedLine[]) => void;
  audioUrl?: string;
  exportBaseName: string;
  metadataLanguage: string;
  /** Название релиза из мастера (подсказка) */
  releaseTitle?: string;
  /** Исполнители из мастера релиза (подсказка) */
  performersLabel?: string;
  /** Название трека из меты (как на площадке) */
  trackTitle?: string;
}) {
  const syncedLyrics = syncedLyricsProp ?? [];
  const [localAudioUrl, setLocalAudioUrl] = React.useState<string | null>(null);
  const [isHoldingSpace, setIsHoldingSpace] = React.useState(false);
  const [zoom, setZoom] = React.useState(1.4);
  const [tick, setTick] = React.useState(0);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const holdStartRef = React.useRef<number | null>(null);
  const spaceDownRef = React.useRef(false);

  const lyricLines = React.useMemo(() => splitLyricLines(lyrics), [lyrics]);
  const effectiveUrl = audioUrl || localAudioUrl;
  const nextIndex = syncedLyrics.length;
  const complete = lyricLines.length > 0 && syncedLyrics.length === lyricLines.length;
  const mismatch =
    syncedLyrics.length > 0 &&
    syncedLyrics.some((s, i) => lyricLines[i] !== undefined && s.text !== lyricLines[i]);

  const audio = audioRef.current;
  const currentTime = audio?.currentTime ?? 0;
  const duration = audio?.duration && Number.isFinite(audio.duration) ? audio.duration : 0;

  React.useEffect(() => {
    return () => {
      if (localAudioUrl?.startsWith("blob:")) URL.revokeObjectURL(localAudioUrl);
    };
  }, [localAudioUrl]);

  const bump = React.useCallback(() => setTick((n) => n + 1), []);

  const onLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (localAudioUrl?.startsWith("blob:")) URL.revokeObjectURL(localAudioUrl);
    setLocalAudioUrl(URL.createObjectURL(f));
    e.target.value = "";
  };

  const finishSpaceHold = React.useCallback(() => {
    const el = audioRef.current;
    if (!el || holdStartRef.current == null) return;
    const begin = holdStartRef.current;
    const end = el.currentTime;
    holdStartRef.current = null;
    setIsHoldingSpace(false);
    const idx = syncedLyrics.length;
    if (idx >= lyricLines.length) return;
    if (end < begin + 0.04) return;
    const text = lyricLines[idx];
    onAppendLine({ begin, end, text });
    bump();
  }, [bump, lyricLines, onAppendLine, syncedLyrics.length]);

  const startSpaceHold = React.useCallback(() => {
    const el = audioRef.current;
    if (!el || complete || syncedLyrics.length >= lyricLines.length) return;
    if (el.paused) return;
    holdStartRef.current = el.currentTime;
    setIsHoldingSpace(true);
  }, [complete, lyricLines.length, syncedLyrics.length]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (!effectiveUrl || complete || syncedLyrics.length >= lyricLines.length) return;
      const el = audioRef.current;
      if (!el || el.paused || e.repeat) return;
      e.preventDefault();
      if (spaceDownRef.current) return;
      spaceDownRef.current = true;
      startSpaceHold();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (!spaceDownRef.current) return;
      spaceDownRef.current = false;
      e.preventDefault();
      finishSpaceHold();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [complete, effectiveUrl, finishSpaceHold, lyricLines.length, startSpaceHold, syncedLyrics.length]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el || !effectiveUrl) return;
    if (el.paused) void el.play().then(bump);
    else {
      el.pause();
      bump();
    }
  };

  const stopTrack = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    bump();
  };

  const onDownload = () => {
    if (syncedLyrics.length === 0) return;
    const lang = metadataToXmlLang(metadataLanguage || "Русский");
    const xml = buildTtmlDocument(syncedLyrics, lang);
    const safe = (exportBaseName || "lyrics").replace(/[^\w\u0400-\u04FF\u0500-\u052F\-]+/g, "_").slice(0, 80);
    downloadText(`${safe || "lyrics"}.ttml`, xml, "application/ttml+xml");
  };

  const resetLine = () => {
    if (syncedLyrics.length === 0) return;
    onSetLines(syncedLyrics.slice(0, -1));
  };

  const resetAll = () => onSetLines([]);

  const hintLine = [performersLabel, trackTitle, releaseTitle].filter(Boolean).join(" · ");

  return (
    <div className="rounded-lg border border-white/[0.12] bg-[#14151a] p-2.5 shadow-sm space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="text-[12px] font-semibold text-white">Синхронизация (TTML)</h4>
          <p className="mt-0.5 text-[10px] text-white/45">
            <kbd className="rounded border border-white/15 bg-white/[0.06] px-1 font-mono text-[9px]">Play</kbd>{" "}
            и удерживайте{" "}
            <kbd className="rounded border border-white/15 bg-white/[0.06] px-1 font-mono text-[9px]">Пробел</kbd>{" "}
            на время строки.
          </p>
        </div>
        <details className="text-[10px] text-white/40 [&_summary]:cursor-pointer [&_summary]:list-none [&_summary::-webkit-details-marker]:hidden">
          <summary className="rounded border border-white/10 px-2 py-1 hover:bg-white/[0.04]">Справка</summary>
          <div className="mt-1 max-h-36 overflow-y-auto rounded border border-white/[0.06] bg-black/30 p-2 text-white/50">
            <ol className="mb-2 list-decimal space-y-1 pl-3.5">
              {WORKFLOW_SHORT.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <KaraokeLyricsGuidelines compact />
          </div>
        </details>
      </div>

      {hintLine ? (
        <p className="line-clamp-2 text-[10px] leading-snug text-white/40" title={hintLine}>
          {hintLine}
        </p>
      ) : null}

      {!audioUrl ? (
        <div className="flex flex-wrap items-center gap-2 rounded border border-dashed border-white/[0.1] bg-black/25 px-2 py-1.5">
          <span className="text-[10px] text-white/45">Нет файла с шага треков:</span>
          <label className="cursor-pointer rounded bg-white/[0.08] px-2 py-1 text-[10px] text-white/85 hover:bg-white/[0.12]">
            <input type="file" accept=".wav,.flac,audio/wav,audio/x-wav,audio/flac" className="sr-only" onChange={onLocalFile} />
            MP3 / WAV
          </label>
        </div>
      ) : null}

      {effectiveUrl ? (
        <audio
          ref={audioRef}
          src={effectiveUrl}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={bump}
          onTimeUpdate={bump}
          onEnded={bump}
          onPlay={bump}
          onPause={bump}
        />
      ) : null}

      {mismatch ? (
        <p className="rounded border border-amber-500/25 bg-amber-500/[0.08] px-2 py-1 text-[10px] text-amber-100/90">
          Текст изменён.{" "}
          <button type="button" onClick={resetAll} className="underline hover:text-white">
            Сбросить
          </button>
        </p>
      ) : null}

      {effectiveUrl && lyricLines.length > 0 ? (
        <WaveformBlock
          url={effectiveUrl}
          currentTime={currentTime}
          duration={duration}
          zoom={zoom}
          onZoomChange={setZoom}
        />
      ) : null}

      {lyricLines.length === 0 ? (
        <p className="text-[10px] text-[#ff5d6d]/85">Введите текст выше — по строке на куплет.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={!effectiveUrl}
              onClick={togglePlay}
              className="grid h-9 w-9 place-items-center rounded border-2 border-teal-500/55 bg-[#1a1f24] text-teal-400 transition-colors hover:bg-teal-500/10 disabled:opacity-35"
              title={audio?.paused !== false ? "Play" : "Pause"}
            >
              {audio?.paused !== false ? <Play className="h-3.5 w-3.5 fill-current" /> : <Pause className="h-3.5 w-3.5 fill-current" />}
            </button>
            <button
              type="button"
              disabled={!effectiveUrl}
              onClick={stopTrack}
              className="grid h-9 w-9 place-items-center rounded border-2 border-teal-500/55 bg-[#1a1f24] text-teal-400 transition-colors hover:bg-teal-500/10 disabled:opacity-35"
              title="Стоп"
            >
              <Square className="h-3 w-3 fill-current" />
            </button>
            <button
              type="button"
              disabled={syncedLyrics.length === 0}
              onClick={resetLine}
              className="rounded border border-white/[0.1] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/65 transition-colors hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-35"
            >
              Сбросить строку
            </button>
            <button
              type="button"
              disabled={syncedLyrics.length === 0}
              onClick={resetAll}
              className={cn(
                "rounded px-2.5 py-1.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                syncedLyrics.length > 0
                  ? "border border-teal-500/50 text-teal-300/95 hover:bg-teal-500/10"
                  : "border border-white/[0.08] text-white/45"
              )}
            >
              Сбросить все
            </button>
            <button
              type="button"
              disabled={syncedLyrics.length === 0}
              onClick={onDownload}
              className="ml-auto grid h-9 w-9 place-items-center rounded border border-white/[0.1] text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white/85 disabled:opacity-35"
              title="Скачать .ttml"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-[min(220px,38vh)] overflow-auto rounded border border-white/[0.08]">
            <table className="w-full min-w-[280px] border-collapse text-left text-[11px]">
              <thead className="sticky top-0 z-[1] bg-[#1c1d24] shadow-[0_1px_0_rgba(255,255,255,0.06)]">
                <tr className="text-[10px] uppercase tracking-wide text-white/40">
                  <th className="px-2 py-1.5 font-medium">Старт</th>
                  <th className="px-2 py-1.5 font-medium">Конец</th>
                  <th className="px-2 py-1.5 font-medium">Текст</th>
                </tr>
              </thead>
              <tbody>
                {lyricLines.map((line, i) => {
                  const synced = syncedLyrics[i];
                  const isCurrent = !complete && i === nextIndex;
                  return (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-white/[0.04] transition-colors",
                        i % 2 === 1 && "bg-white/[0.02]",
                        synced && "bg-emerald-500/[0.05]",
                        isCurrent && "bg-white/[0.05]",
                        isCurrent && isHoldingSpace && "lyric-line-recording"
                      )}
                    >
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums text-white/55">
                        {synced ? formatKaraokeClock(synced.begin) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums text-white/55">
                        {synced ? formatKaraokeClock(synced.end) : "—"}
                      </td>
                      <td className={cn("px-2 py-1 text-white/80", isCurrent && "font-medium text-white")}>{line}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-white/35">
            {complete ? lyricLines.length : nextIndex + 1}/{lyricLines.length}
            {complete ? " · готово" : !audio?.paused ? " · Пробел" : ""}
          </p>
        </>
      )}
      {/* tick ref forces re-read of audio times */}
      <span className="sr-only" aria-hidden>
        {tick}
      </span>
    </div>
  );
}
