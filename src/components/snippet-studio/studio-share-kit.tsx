"use client";

import * as React from "react";
import { Archive, Check, Copy, Download, Film, ImageIcon, Loader2, Sparkles, X } from "lucide-react";

import { renderSnippetVideo, SnippetExportUnsupportedError } from "@/components/video-snippets/render-snippet-video";
import { cn } from "@/lib/utils";

import { SceneRenderer } from "./scene/render-scene";
import type { SceneAssets, SceneSettings } from "./scene/types";
import {
  buildShareKitCaptions,
  CANVAS_SECONDS,
  canvasSceneSettings,
  createLoopDrawer,
  renderSceneStill,
  SHARE_KIT_ITEMS,
  type ShareKitItemId,
  zipFiles
} from "./share-kit";

type ItemStatus = "queued" | "rendering" | "done" | "error" | "canceled";

interface KitJob {
  id: ShareKitItemId;
  status: ItemStatus;
  progress: number;
  message: string;
  blob: Blob | null;
  url: string | null;
}

const KIT_FPS = 30;

async function loadSceneFonts() {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.allSettled([
    document.fonts.load('700 64px "Space Grotesk"'),
    document.fonts.load('500 32px "Inter"'),
    document.fonts.load('600 32px "Inter"')
  ]);
}

