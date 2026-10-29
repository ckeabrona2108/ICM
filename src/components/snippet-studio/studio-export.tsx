"use client";

import * as React from "react";
import { Check, Copy, Download, Link2, Loader2, X } from "lucide-react";

import { renderSnippetVideo, SnippetExportUnsupportedError } from "@/components/video-snippets/render-snippet-video";
import { cn } from "@/lib/utils";

import { PlatformGlyph, type PlatformGlyphId } from "./platform-glyphs";
import { SceneRenderer } from "./scene/render-scene";
import { uploadSnippetToSmartLink } from "./smart-link-publish";
import { SNIPPET_FORMATS, type SceneAssets, type SceneSettings, type SnippetFormatId } from "./scene/types";

type JobStatus = "queued" | "rendering" | "done" | "error" | "canceled";

interface ExportJob {
  format: SnippetFormatId;
  status: JobStatus;
  progress: number;
  message: string;
  url: string | null;
  sizeMb: number | null;
  smartLink: { status: "idle" | "uploading" | "done" | "error"; progress: number; message: string };
}

const SMART_LINK_IDLE: ExportJob["smartLink"] = { status: "idle", progress: 0, message: "" };



const FORMAT_GLYPHS: Record<SnippetFormatId, PlatformGlyphId[]> = {
  story: ["tiktok", "instagram", "vk", "youtubeShorts"],
  square: ["instagram", "vk", "telegram"],
  wide: ["telegram"]
};

const LINK_TARGETS: Array<{ id: PlatformGlyphId; name: string; source: string }> = [
  { id: "tiktok", name: "TikTok", source: "tiktok" },
  { id: "vk", name: "VK Клипы", source: "vk_clips" },
  { id: "instagram", name: "Reels", source: "reels" },
  { id: "youtubeShorts", name: "YouTube Shorts", source: "shorts" },
  { id: "telegram", name: "Telegram", source: "telegram" }
];

function formatSpeed(speed: number) {
  return speed.toFixed(1).replace(".", ",");
}

async function loadSceneFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.allSettled([
    document.fonts.load('700 64px "Space Grotesk"'),
    document.fonts.load('500 32px "Inter"'),
    document.fonts.load('600 32px "Inter"')
  ]);
}

