"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlignCenter,
  AlignLeft,
  ArrowLeft,
  Download,
  ImagePlus,
  Loader2,
  Pause,
  Play,
  Rewind,
  FastForward,
  SkipBack,
  SkipForward,
  X
} from "lucide-react";

import { reachGoal } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { SyncedLine } from "@/components/release-wizard/wizard-context";
import { formatKaraokeClock } from "@/components/release-wizard/lyrics-ttml-sync";
import { useVideoRecorder } from "@/components/video-snippets/use-video-recorder";

import {
  coverAccent,
  createKaraokeScene,
  DEFAULT_KARAOKE_LOOK,
  KARAOKE_FONT,
  KARAOKE_LOGO_SRC,
  KARAOKE_VIDEO_BITRATE,
  KARAOKE_VIDEO_FPS,
  KARAOKE_VIDEO_HEIGHT,
  KARAOKE_VIDEO_WIDTH,
  levelFromSpectrum,
  rgbToHex,
  type KaraokeBackground,
  type KaraokeEffect,
  type KaraokeLook
} from "./render-karaoke-frame";

const DURATIONS = [15, 30] as const;
/** The clip starts a little before the chosen line so the player card has time to open. */
const LEAD_IN_SECONDS = 1;
function formatShort(sec: number) {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

const LOOK_STORAGE_KEY = "icm-karaoke-look-v1";
const DARK_TEXT = "#15131f";

const BACKGROUNDS: Array<{ value: KaraokeBackground; label: string; swatch: string }> = [
  { value: "cover", label: "Обложка", swatch: "linear-gradient(135deg,#3b2a6b,#0b0b14 70%)" },
  { value: "dark", label: "Тёмный", swatch: "#0a0a10" },
  { value: "gradient", label: "Градиент", swatch: "linear-gradient(160deg,#7b61ff,#24164f)" },
  { value: "light", label: "Светлый", swatch: "#f3f1f8" }
];
const EFFECTS: Array<{ value: KaraokeEffect; label: string }> = [
  { value: "none", label: "Без эффекта" },
  { value: "dust", label: "Пыль" },
  { value: "bokeh", label: "Боке" },
  { value: "rays", label: "Лучи" }
];
const TEXT_COLORS = ["#ffffff", DARK_TEXT, "#ffe27a", "#ffb3d1", "#a5f3fc", "#c4b5fd"];
const ACCENT_COLORS = ["#7b61ff", "#ff4d6d", "#ff9f1c", "#22c55e", "#3b82f6", "#e5e5e5"];
const TEXT_SIZES: Array<{ value: number; label: string }> = [
  { value: 0.85, label: "S" },
  { value: 1, label: "M" },
  { value: 1.18, label: "L" }
];

function readLook(): KaraokeLook {
  try {
    const raw = window.localStorage.getItem(LOOK_STORAGE_KEY);
    return raw ? { ...DEFAULT_KARAOKE_LOOK, ...(JSON.parse(raw) as Partial<KaraokeLook>) } : DEFAULT_KARAOKE_LOOK;
  } catch {
    return DEFAULT_KARAOKE_LOOK;
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-white/60">{title}</p>
      {children}
    </div>
  );
}

function ColorRow({
  value,
  options,
  onChange,
  leading
}: {
  value: string | null;
  options: string[];
  onChange: (hex: string) => void;
  leading?: React.ReactNode;
}) {
  const custom = value && !options.includes(value.toLowerCase()) ? value : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {leading}
      {options.map((hex) => (
        <button
          key={hex}
          type="button"
          onClick={() => onChange(hex)}
          aria-label={hex}
          className={cn(
            "h-9 w-9 rounded-full border transition-transform hover:scale-105",
            value?.toLowerCase() === hex ? "border-white ring-2 ring-[#7b61ff]/70" : "border-white/15"
          )}
          style={{ background: hex }}
        />
      ))}
      <label
        className={cn(
          "relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-full border text-[15px] text-white/70",
          custom ? "border-white ring-2 ring-[#7b61ff]/70" : "border-white/15"
        )}
        style={{ background: custom ?? "conic-gradient(#ff4d6d,#ffd166,#22c55e,#3b82f6,#a855f7,#ff4d6d)" }}
        title="Свой цвет"
      >
        <input
          type="color"
          value={custom ?? value ?? "#ffffff"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось открыть картинку"));
    };
    img.src = url;
  });
}