function sizeLabel(blob: Blob) {
  const mb = blob.size / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1).replace(".", ",")} МБ` : `${Math.max(1, Math.round(blob.size / 1024))} КБ`;
}

export function StudioShareKit(props: {
  settings: SceneSettings;
  assets: SceneAssets;
  audioBuffer: AudioBuffer | null;
  clipStart: number;
  clipDuration: number;
  trackDuration: number;
  dropTrackTime: number | null;
  fileBase: string;
  smartLinkUrl: string | null;
  releaseDate: string | null;
  disabledReason: string | null;
}) {
  const [selected, setSelected] = React.useState<Record<ShareKitItemId, boolean>>({ story: true, square: true, canvas: true, poster: true, post: true });
  const [jobs, setJobs] = React.useState<KitJob[]>([]);
  const [zipping, setZipping] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const objectUrlsRef = React.useRef<string[]>([]);
  const isRendering = jobs.some((job) => job.status === "rendering" || job.status === "queued");
  const doneJobs = jobs.filter((job) => job.status === "done" && job.blob);

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

  const captions = React.useMemo(
    () => buildShareKitCaptions({ title: props.settings.text.title, artist: props.settings.text.artist, link: props.smartLinkUrl ?? "", releaseDate: props.releaseDate }),
    [props.settings.text.title, props.settings.text.artist, props.smartLinkUrl, props.releaseDate]
  );

  const updateJob = (id: ShareKitItemId, patch: Partial<KitJob>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  };

  const start = async () => {
    const audioBuffer = props.audioBuffer;
    const ids = SHARE_KIT_ITEMS.filter((item) => selected[item.id]).map((item) => item.id);
    if (!audioBuffer || ids.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Snapshot everything: edits made while rendering must not leak into the kit.
    const settings = structuredClone(props.settings);
    const assets = { ...props.assets };
    const { clipStart, clipDuration, trackDuration, dropTrackTime } = props;
    revokeObjectUrls();
    setJobs(ids.map((id) => ({ id, status: "queued", progress: 0, message: "В очереди", blob: null, url: null })));
    await loadSceneFonts();

    // Pictures first: they take a moment, so the artist has something to post right away.
    const order = [...ids].sort((a, b) => Number(SHARE_KIT_ITEMS.find((item) => item.id === a)?.kind === "video") - Number(SHARE_KIT_ITEMS.find((item) => item.id === b)?.kind === "video"));
    for (const id of order) {
      const item = SHARE_KIT_ITEMS.find((entry) => entry.id === id);
      if (!item) continue;
      if (controller.signal.aborted) {
        updateJob(id, { status: "canceled", message: "Отменено" });
        continue;
      }
      updateJob(id, { status: "rendering", message: item.kind === "image" ? "Рисуем…" : "Подготовка…" });
      try {
        let blob: Blob;
        if (item.kind === "image") {
          blob = await renderSceneStill(settings, assets, item.width, item.height, clipDuration);
        } else if (id === "canvas") {
          const loopDuration = Math.min(CANVAS_SECONDS, clipDuration);
          // The Canvas loops the hook of the clip: start on the drop when it is inside the clip.
          const loopStart = dropTrackTime !== null && dropTrackTime - 0.5 + loopDuration <= clipStart + clipDuration ? Math.max(clipStart, dropTrackTime - 0.5) : clipStart;
          const draw = createLoopDrawer(new SceneRenderer(), canvasSceneSettings(settings), assets, loopDuration);
          blob = await renderSnippetVideo({
            audioBuffer,
            startTime: loopStart,
            durationSeconds: loopDuration,
            width: item.width,
            height: item.height,
            fps: KIT_FPS,
            muted: true,
            signal: controller.signal,
            drawFrame: (context, width, height, playback) =>
              draw(context, width, height, { time: playback.currentTime - loopStart, trackTime: playback.currentTime, trackDuration, frequencyData: playback.frequencyData }),
            onProgress: ({ frame, totalFrames }) => updateJob(id, { progress: (frame / totalFrames) * 100, message: `Кадр ${frame} / ${totalFrames}` })
          });
        } else {
          const renderer = new SceneRenderer();
          blob = await renderSnippetVideo({
            audioBuffer,
            startTime: clipStart,
            durationSeconds: clipDuration,
            width: item.width,
            height: item.height,
            fps: KIT_FPS,
            signal: controller.signal,
            drawFrame: (context, width, height, playback) => {
              renderer.render(
                context,
                width,
                height,
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
            onProgress: ({ frame, totalFrames }) => updateJob(id, { progress: (frame / totalFrames) * 100, message: `Кадр ${frame} / ${totalFrames}` })
          });
        }
        const url = URL.createObjectURL(blob);
        objectUrlsRef.current.push(url);
        updateJob(id, { status: "done", progress: 100, blob, url, message: "Готово" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          updateJob(id, { status: "canceled", message: "Отменено" });
        } else if (error instanceof SnippetExportUnsupportedError) {
          updateJob(id, { status: "error", message: "Браузер не умеет собирать MP4 — открой студию в Chrome, Edge или Safari 17+" });
        } else {
          console.error("[ShareKit] render failed", error);
          updateJob(id, { status: "error", message: "Не получилось собрать" });
        }
      }
    }
    if (abortRef.current === controller) abortRef.current = null;
  };

  const downloadZip = async () => {
    if (doneJobs.length === 0) return;
    setZipping(true);
    try {
      const files = doneJobs.map((job) => ({ name: SHARE_KIT_ITEMS.find((item) => item.id === job.id)?.fileName ?? job.id, blob: job.blob as Blob }));
      const text = captions.map((caption) => `— ${caption.platform} —\n${caption.text}`).join("\n\n\n");
      files.push({ name: "podpisi.txt", blob: new Blob([text], { type: "text/plain;charset=utf-8" }) });
      const archive = await zipFiles(files);
      const url = URL.createObjectURL(archive);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${props.fileBase}-share-kit.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setZipping(false);
    }
  };

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);
    } catch {
      setCopied(null);
    }
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-2 sm:grid-cols-2">
        {SHARE_KIT_ITEMS.map((item) => {
          const job = jobs.find((entry) => entry.id === item.id);
          const Icon = item.kind === "video" ? Film : ImageIcon;
          return (
            <div
              key={item.id}
              className={cn(
                "flex flex-col gap-2.5 rounded-2xl border px-3.5 py-3 transition-colors",
                selected[item.id] ? "border-[#8b72ff]/60 bg-[#7b61ff]/10" : "border-white/[0.08] bg-white/[0.03]"
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-[#7b61ff]"
                  checked={selected[item.id]}
                  disabled={isRendering}
                  onChange={(event) => setSelected((current) => ({ ...current, [item.id]: event.target.checked }))}
                />
                <Icon className="h-5 w-5 shrink-0 text-[#b3a6ff]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-1.5 text-[14px] font-semibold text-white">
                    {item.label}
                    {item.id === "canvas" ? <span className="rounded-full bg-[#7df0c4]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#7df0c4]">new</span> : null}
                  </span>
                  <span className="text-[12px] leading-snug text-white/60">
                    {item.hint} · {item.width}×{item.height}
                  </span>
                </span>
              </label>
              {job ? (
                job.status === "done" && job.url && job.blob ? (
                  <a
                    href={job.url}
                    download={`${props.fileBase}-${item.fileName}`}
                    className="inline-flex h-9 items-center gap-2 self-start rounded-lg bg-white px-3 text-[12px] font-semibold text-[#14112e] hover:bg-white/90"
                  >
                    <Download className="h-3.5 w-3.5" /> Скачать · {sizeLabel(job.blob)}
                  </a>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <span className={cn("text-[12px]", job.status === "error" ? "text-rose-300" : "text-white/65")}>{job.message}</span>
                    {job.status === "rendering" || job.status === "queued" ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#7b61ff] to-[#b3a6ff] transition-[width]" style={{ width: `${job.progress}%` }} />
                      </div>
                    ) : null}
                  </div>
                )
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void start()}
          disabled={isRendering || Boolean(props.disabledReason) || selectedCount === 0}
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#7b61ff] px-5 text-[14px] font-semibold text-white shadow-[0_10px_40px_-10px_rgba(123,97,255,0.8)] transition-colors hover:bg-[#8b72ff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {isRendering ? "Собираем кит…" : `Собрать Share Kit · ${selectedCount}`}
        </button>
        {isRendering ? (
          <button type="button" onClick={() => abortRef.current?.abort()} className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-[14px] font-medium text-white/75 hover:text-white">
            <X className="h-4 w-4" /> Отменить
          </button>
        ) : null}
        {doneJobs.length > 0 && !isRendering ? (
          <button
            type="button"
            onClick={() => void downloadZip()}
            disabled={zipping}
            className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#7df0c4]/40 bg-[#7df0c4]/10 px-5 text-[14px] font-semibold text-[#7df0c4] hover:bg-[#7df0c4]/15 disabled:opacity-60"
          >
            {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
            Скачать всё архивом
          </button>
        ) : null}
        {props.disabledReason ? <span className="text-[13px] text-white/60">{props.disabledReason}</span> : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4">
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-semibold text-white">Подписи к постам</span>
          <span className="text-[12px] leading-relaxed text-white/60">Собраны из названия, артиста и смарт-линка. Тоже лежат в архиве файлом podpisi.txt.</span>
        </div>
        <div className="grid gap-2 lg:grid-cols-3">
          {captions.map((caption) => (
            <div key={caption.id} className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-white">{caption.platform}</span>
                <button
                  type="button"
                  onClick={() => void copy(caption.id, caption.text)}
                  aria-label={`Скопировать подпись для ${caption.platform}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-white/80 hover:bg-white/[0.08]"
                >
                  {copied === caption.id ? <Check className="h-4 w-4 text-[#7df0c4]" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="whitespace-pre-line break-words text-[12px] leading-relaxed text-white/75">{caption.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