export function StudioExport(props: {
  settings: SceneSettings;
  assets: SceneAssets;
  audioBuffer: AudioBuffer | null;
  clipStart: number;
  clipDuration: number;
  trackDuration: number;
  dropTrackTime: number | null;
  fileBase: string;
  smartLinkUrl: string | null;
  releaseId: string | null;
  disabledReason: string | null;
}) {
  const [formats, setFormats] = React.useState<Record<SnippetFormatId, boolean>>({ story: true, square: false, wide: false });
  const [fps, setFps] = React.useState<30 | 60>(30);
  const [jobs, setJobs] = React.useState<ExportJob[]>([]);
  const [copied, setCopied] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const isRendering = jobs.some((job) => job.status === "rendering" || job.status === "queued");

  const objectUrlsRef = React.useRef<string[]>([]);
  const revokeObjectUrls = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  };
  React.useEffect(
    () => () => {
      abortRef.current?.abort();
      revokeObjectUrls();
    },
    []
  );

  const updateJob = (format: SnippetFormatId, patch: Partial<ExportJob>) => {
    setJobs((current) => current.map((job) => (job.format === format ? { ...job, ...patch } : job)));
  };

  const start = async () => {
    const audioBuffer = props.audioBuffer;
    const selected = (Object.keys(formats) as SnippetFormatId[]).filter((format) => formats[format]);
    if (!audioBuffer || selected.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Snapshot everything: edits made while rendering must not leak into the file.
    const settings = structuredClone(props.settings);
    const assets = { ...props.assets };
    const { clipStart, clipDuration, trackDuration, dropTrackTime } = props;
    revokeObjectUrls();
    setJobs(selected.map((format) => ({ format, status: "queued", progress: 0, message: "В очереди", url: null, sizeMb: null, smartLink: SMART_LINK_IDLE })));
    await loadSceneFonts();

    for (const format of selected) {
      if (controller.signal.aborted) {
        updateJob(format, { status: "canceled", message: "Отменено" });
        continue;
      }
      const { width, height } = SNIPPET_FORMATS[format];
      const renderer = new SceneRenderer();
      updateJob(format, { status: "rendering", message: "Подготовка звука…" });
      try {
        const blob = await renderSnippetVideo({
          audioBuffer,
          startTime: clipStart,
          durationSeconds: clipDuration,
          width,
          height,
          fps,
          signal: controller.signal,
          drawFrame: (context, frameWidth, frameHeight, playback) => {
            renderer.render(
              context,
              frameWidth,
              frameHeight,
              settings,
              {
                time: playback.currentTime - clipStart,
                clipDuration,
                trackTime: playback.currentTime,
                trackDuration,
                dropTime: dropTrackTime === null ? null : dropTrackTime - clipStart,
                frequencyData: playback.frequencyData
              },
              assets
            );
          },
          onProgress: ({ frame, totalFrames, speed }) => {
            updateJob(format, {
              progress: (frame / totalFrames) * 100,
              message: `Кадр ${frame} / ${totalFrames}${speed >= 1 ? ` · в ${formatSpeed(speed)}× быстрее реального времени` : ""}`
            });
          }
        });
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        updateJob(format, {
          status: "done",
          progress: 100,
          url,
          sizeMb: blob.size / 1024 / 1024,
          message: "Готово"
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          updateJob(format, { status: "canceled", message: "Отменено" });
        } else if (error instanceof SnippetExportUnsupportedError) {
          updateJob(format, { status: "error", message: "Этот браузер не умеет собирать MP4. Открой студию в Chrome, Edge или Safari 17+." });
        } else {
          console.error("[SnippetStudio] export failed", error);
          updateJob(format, { status: "error", message: "Не удалось собрать видео" });
        }
      }
    }
    if (abortRef.current === controller) abortRef.current = null;
  };

  const putIntoSmartLink = async (job: ExportJob) => {
    const releaseId = props.releaseId;
    if (!job.url || !releaseId) return;
    const setLink = (smartLink: ExportJob["smartLink"]) => updateJob(job.format, { smartLink });
    setLink({ status: "uploading", progress: 0, message: "Загружаем видео…" });
    try {
      const blob = await fetch(job.url).then((response) => response.blob());
      await uploadSnippetToSmartLink({
        releaseId,
        blob,
        fileName: `snippet-${job.format}.mp4`,
        onProgress: (fraction) => setLink({ status: "uploading", progress: fraction * 100, message: "Загружаем видео…" })
      });
      setLink({ status: "done", progress: 100, message: "Видео стоит в шапке смарт-линка" });
    } catch (error) {
      setLink({ status: "error", progress: 0, message: error instanceof Error ? error.message : "Не удалось загрузить видео" });
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((current) => (current === value ? null : current)), 1600);
    } catch {
      setCopied(null);
    }
  };

  const selectedCount = Object.values(formats).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        {(Object.keys(SNIPPET_FORMATS) as SnippetFormatId[]).map((format) => {
          const info = SNIPPET_FORMATS[format];
          return (
            <label
              key={format}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors",
                formats[format] ? "border-[#8b72ff]/60 bg-[#7b61ff]/10" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]"
              )}
            >
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[#7b61ff]"
                checked={formats[format]}
                disabled={isRendering}
                onChange={(event) => setFormats((current) => ({ ...current, [format]: event.target.checked }))}
              />
              <span
                aria-hidden="true"
                className="shrink-0 rounded-[4px] border-2 border-[#a594ff]"
                style={{ width: format === "wide" ? 32 : format === "square" ? 24 : 16, height: format === "wide" ? 18 : format === "square" ? 24 : 28 }}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[14px] font-semibold text-white">{info.label}</span>
                <span className="truncate text-[12px] text-white/60">
                  {info.hint} · {info.width}×{info.height}
                </span>
              </span>
              <span className="hidden gap-1 sm:flex">
                {FORMAT_GLYPHS[format].map((glyph) => (
                  <PlatformGlyph key={glyph} id={glyph} size={22} />
                ))}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13px] text-white/70">Плавность</span>
        {([30, 60] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={isRendering}
            onClick={() => setFps(value)}
            className={cn(
              "min-h-9 rounded-full border px-3.5 text-[13px] font-medium",
              fps === value ? "border-[#8b72ff]/70 bg-[#7b61ff]/20 text-white" : "border-white/10 bg-white/[0.04] text-white/75 hover:bg-white/[0.08]"
            )}
          >
            1080p · {value} fps
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={isRendering || Boolean(props.disabledReason) || selectedCount === 0}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#7b61ff] px-5 text-[14px] font-semibold text-white shadow-[0_10px_40px_-10px_rgba(123,97,255,0.8)] transition-colors hover:bg-[#8b72ff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {selectedCount > 1 ? `Собрать ${selectedCount} видео` : "Собрать MP4"}
        </button>
        {isRendering ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-[14px] font-medium text-white/75 hover:text-white">
            <X className="h-4 w-4" /> Отменить
          </button>
        ) : null}
        {props.disabledReason ? <span className="text-[13px] text-white/60">{props.disabledReason}</span> : null}
      </div>

      {jobs.length ? (
        <div className="flex flex-col gap-2.5">
          {jobs.map((job) => (
            <div key={job.format} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[14px]">
                <span className="font-semibold text-white">
                  {SNIPPET_FORMATS[job.format].label} · {SNIPPET_FORMATS[job.format].hint.split(" · ")[0]}
                </span>
                <span className={cn("text-[13px]", job.status === "done" ? "font-semibold text-[#7df0c4]" : job.status === "error" ? "text-rose-300" : "text-white/70")}>
                  {job.status === "done" && job.sizeMb !== null ? `Готово · ${job.sizeMb.toFixed(1).replace(".", ",")} МБ` : job.message}
                </span>
              </div>
              {job.status === "done" && job.url ? (
                <a
                  href={job.url}
                  download={`${props.fileBase}-${SNIPPET_FORMATS[job.format].label.replace(":", "x")}.mp4`}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-[13px] font-semibold text-[#14112e] hover:bg-white/90"
                >
                  <Download className="h-4 w-4" /> Скачать MP4
                </a>
              ) : null}
              {job.status === "done" && job.url && props.releaseId && props.smartLinkUrl && job.format !== "wide" ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {job.smartLink.status === "done" ? (
                    <a
                      href={props.smartLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#7df0c4]/40 bg-[#7df0c4]/10 px-4 text-[13px] font-semibold text-[#7df0c4]"
                    >
                      <Check className="h-4 w-4" /> {job.smartLink.message} · Открыть
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void putIntoSmartLink(job)}
                      disabled={job.smartLink.status === "uploading"}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-[13px] font-semibold text-white hover:bg-white/[0.08] disabled:opacity-60"
                    >
                      {job.smartLink.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                      {job.smartLink.status === "uploading" ? `Загружаем… ${Math.round(job.smartLink.progress)}%` : "Поставить в шапку смарт-линка"}
                    </button>
                  )}
                  {job.smartLink.status === "error" ? <span className="text-[12px] text-rose-300">{job.smartLink.message}</span> : null}
                </div>
              ) : null}
              {job.status === "done" && job.url ? null : (
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#7b61ff] to-[#b3a6ff] transition-[width]" style={{ width: `${job.progress}%` }} />
                </div>
              )}
            </div>
          ))}
          <p className="text-[12px] leading-relaxed text-white/55">Видео собирается кадр за кадром прямо на устройстве — можно свернуть вкладку, кадры не потеряются.</p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold text-white">Ссылки для роликов</span>
          <span className="text-[12px] leading-relaxed text-white/60">
            Вставь ссылку в подпись или профиль — в статистике смарт-линка переходы посчитаются отдельно для каждой площадки.
          </span>
        </div>
        {props.smartLinkUrl ? (
          <div className="flex flex-col gap-2">
            {LINK_TARGETS.map((target) => {
              const url = `${props.smartLinkUrl}?utm_source=${target.source}&utm_medium=snippet`;
              return (
                <div key={target.id} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                  <PlatformGlyph id={target.id} size={30} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] font-semibold text-white">{target.name}</span>
                    <span className="truncate font-mono text-[11px] text-white/55">{url.replace(/^https?:\/\//u, "")}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void copy(url)}
                    aria-label={`Скопировать ссылку для ${target.name}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/80 hover:bg-white/[0.08]"
                  >
                    {copied === url ? <Check className="h-4 w-4 text-[#7df0c4]" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <span className="rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-[12px] text-white/60">
            Смарт-линк появится, когда релиз пройдёт модерацию. Тогда здесь будут ссылки для каждой площадки.
          </span>
        )}
      </div>
    </div>
  );
}
