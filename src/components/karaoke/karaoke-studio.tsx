"use client";

import * as React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  FileAudio,
  HelpCircle,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Undo2,
  Upload,
  X
} from "lucide-react";

import { LANGUAGES } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { KaraokeLyricsGuidelines } from "@/components/release-wizard/lyrics-karaoke-guidelines";
import {
  buildTtmlDocument,
  formatKaraokeClock,
  metadataToXmlLang
} from "@/components/release-wizard/lyrics-ttml-sync";
import type { SyncedLine } from "@/components/release-wizard/wizard-context";

import { takeKaraokeHandoff } from "./karaoke-handoff";

const STORAGE_KEY = "icm-karaoke-project-v1";
const MAX_AUDIO_BYTES = 150 * 1024 * 1024;
const AUDIO_ACCEPT = ".wav,.mp3,.flac,.m4a,audio/wav,audio/x-wav,audio/mpeg,audio/flac,audio/mp4";
const PEAK_COUNT = 4000;
const WAVE_HEIGHT = 120;

type SavedProject = {
  artist: string;
  title: string;
  language: string;
  lyrics: string;
  synced: SyncedLine[];
  audioName?: string;
};

const EMPTY_PROJECT: SavedProject = { artist: "", title: "", language: "Русский", lyrics: "", synced: [] };

function readSaved(): SavedProject | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedProject>;
    return { ...EMPTY_PROJECT, ...parsed, synced: Array.isArray(parsed.synced) ? parsed.synced : [] };
  } catch {
    return null;
  }
}

function splitLyricLines(lyrics: string): string[] {
  return lyrics
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function formatClock(sec: number): string {
  const t = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function downloadText(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

async function decodePeaks(file: File): Promise<number[] | null> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    const data = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / PEAK_COUNT));
    const peaks: number[] = [];
    let max = 0;
    for (let i = 0; i < PEAK_COUNT; i++) {
      let m = 0;
      for (let j = i * step; j < (i + 1) * step && j < data.length; j += 4) m = Math.max(m, Math.abs(data[j]!));
      peaks.push(m);
      max = Math.max(max, m);
    }
    return max > 0 ? peaks.map((p) => p / max) : peaks;
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** Шаг линейки: не чаще, чем раз в ~70px. */
function pickTickStep(pxPerSec: number): number {
  return [1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * pxPerSec >= 70) ?? 120;
}

const fieldClass =
  "block w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-4 text-[15px] text-white placeholder:text-white/30 transition-colors hover:border-white/[0.16] focus:border-[#7b61ff]/70 focus:bg-white/[0.05] focus:outline-none focus:ring-4 focus:ring-[#7b61ff]/15";

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "relative rounded-3xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] shadow-[0_30px_80px_-40px_rgba(123,97,255,0.45)] backdrop-blur-xl",
        "before:pointer-events-none before:absolute before:inset-x-10 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[#a78bfa]/50 before:to-transparent",
        className
      )}
    >
      {children}
    </div>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  const items = ["Трек и текст", "Синхронизация"];
  return (
    <div className="mb-6 flex items-center justify-center gap-3">
      {items.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <React.Fragment key={label}>
            {i > 0 ? (
              <span className={cn("h-px w-10 sm:w-16", done || active ? "bg-[#7b61ff]/60" : "bg-white/10")} />
            ) : null}
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-full text-[12px] font-semibold transition-colors",
                  active && "bg-[#7b61ff] text-white shadow-[0_0_0_4px_rgba(123,97,255,0.18)]",
                  done && "bg-[#7b61ff]/20 text-[#c4b5fd]",
                  !active && !done && "bg-white/[0.06] text-white/40"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              <span className={cn("text-[13px] font-medium", active ? "text-white" : "text-white/45")}>{label}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function AudioDropzone({
  file,
  restoredName,
  onFile,
  onClear
}: {
  file: File | null;
  restoredName?: string;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const accept = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("audio/") && !/\.(wav|mp3|flac|m4a)$/i.test(f.name)) {
      setError("Нужен аудиофайл: WAV, MP3, FLAC или M4A.");
      return;
    }
    if (f.size > MAX_AUDIO_BYTES) {
      setError("Файл больше 150 МБ.");
      return;
    }
    setError(null);
    onFile(f);
  };

  if (file) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-[#7b61ff]/25 bg-[#7b61ff]/[0.07] px-4 py-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#7b61ff] to-[#3b82f6] text-white shadow-[0_8px_24px_-8px_rgba(123,97,255,0.8)]">
          <FileAudio className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-white">{file.name}</p>
          <p className="text-[12px] text-white/45">{formatBytes(file.size)} · готов к синхронизации</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="grid h-9 w-9 place-items-center rounded-xl text-white/45 transition-colors hover:bg-white/[0.08] hover:text-white"
          aria-label="Убрать файл"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "group relative flex w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border border-dashed px-6 py-10 text-center transition-all duration-300",
          dragging
            ? "scale-[1.01] border-[#7b61ff] bg-[#7b61ff]/[0.12]"
            : "border-white/[0.14] bg-white/[0.02] hover:border-[#7b61ff]/50 hover:bg-[#7b61ff]/[0.05]"
        )}
      >
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(123,97,255,0.16),transparent_60%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <span className="relative grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-[#c4b5fd] transition-transform duration-300 group-hover:-translate-y-0.5">
          <Upload className="h-6 w-6" />
        </span>
        <span className="relative">
          <span className="block text-[15px] font-semibold text-white">Перетащите трек сюда или нажмите, чтобы выбрать</span>
          <span className="mt-1 block text-[12px] text-white/40">WAV, MP3, FLAC · до 150 МБ</span>
          {restoredName ? (
            <span className="mt-3 inline-block rounded-full bg-amber-400/10 px-3 py-1 text-[12px] text-amber-200/90">
              Прикрепите «{restoredName}» снова — аудио не хранится между визитами
            </span>
          ) : null}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={AUDIO_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {error ? <p className="mt-2 text-[12px] text-[#ff5d6d]">{error}</p> : null}
    </div>
  );
}