export function KaraokeVideo({
  file,
  title,
  artist,
  synced,
  fileBaseName,
  onBack
}: {
  file: File;
  title: string;
  artist: string;
  synced: SyncedLine[];
  fileBaseName: string;
  onBack: () => void;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const graphRef = React.useRef<{
    ctx: AudioContext;
    analyser: AnalyserNode;
    dest: MediaStreamAudioDestinationNode;
    bins: Uint8Array<ArrayBuffer>;
  } | null>(null);
  const coverInputRef = React.useRef<HTMLInputElement>(null);

  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = React.useState<AudioBuffer | null>(null);
  const [decodeError, setDecodeError] = React.useState(false);
  const [cover, setCover] = React.useState<HTMLImageElement | null>(null);
  const [startLine, setStartLine] = React.useState(0);
  const [clipLength, setClipLength] = React.useState<(typeof DURATIONS)[number]>(15);
  const [playing, setPlaying] = React.useState(false);
  const [previewTime, setPreviewTime] = React.useState<number | null>(null);
  const [playhead, setPlayhead] = React.useState(0);
  const [look, setLook] = React.useState<KaraokeLook>(DEFAULT_KARAOKE_LOOK);
  const [logo, setLogo] = React.useState<HTMLImageElement | null>(null);
  const lookLoaded = React.useRef(false);

  React.useEffect(() => {
    setLook(readLook());
    lookLoaded.current = true;
    const img = new Image();
    img.onload = () => setLogo(img);
    img.src = KARAOKE_LOGO_SRC;
  }, []);

  React.useEffect(() => {
    if (!lookLoaded.current) return;
    try {
      window.localStorage.setItem(LOOK_STORAGE_KEY, JSON.stringify(look));
    } catch {
      // The look simply resets next visit.
    }
  }, [look]);

  const patchLook = (patch: Partial<KaraokeLook>) =>
    setLook((current) => {
      const next = { ...current, ...patch };
      // Keep the text readable when switching between light and dark backgrounds.
      if (patch.background === "light" && current.background !== "light" && next.textColor === "#ffffff") {
        next.textColor = DARK_TEXT;
      }
      if (patch.background && patch.background !== "light" && current.background === "light" && next.textColor === DARK_TEXT) {
        next.textColor = "#ffffff";
      }
      return next;
    });
  const autoAccent = React.useMemo(() => rgbToHex(coverAccent(cover)), [cover]);

  const lines = React.useMemo(() => [...synced].sort((a, b) => a.begin - b.begin), [synced]);
  const trackDuration = audioBuffer?.duration ?? lines[lines.length - 1]?.end ?? 0;
  const clipStart = Math.max(0, (lines[startLine]?.begin ?? 0) - LEAD_IN_SECONDS);
  const clipDuration = Math.max(1, Math.min(clipLength, (trackDuration || clipStart + clipLength) - clipStart));

  const { recordState, start: recordRealtime, renderOffline, cancel, reset } = useVideoRecorder({
    canvasRef,
    getAudioStream: async () => ensureGraph()?.dest.stream ?? null
  });
  const busy = recordState.status === "recording" || recordState.status === "finalizing";

  React.useEffect(() => {
    reachGoal("karaoke_video_open");
  }, []);

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    let cancelled = false;
    const ctx = new AudioContext();
    file
      .arrayBuffer()
      .then((buf) => ctx.decodeAudioData(buf))
      .then((decoded) => {
        if (!cancelled) setAudioBuffer(decoded);
      })
      .catch(() => {
        if (!cancelled) setDecodeError(true);
      })
      .finally(() => void ctx.close().catch(() => {}));
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  React.useEffect(
    () => () => {
      void graphRef.current?.ctx.close().catch(() => {});
      graphRef.current = null;
    },
    []
  );

  // A new clip or cover makes the finished video stale.
  React.useEffect(() => {
    reset();
  }, [cover, startLine, clipLength, look, reset]);

  const scene = React.useMemo(
    () =>
      createKaraokeScene({
        lines,
        title,
        artist,
        cover,
        logo,
        clipStart,
        clipDuration,
        trackDuration,
        watermark: true,
        look
      }),
    [lines, title, artist, cover, logo, clipStart, clipDuration, trackDuration, look]
  );

  function ensureGraph() {
    if (graphRef.current) return graphRef.current;
    const el = audioRef.current;
    if (!el) return null;
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.75;
    const dest = ctx.createMediaStreamDestination();
    source.connect(analyser);
    analyser.connect(ctx.destination);
    source.connect(dest);
    graphRef.current = { ctx, analyser, dest, bins: new Uint8Array(analyser.frequencyBinCount) };
    return graphRef.current;
  }

  const drawAt = React.useCallback(
    (time: number, level: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      scene.draw(ctx, canvas.width, canvas.height, time, level);
    },
    [scene]
  );

  const defaultStill = clipStart + Math.min(clipDuration - 0.5, Math.max(2.5, clipDuration * 0.55));
  const shownTime = playing ? playhead : (previewTime ?? defaultStill);

  // Paused: show a still from the middle of the lyrics part, or wherever the preview stopped.
  React.useEffect(() => {
    if (playing) return;
    const still = previewTime ?? defaultStill;
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) drawAt(still, 0.3);
    });
    drawAt(still, 0.3);
    return () => {
      cancelled = true;
    };
  }, [playing, previewTime, defaultStill, drawAt]);

  // Playing: draw every animation frame at the audio's own clock and stop at the end of the clip.
  React.useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      const el = audioRef.current;
      const graph = graphRef.current;
      if (el) {
        let level = 0.3;
        if (graph) {
          graph.analyser.getByteFrequencyData(graph.bins);
          level = levelFromSpectrum(graph.bins);
        }
        drawAt(el.currentTime, level);
        setPlayhead((prev) => (Math.abs(prev - el.currentTime) > 0.05 ? el.currentTime : prev));
        if (el.currentTime >= clipStart + clipDuration && recordState.status !== "recording") {
          el.pause();
          setPreviewTime(null);
          return;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, drawAt, clipStart, clipDuration, recordState.status]);

  const togglePreview = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      setPreviewTime(el.currentTime);
      return;
    }
    const graph = ensureGraph();
    await graph?.ctx.resume();
    const from =
      previewTime == null || previewTime < clipStart || previewTime >= clipStart + clipDuration - 0.2 ? clipStart : previewTime;
    el.currentTime = from;
    setPlayhead(from);
    await el.play();
  };

  /** Jump the preview to a track time inside the clip, keeping play or pause as it was. */
  const seekTo = (sec: number) => {
    const time = Math.min(clipStart + clipDuration - 0.05, Math.max(clipStart, sec));
    const el = audioRef.current;
    if (el) el.currentTime = time;
    setPlayhead(time);
    setPreviewTime(time);
  };

  const clipLines = lines.filter((l) => l.begin >= clipStart - 0.01 && l.begin < clipStart + clipDuration);
  const stepLine = (dir: -1 | 1) => {
    const now = shownTime;
    if (dir > 0) {
      const next = clipLines.find((l) => l.begin - 0.1 > now + 0.05);
      seekTo(next ? next.begin - 0.1 : clipStart + clipDuration);
    } else {
      // Inside a line, go to its start; at its start already, go to the line before.
      const prev = [...clipLines].reverse().find((l) => l.begin - 0.1 < now - 0.4);
      seekTo(prev ? prev.begin - 0.1 : clipStart);
    }
  };

  const render = async () => {
    if (!audioBuffer) return;
    audioRef.current?.pause();
    await document.fonts?.ready;
    const ok = await renderOffline({
      audioBuffer,
      startTime: clipStart,
      durationSeconds: clipDuration,
      width: KARAOKE_VIDEO_WIDTH,
      height: KARAOKE_VIDEO_HEIGHT,
      fps: KARAOKE_VIDEO_FPS,
      videoBitrate: KARAOKE_VIDEO_BITRATE,
      fileNameBase: `${fileBaseName} - karaoke`,
      drawFrame: (ctx, w, h, frame) => scene.draw(ctx, w, h, frame.currentTime, levelFromSpectrum(frame.frequencyData))
    });
    if (ok) return;
    // No WebCodecs here: record the preview canvas in real time instead.
    await recordRealtime({
      durationSeconds: clipDuration,
      fileNameBase: `${fileBaseName} - karaoke`,
      onBeforeStart: async () => {
        const el = audioRef.current;
        const graph = ensureGraph();
        if (!el) return;
        await graph?.ctx.resume();
        el.currentTime = clipStart;
        await el.play();
      },
      onAfterStop: () => {
        audioRef.current?.pause();
        setPreviewTime(null);
      }
    });
  };

  const pickCover = async (f: File | undefined) => {
    if (!f || !f.type.startsWith("image/")) return;
    try {
      setCover(await loadImage(f));
    } catch {
      // Keep the generated cover.
    }
  };

  const chip = (active: boolean) =>
    cn(
      "h-10 rounded-xl px-4 text-[13px] font-semibold transition-colors",
      active ? "bg-[#7b61ff] text-white" : "bg-white/[0.05] text-white/65 hover:bg-white/[0.09] hover:text-white"
    );

  return (
    <div className="space-y-4">
      {audioUrl ? (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          className="hidden"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setPreviewTime(null);
          }}
        />
      ) : null}

      <button
        type="button"
        onClick={() => {
          audioRef.current?.pause();
          cancel();
          onBack();
        }}
        className="group inline-flex items-center gap-3 text-left"
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.1] bg-white/[0.03] text-white/70 transition-colors group-hover:bg-white/[0.08] group-hover:text-white">
          <ArrowLeft className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-[12px] text-white/40">Назад к синхронизации</span>
          <span className="block text-[16px] font-semibold text-white">Видео с текстом для историй</span>
        </span>
      </button>

      <div className="grid gap-5 rounded-3xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-4 sm:p-6 md:grid-cols-[300px_1fr]">
        <div className="mx-auto w-full max-w-[300px] md:sticky md:top-24 md:self-start">
          <div className="relative overflow-hidden rounded-[28px] border border-white/[0.1] bg-black shadow-[0_30px_80px_-30px_rgba(123,97,255,0.6)]">
            <canvas
              ref={canvasRef}
              width={KARAOKE_VIDEO_WIDTH}
              height={KARAOKE_VIDEO_HEIGHT}
              className="block aspect-[9/16] w-full"
              style={{ fontFamily: KARAOKE_FONT }}
            />
            {!audioBuffer && !decodeError ? (
              <div className="absolute inset-0 grid place-items-center bg-black/60 text-[13px] text-white/70">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Готовим трек…
                </span>
              </div>
            ) : null}
          </div>
          <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 pb-2.5 pt-3">
            <input
              type="range"
              min={0}
              max={clipDuration}
              step={0.01}
              value={Math.min(clipDuration, Math.max(0, shownTime - clipStart))}
              onChange={(e) => seekTo(clipStart + Number(e.target.value))}
              disabled={!audioUrl || busy}
              aria-label="Позиция превью"
              className="h-1 w-full cursor-pointer accent-[#7b61ff] disabled:opacity-40"
            />
            <div className="mt-1 flex justify-between text-[11px] tabular-nums text-white/40">
              <span>{formatShort(shownTime - clipStart)}</span>
              <span>{formatShort(clipDuration)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              {[
                { label: "Предыдущая строка", icon: SkipBack, onClick: () => stepLine(-1) },
                { label: "Назад на 2 секунды", icon: Rewind, onClick: () => seekTo(shownTime - 2) }
              ].map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  disabled={!audioUrl || busy}
                  aria-label={label}
                  title={label}
                  className="grid h-10 w-10 place-items-center rounded-xl text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => void togglePreview()}
                disabled={!audioUrl || busy}
                aria-label={playing && !busy ? "Пауза" : "Смотреть превью"}
                className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#8b73ff] to-[#6d4bff] text-white shadow-[0_10px_26px_-10px_rgba(123,97,255,0.9)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
              >
                {playing && !busy ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
              </button>
              {[
                { label: "Вперёд на 2 секунды", icon: FastForward, onClick: () => seekTo(shownTime + 2) },
                { label: "Следующая строка", icon: SkipForward, onClick: () => stepLine(1) }
              ].map(({ label, icon: Icon, onClick }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onClick}
                  disabled={!audioUrl || busy}
                  aria-label={label}
                  title={label}
                  className="grid h-10 w-10 place-items-center rounded-xl text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white disabled:opacity-35"
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
          <div>
            <p className="mb-2 text-[13px] font-medium text-white/60">Обложка</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-white/[0.18] px-4 text-[13px] font-medium text-white/75 transition-colors hover:border-[#7b61ff]/60 hover:text-white"
              >
                <ImagePlus className="h-4 w-4" />
                {cover ? "Заменить обложку" : "Загрузить обложку"}
              </button>
              {cover ? (
                <button
                  type="button"
                  onClick={() => setCover(null)}
                  className="grid h-11 w-11 place-items-center rounded-xl text-white/45 hover:bg-white/[0.08] hover:text-white"
                  aria-label="Убрать обложку"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <span className="text-[12px] text-white/35">Без обложки нарисуем свою</span>
              )}
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                void pickCover(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <div className="space-y-5 rounded-2xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-[15px] font-semibold text-white">Оформление</p>

            <Section title="Фон">
              <div className="grid grid-cols-4 gap-2">
                {BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.value}
                    type="button"
                    onClick={() => patchLook({ background: bg.value })}
                    className={cn(
                      "rounded-xl border p-1.5 text-[12px] font-medium transition-colors",
                      look.background === bg.value
                        ? "border-[#7b61ff] bg-[#7b61ff]/10 text-white"
                        : "border-white/[0.08] text-white/55 hover:border-white/20 hover:text-white"
                    )}
                  >
                    <span className="mb-1.5 block h-10 rounded-lg border border-white/10" style={{ background: bg.swatch }} />
                    {bg.label}
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Цвет текста">
              <ColorRow value={look.textColor} options={TEXT_COLORS} onChange={(hex) => patchLook({ textColor: hex })} />
            </Section>

            <Section title="Акцент — свечение и детали карточки">
              <ColorRow
                value={look.accent}
                options={ACCENT_COLORS}
                onChange={(hex) => patchLook({ accent: hex })}
                leading={
                  <button
                    type="button"
                    onClick={() => patchLook({ accent: null })}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-full border pl-1 pr-3 text-[12px] font-medium",
                      look.accent === null
                        ? "border-white text-white ring-2 ring-[#7b61ff]/70"
                        : "border-white/15 text-white/60 hover:text-white"
                    )}
                  >
                    <span className="h-7 w-7 rounded-full" style={{ background: autoAccent }} />
                    Из обложки
                  </button>
                }
              />
            </Section>

            <Section title={`Прозрачность остальных строк — ${Math.round(look.inactiveOpacity * 100)}%`}>
              <input
                type="range"
                min={0.05}
                max={0.7}
                step={0.01}
                value={look.inactiveOpacity}
                onChange={(e) => patchLook({ inactiveOpacity: Number(e.target.value) })}
                className="h-1 w-full cursor-pointer accent-[#7b61ff]"
              />
            </Section>

            <div className="grid gap-5 sm:grid-cols-2">
              <Section title="Размер текста">
                <div className="flex gap-2">
                  {TEXT_SIZES.map((size) => (
                    <button
                      key={size.label}
                      type="button"
                      onClick={() => patchLook({ textScale: size.value })}
                      className={cn(chip(look.textScale === size.value), "w-12 px-0")}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </Section>
              <Section title="Выравнивание">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => patchLook({ align: "left" })}
                    className={cn(chip(look.align === "left"), "w-12 px-0")}
                    aria-label="По левому краю"
                  >
                    <AlignLeft className="mx-auto h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => patchLook({ align: "center" })}
                    className={cn(chip(look.align === "center"), "w-12 px-0")}
                    aria-label="По центру"
                  >
                    <AlignCenter className="mx-auto h-4 w-4" />
                  </button>
                </div>
              </Section>
            </div>

            <Section title="Подсветка строки">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => patchLook({ highlight: "sweep" })} className={chip(look.highlight === "sweep")}>
                  Заливка по ходу пения
                </button>
                <button type="button" onClick={() => patchLook({ highlight: "line" })} className={chip(look.highlight === "line")}>
                  Вся строка сразу
                </button>
              </div>
            </Section>

            <Section title="Эффект на фоне">
              <div className="flex flex-wrap gap-2">
                {EFFECTS.map((effect) => (
                  <button
                    key={effect.value}
                    type="button"
                    onClick={() => patchLook({ effect: effect.value })}
                    className={chip(look.effect === effect.value)}
                  >
                    {effect.label}
                  </button>
                ))}
              </div>
            </Section>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-white/70">Блик на карточке</span>
              <input
                type="checkbox"
                checked={look.shine}
                onChange={(e) => patchLook({ shine: e.target.checked })}
                className="h-5 w-5 cursor-pointer accent-[#7b61ff]"
              />
            </label>

            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-white/70">Начинать с карточки трека</span>
              <input
                type="checkbox"
                checked={look.intro}
                onChange={(e) => patchLook({ intro: e.target.checked })}
                className="h-5 w-5 cursor-pointer accent-[#7b61ff]"
              />
            </label>

            <button
              type="button"
              onClick={() => setLook(DEFAULT_KARAOKE_LOOK)}
              className="text-[12px] text-white/40 underline-offset-2 hover:text-white hover:underline"
            >
              Сбросить оформление
            </button>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-white/60">Длина</p>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button key={d} type="button" onClick={() => setClipLength(d)} className={chip(clipLength === d)}>
                  {d} секунд
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-[13px] font-medium text-white/60">С какой строки начать</p>
            <div className="max-h-[230px] overflow-y-auto rounded-2xl border border-white/[0.06]">
              {lines.map((line, i) => (
                <button
                  key={`${i}-${line.begin}`}
                  type="button"
                  onClick={() => {
                    setStartLine(i);
                    setPreviewTime(null);
                    audioRef.current?.pause();
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 border-t border-white/[0.04] px-4 py-2.5 text-left text-[14px] first:border-t-0 transition-colors",
                    i === startLine ? "bg-[#7b61ff]/[0.16] text-white" : "text-white/55 hover:bg-white/[0.03]"
                  )}
                >
                  <span className="w-[64px] shrink-0 text-[12px] tabular-nums text-white/40">{formatKaraokeClock(line.begin)}</span>
                  <span className="truncate">{line.text}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-white/35">Лучше всего заходит припев или самая цепляющая строка.</p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-black/20 p-4">
            {recordState.status === "complete" && recordState.downloadUrl ? (
              <div className="space-y-3">
                <p className="text-[13px] text-emerald-300">{recordState.message}</p>
                <a
                  href={recordState.downloadUrl}
                  download={recordState.fileName ?? "karaoke.mp4"}
                  onClick={() => reachGoal("karaoke_video_download", { seconds: clipLength })}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 text-[14px] font-semibold text-[#0b0b12] transition-colors hover:bg-white/90"
                >
                  <Download className="h-4 w-4" />
                  Скачать видео
                </a>
                <div className="rounded-xl bg-[#7b61ff]/[0.1] p-3 text-[13px] text-white/70">
                  Хочешь, чтобы трек с этим текстом был в Яндекс Музыке, VK и Spotify?{" "}
                  <Link
                    href="/register"
                    onClick={() => reachGoal("karaoke_release_cta")}
                    className="font-semibold text-[#c4b5fd] underline-offset-2 hover:underline"
                  >
                    Выпусти релиз через ICECREAMMUSIC
                  </Link>
                </div>
              </div>
            ) : busy ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[13px] text-white/60">
                  <span>{recordState.message ?? "Собираем видео…"}</span>
                  <button type="button" onClick={cancel} className="text-white/45 hover:text-white">
                    Отменить
                  </button>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#7b61ff] to-[#3b82f6] transition-[width] duration-200"
                    style={{ width: `${recordState.progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => void render()}
                  disabled={!audioBuffer || lines.length === 0}
                  className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-[#8b73ff] to-[#6d4bff] px-6 text-[15px] font-semibold text-white shadow-[0_14px_34px_-12px_rgba(123,97,255,0.9)] transition-all hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
                >
                  Собрать MP4
                </button>
                <p className="text-[12px] text-white/40">
                  1080×1920, со звуком — сразу в истории, Клипы, Reels и Shorts. Видео собирается в браузере, трек никуда
                  не загружается.
                </p>
                {recordState.status === "error" ? <p className="text-[12px] text-[#ff5d6d]">{recordState.message}</p> : null}
                {decodeError ? (
                  <p className="text-[12px] text-[#ff5d6d]">Браузер не смог прочитать этот аудиофайл. Попробуйте MP3 или WAV.</p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