function Waveform({
  peaks,
  time,
  duration,
  zoom,
  onSeek,
  marks
}: {
  peaks: number[] | null;
  time: number;
  duration: number;
  zoom: number;
  onSeek: (sec: number) => void;
  marks: SyncedLine[];
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [viewW, setViewW] = React.useState(800);

  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(Math.max(240, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const innerW = Math.floor(viewW * zoom);
  const playX = duration > 0 ? (time / duration) * innerW : 0;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = innerW * dpr;
    canvas.height = WAVE_HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, innerW, WAVE_HEIGHT);
    const bar = 3;
    const gap = 1.5;
    const count = Math.floor(innerW / (bar + gap));
    const played = ctx.createLinearGradient(0, 0, 0, WAVE_HEIGHT);
    played.addColorStop(0, "#a78bfa");
    played.addColorStop(1, "#6d5bff");
    for (let i = 0; i < count; i++) {
      const x = i * (bar + gap);
      const p = peaks[Math.floor((i / count) * peaks.length)] ?? 0;
      const h = Math.max(3, p * (WAVE_HEIGHT - 16));
      ctx.fillStyle = x + bar <= playX ? played : "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.roundRect(x, (WAVE_HEIGHT - h) / 2, bar, h, 1.5);
      ctx.fill();
    }
  }, [peaks, innerW, playX]);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || zoom <= 1) return;
    if (playX < el.scrollLeft + viewW * 0.15 || playX > el.scrollLeft + viewW * 0.75) {
      el.scrollLeft = Math.max(0, playX - viewW * 0.3);
    }
  }, [playX, viewW, zoom]);

  const pxPerSec = duration > 0 ? innerW / duration : 0;
  const tickStep = pickTickStep(pxPerSec || 1);
  const ticks: number[] = [];
  if (duration > 0) for (let t = 0; t <= duration; t += tickStep) ticks.push(t);

  return (
    <div
      ref={scrollRef}
      className="relative overflow-x-auto overflow-y-hidden rounded-2xl border border-white/[0.06] bg-black/30 [scrollbar-width:thin]"
    >
      <div
        className="relative cursor-pointer"
        style={{ width: innerW }}
        onClick={(e) => {
          if (duration <= 0) return;
          const rect = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - rect.left) / innerW) * duration);
        }}
      >
        <div className="relative h-7 border-b border-white/[0.06]">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-0 h-full border-l border-white/[0.08] pl-1.5 pt-1.5 text-[10px] tabular-nums text-white/35"
              style={{ left: t * pxPerSec }}
            >
              {formatClock(t)}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height: WAVE_HEIGHT }}>
          {marks.map((m, i) => (
            <span
              key={i}
              className="absolute inset-y-0 bg-[#7b61ff]/[0.1]"
              style={{ left: m.begin * pxPerSec, width: Math.max(2, (m.end - m.begin) * pxPerSec) }}
            />
          ))}
          {peaks ? (
            <canvas ref={canvasRef} className="relative block" style={{ width: innerW, height: WAVE_HEIGHT }} />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-[12px] text-white/35">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-[#a78bfa]" />
              Строим волну…
            </div>
          )}
        </div>
        {duration > 0 ? (
          <span
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(167,139,250,0.9)]"
            style={{ left: playX }}
          >
            <span className="absolute -left-[5px] top-6 h-3 w-3 rounded-full bg-white" />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function SyncWorkspace({
  file,
  project,
  onBack,
  onAppend,
  onSetLines,
  fileBaseName
}: {
  file: File;
  project: SavedProject;
  onBack: () => void;
  onAppend: (line: SyncedLine) => void;
  onSetLines: (lines: SyncedLine[]) => void;
  fileBaseName: string;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);
  const holdStartRef = React.useRef<number | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [peaks, setPeaks] = React.useState<number[] | null>(null);
  const [time, setTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [holdBegin, setHoldBegin] = React.useState<number | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [showHelp, setShowHelp] = React.useState(false);

  const lines = React.useMemo(() => splitLyricLines(project.lyrics), [project.lyrics]);
  const synced = project.synced;
  const nextIndex = synced.length;
  const complete = lines.length > 0 && nextIndex >= lines.length;

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    let cancelled = false;
    setPeaks(null);
    void decodePeaks(file).then((p) => {
      if (!cancelled) setPeaks(p ?? []);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  React.useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      setTime(audioRef.current?.currentTime ?? 0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const startHold = React.useCallback(() => {
    const el = audioRef.current;
    if (!el || el.paused || complete || holdStartRef.current != null) return;
    holdStartRef.current = el.currentTime;
    setHoldBegin(el.currentTime);
  }, [complete]);

  const endHold = React.useCallback(() => {
    const el = audioRef.current;
    const begin = holdStartRef.current;
    holdStartRef.current = null;
    setHoldBegin(null);
    if (!el || begin == null || nextIndex >= lines.length) return;
    const end = el.currentTime;
    if (end < begin + 0.05) return;
    onAppend({ begin, end, text: lines[nextIndex]! });
  }, [lines, nextIndex, onAppend]);

  React.useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      if (!e.repeat) startHold();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      endHold();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [endHold, startHold]);

  React.useEffect(() => {
    const row = tableRef.current?.querySelector<HTMLElement>(`[data-row="${Math.min(nextIndex, lines.length - 1)}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [nextIndex, lines.length]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };

  const stop = () => {
    const el = audioRef.current;
    if (!el) return;
    el.pause();
    el.currentTime = 0;
    setTime(0);
  };

  const seek = (sec: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(sec, duration));
    setTime(el.currentTime);
  };

  const resetLine = () => {
    const last = synced[synced.length - 1];
    onSetLines(synced.slice(0, -1));
    if (last) seek(Math.max(0, last.begin - 2));
  };

  const download = () => {
    const xml = buildTtmlDocument(synced, metadataToXmlLang(project.language));
    downloadText(`${fileBaseName}.ttml`, xml, "application/ttml+xml");
  };

  const iconBtn =
    "grid h-12 w-12 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.04] text-white/80 transition-all hover:border-white/20 hover:bg-white/[0.08] hover:text-white active:scale-95 disabled:pointer-events-none disabled:opacity-35";
  const ghostBtn =
    "inline-flex h-12 items-center gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.03] px-4 text-[13px] font-medium text-white/75 transition-all hover:border-white/20 hover:bg-white/[0.07] hover:text-white active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35";

  const heading = [project.artist, project.title].filter(Boolean).join(" — ") || file.name;
  const progress = lines.length > 0 ? Math.min(1, nextIndex / lines.length) : 0;

  return (
    <div className="space-y-4">
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          className="hidden"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onPlay={() => setPlaying(true)}
          onPause={() => {
            setPlaying(false);
            endHold();
          }}
          onEnded={() => setPlaying(false)}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
        />
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            audioRef.current?.pause();
            onBack();
          }}
          className="group inline-flex items-center gap-3 text-left"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.03] text-white/70 transition-colors group-hover:bg-white/[0.08] group-hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </span>
          <span>
            <span className="block text-[12px] text-white/40">Назад к тексту</span>
            <span className="block max-w-[60vw] truncate text-[16px] font-semibold text-white sm:max-w-md">{heading}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className={cn(ghostBtn, "h-10", showHelp && "border-[#7b61ff]/40 text-white")}
        >
          <HelpCircle className="h-4 w-4" />
          Как тут работать?
        </button>
      </div>

      {showHelp ? (
        <Panel className="p-5">
          <ol className="grid gap-3 text-[13px] text-white/65 sm:grid-cols-3">
            {[
              "Нажмите Play — трек начнёт играть.",
              "Когда начинается строка, зажмите Пробел и держите, пока она звучит. Отпустите в конце.",
              "Повторите для всех строк и скачайте TTML. Ошиблись — «Сбросить строку»."
            ].map((s, i) => (
              <li key={i} className="flex gap-3 rounded-2xl bg-white/[0.03] p-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#7b61ff]/20 text-[12px] font-semibold text-[#c4b5fd]">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
          <div className="mt-4">
            <KaraokeLyricsGuidelines />
          </div>
        </Panel>
      ) : null}

      <Panel className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[22px] font-semibold tabular-nums tracking-tight text-white">
            {formatClock(time)}
            <span className="text-white/30"> / {formatClock(duration)}</span>
          </p>
          <div className="flex items-center gap-2 text-white/50">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/[0.06] hover:text-white"
              aria-label="Уменьшить масштаб"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={1}
              max={6}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-1 w-28 cursor-pointer accent-[#7b61ff] sm:w-40"
              aria-label="Масштаб волны"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(6, +(z + 0.5).toFixed(1)))}
              className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/[0.06] hover:text-white"
              aria-label="Увеличить масштаб"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <Waveform peaks={peaks} time={time} duration={duration} zoom={zoom} onSeek={seek} marks={synced} />

        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!audioUrl}
            className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#8b73ff] to-[#6d4bff] text-white shadow-[0_12px_30px_-10px_rgba(123,97,255,0.9)] transition-all hover:brightness-110 active:scale-95"
            aria-label={playing ? "Пауза" : "Play"}
          >
            {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
          </button>
          <button type="button" onClick={stop} className={iconBtn} aria-label="Стоп">
            <Square className="h-4 w-4" />
          </button>
          <button type="button" onClick={resetLine} disabled={synced.length === 0} className={ghostBtn}>
            <Undo2 className="h-4 w-4" />
            Сбросить строку
          </button>
          <button
            type="button"
            onClick={() => onSetLines([])}
            disabled={synced.length === 0}
            className={ghostBtn}
          >
            <RotateCcw className="h-4 w-4" />
            Сбросить все
          </button>
          <button
            type="button"
            onClick={download}
            disabled={synced.length === 0}
            className="ml-auto inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-[14px] font-semibold text-[#0b0b12] shadow-[0_12px_30px_-12px_rgba(255,255,255,0.5)] transition-all hover:bg-white/90 active:scale-[0.98] disabled:pointer-events-none disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
          >
            <Download className="h-4 w-4" />
            Скачать TTML
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex items-center justify-between text-[12px]">
              <span className="text-white/55">
                {complete ? (
                  <span className="text-emerald-300">Все строки размечены — можно скачивать TTML</span>
                ) : playing ? (
                  <>
                    Зажмите{" "}
                    <kbd className="rounded-md border border-white/15 bg-white/[0.08] px-1.5 py-0.5 font-sans text-[11px] text-white">
                      Пробел
                    </kbd>{" "}
                    на время строки
                  </>
                ) : (
                  "Нажмите Play, чтобы начать разметку"
                )}
              </span>
              <span className="tabular-nums text-white/40">
                {Math.min(nextIndex, lines.length)}/{lines.length}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#7b61ff] to-[#3b82f6] transition-[width] duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
          {/* Для тача: та же механика, что у Пробела. */}
          <button
            type="button"
            disabled={!playing || complete}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              startHold();
            }}
            onPointerUp={endHold}
            onPointerCancel={endHold}
            className={cn(
              "h-10 select-none rounded-xl px-4 text-[13px] font-semibold transition-all disabled:opacity-35 sm:hidden",
              holdBegin != null ? "bg-[#7b61ff] text-white" : "bg-white/[0.08] text-white/80"
            )}
          >
            Удерживать
          </button>
        </div>

        <div ref={tableRef} className="mt-5 max-h-[420px] overflow-y-auto rounded-2xl border border-white/[0.06]">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead className="sticky top-0 z-[1] bg-[#12131c]/95 backdrop-blur">
              <tr className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/35">
                <th className="w-[84px] px-3 py-3 font-medium sm:w-[110px] sm:px-4">Старт</th>
                <th className="w-[84px] px-3 py-3 font-medium sm:w-[110px] sm:px-4">Конец</th>
                <th className="px-3 py-3 font-medium sm:px-4">Текст</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const s = synced[i];
                const current = i === nextIndex;
                const recording = current && holdBegin != null;
                return (
                  <tr
                    key={i}
                    data-row={i}
                    onClick={s ? () => seek(s.begin) : undefined}
                    className={cn(
                      "border-t border-white/[0.04] transition-colors",
                      s && "cursor-pointer text-white/55 hover:bg-white/[0.03]",
                      current && !recording && "bg-white/[0.04] text-white",
                      recording && "bg-[#7b61ff]/[0.16] text-white",
                      !s && !current && "text-white/35"
                    )}
                  >
                    <td className="px-3 py-3 text-[12px] tabular-nums sm:px-4 sm:text-[14px]">
                      {s ? (
                        formatKaraokeClock(s.begin)
                      ) : recording ? (
                        <span className="text-[#c4b5fd]">{formatKaraokeClock(holdBegin)}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3 text-[12px] tabular-nums sm:px-4 sm:text-[14px]">
                      {s ? (
                        formatKaraokeClock(s.end)
                      ) : recording ? (
                        <span className="inline-flex items-center gap-1.5 text-[#c4b5fd]">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#a78bfa]" />
                          запись
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn("px-3 py-3 sm:px-4", (current || recording) && "font-semibold")}>
                      <span className="flex items-center gap-2">
                        {s ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" /> : null}
                        {line}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function KaraokeStudio() {
  const [project, setProject] = React.useState<SavedProject>(EMPTY_PROJECT);
  const [loaded, setLoaded] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);
  const [step, setStep] = React.useState<1 | 2>(1);

  React.useEffect(() => {
    const handoff = takeKaraokeHandoff();
    if (handoff) {
      // Пришли из мастера релиза — начинаем проект с текстом этого трека.
      // Сразу сохраняем, чтобы повторный запуск эффекта прочитал уже его.
      const fromRelease: SavedProject = {
        ...EMPTY_PROJECT,
        artist: handoff.artist ?? "",
        title: handoff.title ?? "",
        lyrics: handoff.lyrics ?? "",
        language: handoff.language && LANGUAGES.includes(handoff.language) ? handoff.language : EMPTY_PROJECT.language
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fromRelease));
      } catch {
        // Без хранилища проект просто не переживёт перезагрузку.
      }
      setProject(fromRelease);
    } else {
      const saved = readSaved();
      if (saved) setProject(saved);
    }
    setLoaded(true);
  }, []);

  React.useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      // Приватный режим или переполнено хранилище — работаем без автосохранения.
    }
  }, [loaded, project]);

  const update = (patch: Partial<SavedProject>) => setProject((p) => ({ ...p, ...patch }));

  const onLyricsChange = (lyrics: string) =>
    setProject((p) => {
      // Разметка привязана к строкам: если строка изменилась, дальше неё таймкоды недействительны.
      const next = splitLyricLines(lyrics);
      const keep = p.synced.findIndex((s, i) => s.text !== next[i]);
      return { ...p, lyrics, synced: keep === -1 ? p.synced : p.synced.slice(0, keep) };
    });

  const newProject = () => {
    if (
      (project.lyrics || project.synced.length > 0) &&
      !window.confirm("Начать новый проект? Текущий текст и разметка будут удалены.")
    ) {
      return;
    }
    setFile(null);
    setProject(EMPTY_PROJECT);
  };

  const appendLine = React.useCallback(
    (line: SyncedLine) => setProject((p) => ({ ...p, synced: [...p.synced, line] })),
    []
  );
  const setLines = React.useCallback((lines: SyncedLine[]) => setProject((p) => ({ ...p, synced: lines })), []);

  const baseName = [project.artist, project.title].filter(Boolean).join(" - ") || "lyrics";
  const fileBaseName = baseName.replace(/[^\wЀ-ӿԀ-ԯ\- ]+/g, "_").slice(0, 80) || "lyrics";
  const lineCount = splitLyricLines(project.lyrics).length;
  const canSync = Boolean(file) && lineCount > 0;
  const restoredName = !file && project.audioName ? project.audioName : undefined;

  if (step === 2 && file) {
    return (
      <div>
        <Steps step={2} />
        <SyncWorkspace
          file={file}
          project={project}
          onBack={() => setStep(1)}
          onAppend={appendLine}
          onSetLines={setLines}
          fileBaseName={fileBaseName}
        />
      </div>
    );
  }

  return (
    <div>
      <Steps step={1} />
      <Panel className="p-5 sm:p-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold text-white">Данные проекта</h2>
            <p className="mt-0.5 text-[13px] text-white/40">Сохраняется автоматически в этом браузере</p>
          </div>
          <button
            type="button"
            onClick={newProject}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.1] px-3.5 text-[13px] font-medium text-white/65 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Новый проект
          </button>
        </div>

        <div className="space-y-5">
          <AudioDropzone
            file={file}
            restoredName={restoredName}
            onFile={(f) => {
              setFile(f);
              update({ audioName: f.name });
            }}
            onClear={() => setFile(null)}
          />

          <div className="grid gap-4 sm:grid-cols-[1fr_1fr_170px]">
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-white/60">Исполнитель</span>
              <input
                value={project.artist}
                onChange={(e) => update({ artist: e.target.value })}
                placeholder="Имя артиста"
                className={cn(fieldClass, "h-12")}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-white/60">Название трека</span>
              <input
                value={project.title}
                onChange={(e) => update({ title: e.target.value })}
                placeholder="Название песни"
                className={cn(fieldClass, "h-12")}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-medium text-white/60">Язык</span>
              <select
                value={project.language}
                onChange={(e) => update({ language: e.target.value })}
                className={cn(fieldClass, "h-12 cursor-pointer")}
              >
                {LANGUAGES.filter((l) => l !== "Инструментал").map((l) => (
                  <option key={l} value={l} className="bg-[#14151a]">
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-2 flex items-center justify-between text-[13px] font-medium text-white/60">
              Текст трека — по одной фразе на строку
              {lineCount > 0 ? <span className="text-white/35">{lineCount} строк</span> : null}
            </span>
            <textarea
              value={project.lyrics}
              onChange={(e) => onLyricsChange(e.target.value)}
              placeholder={"Вставьте текст построчно, без меток [Куплет] и [Припев]"}
              className={cn(fieldClass, "min-h-[260px] resize-y py-3.5 leading-relaxed")}
            />
          </label>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              disabled={!canSync}
              onClick={() => setStep(2)}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#8b73ff] to-[#6d4bff] px-6 text-[15px] font-semibold text-white shadow-[0_14px_34px_-12px_rgba(123,97,255,0.9)] transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:from-white/10 disabled:to-white/10 disabled:text-white/35 disabled:shadow-none"
            >
              Открыть синхронизацию
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
