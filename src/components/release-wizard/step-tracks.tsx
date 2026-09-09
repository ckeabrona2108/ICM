"use client";

import * as React from "react";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  FilePlus2,
  Music2,
  Pause,
  Pencil,
  Play,
  Trash2,
  Upload
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getTrackAuthorCoverage } from "@/lib/release-policy";
import { uploadBrowserBlobToStorage } from "@/lib/browser-storage-upload";

import {
  emptyTrackMeta,
  normalizeTrackMeta,
  useWizard,
  type TrackFile,
  type TrackMeta,
  type UploadedFileRef
} from "./wizard-context";
import { TrackMetaForm } from "./track-meta-form";
import { WizardCard } from "./wizard-ui";

const MAX_BYTES = 1024 * 1024 * 1024; // 1GB
const ALLOWED = [".wav", ".flac"];
const TRACK_ASSET_LIMITS = {
  syncedLyrics: {
    maxBytes: 20 * 1024 * 1024,
    allowedExtensions: [".ttml"]
  },
  ringtone: {
    maxBytes: 200 * 1024 * 1024,
    allowedExtensions: [".wav", ".flac"]
  },
  video: {
    maxBytes: 6 * 1024 * 1024 * 1024,
    allowedExtensions: [".mov", ".mp4", ".avi"]
  }
} as const;
type TrackAssetKind = keyof typeof TRACK_ASSET_LIMITS;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} ГБ`;
}

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(safe % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function fileExt(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function sanitizeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/gu, "_")
      .replace(/_+/gu, "_")
      .slice(0, 120) || "file.bin"
  );
}

function inferContentTypeFromName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (normalized.endsWith(".ttml")) return "application/ttml+xml";
  if (normalized.endsWith(".wav")) return "audio/wav";
  if (normalized.endsWith(".flac")) return "audio/flac";
  if (normalized.endsWith(".mp3")) return "audio/mpeg";
  if (normalized.endsWith(".mov")) return "video/quicktime";
  if (normalized.endsWith(".mp4")) return "video/mp4";
  if (normalized.endsWith(".avi")) return "video/x-msvideo";
  return "application/octet-stream";
}

function detectMobileUploadRisk(): boolean {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent || "";
  const vendor = window.navigator.vendor || "";
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/iu.test(ua);
  const isIos = /iPhone|iPad|iPod/iu.test(ua);
  const isWebView =
    /Instagram|FBAN|FBAV|FB_IAB|Line|MicroMessenger|Telegram|VKClient|VK\/|VKontakte/iu.test(ua) ||
    ((isIos && !/Safari/iu.test(ua)) || /wv/iu.test(ua));

  return isMobile || isWebView || /Apple/iu.test(vendor);
}

function resolveLocalObjectUrl(storageKey: string | undefined): string | undefined {
  const key = storageKey?.trim();
  if (!key) return undefined;
  const encoded = key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (!encoded) return undefined;
  return `/api/uploads/object/${encoded}`;
}

function toAbsoluteStorageUrl(rawUrl: string): string {
  const normalized = rawUrl.trim();
  if (/^https?:\/\//iu.test(normalized)) {
    return normalized;
  }

  if (typeof window !== "undefined") {
    return new URL(normalized, window.location.origin).toString();
  }

  return normalized;
}

function resolveTrackAudioUrl(track: TrackFile): string | undefined {
  const directUrl = track.audioUrl?.trim();
  if (directUrl) return directUrl;

  const uploadedUrl = track.audioUpload?.url?.trim();
  if (uploadedUrl) return uploadedUrl;

  return resolveLocalObjectUrl(track.audioUpload?.storageKey);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveAudioDuration(audio: HTMLAudioElement | null, fallbackSec = 0): number {
  if (!audio) return fallbackSec;

  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    return audio.duration;
  }

  if (audio.seekable.length > 0) {
    const seekableEnd = audio.seekable.end(audio.seekable.length - 1);
    if (Number.isFinite(seekableEnd) && seekableEnd > 0) {
      return seekableEnd;
    }
  }

  return fallbackSec;
}

function TrackAudioPreview({
  src,
  fallbackDurationSec
}: {
  src: string;
  fallbackDurationSec?: number;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [durationSec, setDurationSec] = React.useState(Math.max(0, fallbackDurationSec ?? 0));
  const [currentSec, setCurrentSec] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  const seekMax = Math.max(durationSec, currentSec, 0.01);
  const progress = seekMax > 0 ? clamp((currentSec / seekMax) * 100, 0, 100) : 0;

  const syncDurationFromAudio = () => {
    const resolved = resolveAudioDuration(audioRef.current, fallbackDurationSec ?? 0);
    if (resolved > 0) {
      setDurationSec(resolved);
    }
  };

  const onLoadedMetadata = () => {
    const audio = audioRef.current;
    if (!audio) return;
    syncDurationFromAudio();
    setCurrentSec(audio.currentTime || 0);
  };

  const onTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentSec(audio.currentTime || 0);
    if (durationSec <= 0) {
      syncDurationFromAudio();
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        // Browser can reject autoplay/playback; keep controls responsive.
      }
      return;
    }
    audio.pause();
  };

  const onSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Number(event.target.value);
    if (!Number.isFinite(next)) return;
    const bounded = clamp(next, 0, seekMax);
    audio.currentTime = bounded;
    setCurrentSec(bounded);
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.88),rgba(14,17,31,0.84))] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={syncDurationFromAudio}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={() => {
            void togglePlay();
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--ux-accent)]/30 bg-[var(--ux-accent)]/15 text-[#ddceff] transition-colors hover:bg-[var(--ux-accent)]/25"
          title={playing ? "Пауза" : "Воспроизвести"}
          aria-label={playing ? "Пауза" : "Воспроизвести"}
        >
          {playing ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5 fill-current" />
          )}
        </button>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <input
            type="range"
            min={0}
            max={seekMax}
            step={0.01}
            value={currentSec}
            onChange={onSeek}
            className="icm-audio-slider h-5 w-full"
            style={
              {
                "--slider-progress": `${progress}%`
              } as React.CSSProperties
            }
            aria-label="Позиция воспроизведения"
          />
          <div className="flex items-center justify-between px-0.5 text-[11px] leading-none tabular-nums text-white/42">
            <span>{formatDuration(currentSec)}</span>
            <span>{formatDuration(seekMax)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

async function readDuration(file: File): Promise<number | undefined> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const audio = document.createElement("audio");

    const duration = await new Promise<number | undefined>((resolve) => {
      const timeout = window.setTimeout(() => resolve(undefined), 4000);

      audio.preload = "metadata";
      audio.src = objectUrl;

      audio.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
          resolve(undefined);
          return;
        }
        resolve(audio.duration);
      };

      audio.onerror = () => {
        window.clearTimeout(timeout);
        resolve(undefined);
      };
    });

    return duration;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function StepTracks() {
  const { data, set } = useWizard();
  const [drag, setDrag] = React.useState(false);
  const [showMobileUploadNotice] = React.useState(() => detectMobileUploadRisk());
  const [error, setError] = React.useState<string | null>(null);
  const [openMetaId, setOpenMetaId] = React.useState<string | null>(null);
  const [loadingDuration, setLoadingDuration] = React.useState(false);
  const [uploadingAsset, setUploadingAsset] = React.useState<{
    trackId: string;
    kind: TrackAssetKind;
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const replaceInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const patchTrackMeta = (id: string, patch: Partial<TrackMeta>) => {
    set(
      "tracks",
      data.tracks.map((t) =>
        t.id === id
          ? { ...t, meta: normalizeTrackMeta({ ...t.meta, ...patch }) }
          : t
      )
    );
  };

  const uploadTrackAsset = async (params: {
    trackId: string;
    kind: TrackAssetKind;
    file: File;
  }) => {
      const { trackId, kind, file } = params;
      const ext = fileExt(file.name);
      const limits = TRACK_ASSET_LIMITS[kind];

      if (!(limits.allowedExtensions as readonly string[]).includes(ext)) {
        setError(
          `Файл «${file.name}» не подходит для этого поля. Разрешено: ${limits.allowedExtensions.join(", ")}.`
        );
        return;
      }

      if (file.size > limits.maxBytes) {
        setError(
          `Файл «${file.name}» превышает лимит ${formatSize(limits.maxBytes)}.`
        );
        return;
      }

      setError(null);
      setUploadingAsset({ trackId, kind });
      try {
        const contentType = file.type || inferContentTypeFromName(file.name);
        const uploaded = await uploadBrowserBlobToStorage({
          fileName: sanitizeFileName(file.name),
          contentType,
          kind: "audio",
          blob: file
        });

        const readUrl =
          resolveLocalObjectUrl(uploaded.key) ?? uploaded.publicUrl ?? uploaded.uploadUrl.split("?")[0] ?? uploaded.uploadUrl;
        const uploadedFile: UploadedFileRef = {
          storageKey: uploaded.key,
          url: toAbsoluteStorageUrl(readUrl),
          fileName: file.name,
          contentType,
          sizeBytes: file.size
        };

        if (kind === "syncedLyrics") {
          patchTrackMeta(trackId, { syncedLyricsFile: uploadedFile });
        } else if (kind === "ringtone") {
          patchTrackMeta(trackId, { ringtoneFile: uploadedFile });
        } else {
          patchTrackMeta(trackId, { videoFile: uploadedFile });
        }
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Не удалось загрузить файл. Попробуйте ещё раз."
        );
      } finally {
        setUploadingAsset((current) =>
          current?.trackId === trackId && current.kind === kind ? null : current
        );
      }
  };

  const removeTrackAsset = (params: { trackId: string; kind: TrackAssetKind }) => {
    const { trackId, kind } = params;
    if (kind === "syncedLyrics") {
      patchTrackMeta(trackId, { syncedLyricsFile: null });
    } else if (kind === "ringtone") {
      patchTrackMeta(trackId, { ringtoneFile: null });
    } else {
      patchTrackMeta(trackId, { videoFile: null });
    }
  };

  const replaceTrackAudio = React.useCallback(
    async (trackId: string, file: File) => {
      const ext = fileExt(file.name);
      if (!ALLOWED.includes(ext)) {
        setError(`${file.name}: недопустимый формат`);
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name}: больше 1 ГБ`);
        return;
      }

      setError(null);
      setLoadingDuration(true);
      try {
        const durationSec = await readDuration(file);

        set("tracks", data.tracks.map((track) => {
          if (track.id !== trackId) return track;
          if (track.audioUrl?.startsWith("blob:")) {
            URL.revokeObjectURL(track.audioUrl);
          }

          return {
            ...track,
            name: file.name,
            size: file.size,
            hasAudio: true,
            localAudioFile: file,
            audioUpload: null,
            audioUrl: URL.createObjectURL(file),
            durationSec,
            durationLabel: durationSec ? formatDuration(durationSec) : undefined
          };
        }));
      } finally {
        setLoadingDuration(false);
      }
    },
    [data.tracks, set]
  );

  const acceptFiles = React.useCallback(
    async (files: FileList | File[]) => {
      setError(null);
      setLoadingDuration(true);

      const accepted: TrackFile[] = [];
      const rejected: string[] = [];

      for (const file of Array.from(files)) {
        const ext = fileExt(file.name);
        if (!ALLOWED.includes(ext)) {
          rejected.push(`${file.name}: недопустимый формат`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          rejected.push(`${file.name}: больше 1 ГБ`);
          continue;
        }

        const durationSec = await readDuration(file);

        accepted.push({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          hasAudio: true,
          localAudioFile: file,
          audioUpload: null,
          durationSec,
          durationLabel: durationSec ? formatDuration(durationSec) : undefined,
          audioUrl: URL.createObjectURL(file),
          meta: emptyTrackMeta()
        });
      }

      if (rejected.length > 0) {
        setError(rejected.join("; "));
      }

      if (accepted.length > 0) {
        set("tracks", [...data.tracks, ...accepted]);
      }

      setLoadingDuration(false);
    },
    [data.tracks, set]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (e.dataTransfer.files) {
      void acceptFiles(e.dataTransfer.files);
    }
  };

  const addTrackWithoutAudio = () => {
    const number = data.tracks.length + 1;
    const metadataTrack: TrackFile = {
      id: crypto.randomUUID(),
      name: `track-${String(number).padStart(2, "0")}-without-audio`,
      size: 0,
      hasAudio: false,
      localAudioFile: null,
      audioUpload: null,
      meta: emptyTrackMeta()
    };

    set("tracks", [...data.tracks, metadataTrack]);
  };

  const removeTrack = (id: string) => {
    const removed = data.tracks.find((t) => t.id === id);
    if (removed?.audioUrl?.startsWith("blob:")) URL.revokeObjectURL(removed.audioUrl);
    setOpenMetaId((cur) => (cur === id ? null : cur));
    set("tracks", data.tracks.filter((t) => t.id !== id));
  };

  const moveTrack = (id: string, direction: "up" | "down") => {
    const index = data.tracks.findIndex((track) => track.id === id);
    if (index < 0) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= data.tracks.length) return;

    const next = data.tracks.slice();
    const [item] = next.splice(index, 1);
    next.splice(targetIndex, 0, item);
    set("tracks", next);
  };

  const sortTracks = (mode: "file" | "title") => {
    const next = data.tracks.slice().sort((a, b) => {
      if (mode === "title") {
        const at = (a.meta.title.trim() || a.name).toLowerCase();
        const bt = (b.meta.title.trim() || b.name).toLowerCase();
        return at.localeCompare(bt, "ru");
      }
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "ru");
    });
    set("tracks", next);
  };

  return (
    <div className="space-y-5">
      {showMobileUploadNotice ? (
        <div className="rounded-2xl border border-amber-400/20 bg-[linear-gradient(180deg,rgba(255,184,77,0.08),rgba(255,184,77,0.03))] px-4 py-3 text-sm text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="font-medium text-amber-100">Загрузка WAV и FLAC на телефоне может быть нестабильной</p>
          <p className="mt-1 text-[13px] leading-6 text-amber-50/80">
            Во встроенных браузерах VK, Telegram и других webview большие аудиофайлы иногда теряют доступ к локальному
            файлу до момента отправки релиза. Для более надёжной загрузки используйте Safari, Chrome или откройте сайт
            во внешнем браузере.
          </p>
        </div>
      ) : null}

      <div data-wizard-anchor="tracks-upload">
      <WizardCard className="!p-0">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-4 rounded-[28px] border px-6 py-16 text-center transition-colors",
            drag
              ? "border-[var(--ux-accent)]/60 bg-[var(--ux-accent)]/[0.05]"
              : "border-white/[0.08] bg-[radial-gradient(circle_at_top,var(--ux-accent-soft),transparent_48%),rgba(17,20,34,0.96)] hover:border-[var(--ux-accent)]/40 hover:bg-[rgba(19,22,38,0.98)]"
          )}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--ux-accent)]/12 text-[#d8d1ff]">
            <Upload className="h-4 w-4" />
          </div>
          <p className="text-[14px] text-white">
            Перенесите поочерёдно аудиофайлы сюда или нажмите, чтобы загрузить
          </p>
          <div className="text-[12px] leading-6 text-white/48">
            Формат: .wav, .flac
            <br />
            Максимальный размер: 1 ГБ
          </div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".wav,.flac,audio/wav,audio/x-wav,audio/flac"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) {
                void acceptFiles(e.target.files);
              }
              e.target.value = "";
            }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.08] px-6 py-4">
          <p className="text-[12px] text-white/48">
            Для видеорелиза можно добавить трек без аудиофайла.
          </p>
          <button
            type="button"
            onClick={addTrackWithoutAudio}
            className="inline-flex h-11 items-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 text-[12px] font-medium text-white transition-colors hover:border-[var(--ux-accent)]/35 hover:bg-white/[0.05]"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            Добавить трек без аудио
          </button>
        </div>

        {loadingDuration ? (
          <p className="border-t border-white/[0.08] bg-white/[0.02] px-5 py-2 text-[12px] text-white/54">
            Считываем длительность загруженных файлов...
          </p>
        ) : null}

        {error ? (
          <p className="border-t border-[#ff5d6d]/20 bg-[#ff5d6d]/[0.06] px-5 py-2 text-[12px] text-[#ff5d6d]">
            {error}
          </p>
        ) : null}
      </WizardCard>
      </div>

      {data.tracks.length > 0 ? (
        <div data-wizard-anchor="tracks-list">
        <WizardCard
          title={`Загруженные треки (${data.tracks.length})`}
          description="Заполните метаданные трека: название, участники, авторские права, язык, ISRC и дополнительные параметры."
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => sortTracks("file")}
              className="inline-flex h-11 items-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 text-[12px] font-medium text-white transition-colors hover:border-[var(--ux-accent)]/35 hover:bg-white/[0.05]"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              Сортировать по файлу
            </button>
            <button
              type="button"
              onClick={() => sortTracks("title")}
              className="inline-flex h-11 items-center gap-2 rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-4 text-[12px] font-medium text-white transition-colors hover:border-[var(--ux-accent)]/35 hover:bg-white/[0.05]"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              Сортировать по названию
            </button>
          </div>

          <div className="space-y-2">
            {data.tracks.map((t, i) => {
              const open = openMetaId === t.id;
              const previewUrl = t.hasAudio ? resolveTrackAudioUrl(t) : undefined;
              const displayTitle = t.meta.title.trim() || t.name;
              const authorCoverage = getTrackAuthorCoverage(t.meta.trackPersons);
              const authorsIncomplete =
                !authorCoverage.hasMusicAuthor || !authorCoverage.hasLyricsAuthor;
              const metaIncomplete =
                !t.meta.title.trim() ||
                !t.meta.metadataLanguage.trim() ||
                t.meta.trackPersons.length === 0 ||
                t.meta.trackPersons.some((p) => !p.name.trim() || !p.role) ||
                authorsIncomplete;

              return (
                <div
                  key={t.id}
                  className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(20,23,38,0.96),rgba(13,16,29,0.98))] shadow-[0_18px_40px_-34px_rgba(0,0,0,0.95)]"
                >
                  <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
                    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-white/[0.05] text-xs tabular-nums text-white/54">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Music2 className="h-4 w-4 shrink-0 text-white/38" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] text-white">{displayTitle}</p>
                        <p className="truncate text-xs text-white/40">{t.name}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {!t.hasAudio ? (
                        <span className="hidden shrink-0 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/62 sm:inline">
                          Без аудио
                        </span>
                      ) : null}

                      {metaIncomplete ? (
                        <span className="hidden shrink-0 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200/90 sm:inline">
                          Метаданные
                        </span>
                      ) : null}
                      {authorsIncomplete ? (
                        <span className="hidden shrink-0 rounded-md bg-rose-500/15 px-2 py-0.5 text-[10px] text-rose-200/90 sm:inline">
                          Авторы
                        </span>
                      ) : null}

                      <span className="shrink-0 text-[12px] tabular-nums text-white/42">
                        {t.hasAudio ? t.durationLabel ?? formatSize(t.size) : "—"}
                      </span>

                      <button
                        type="button"
                        onClick={() => moveTrack(t.id, "up")}
                        disabled={i === 0}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.08] text-white/42 transition-colors hover:border-[var(--ux-accent)]/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        title="Переместить вверх"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTrack(t.id, "down")}
                        disabled={i === data.tracks.length - 1}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.08] text-white/42 transition-colors hover:border-[var(--ux-accent)]/35 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        title="Переместить вниз"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        title={open ? "Свернуть" : "Заполнить метаданные трека"}
                        onClick={() => setOpenMetaId(open ? null : t.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1.5 text-[10.5px] transition-colors sm:gap-1.5 sm:px-2.5 sm:text-[11px]",
                          open
                            ? "border-[var(--ux-accent)]/50 bg-[var(--ux-accent)]/15 text-white"
                            : "border-white/[0.08] bg-white/[0.03] text-white/62 hover:border-[var(--ux-accent)]/40 hover:text-white"
                        )}
                      >
                        <Pencil className="h-3 w-3 shrink-0 opacity-80" />
                        <span className="max-w-[4.5rem] truncate sm:max-w-none">
                          {open ? "Свернуть" : "Метаданные"}
                        </span>
                        {open ? (
                          <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        )}
                      </button>

                      <input
                        ref={(node) => {
                          replaceInputRefs.current[t.id] = node;
                        }}
                        type="file"
                        accept=".wav,.flac,audio/wav,audio/x-wav,audio/flac"
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void replaceTrackAudio(t.id, file);
                          }
                          event.target.value = "";
                        }}
                      />

                      <button
                        type="button"
                        onClick={() => removeTrack(t.id)}
                        title="Удалить трек"
                        aria-label="Удалить трек"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.03] text-white/56 transition-colors hover:border-[#ff5d6d]/40 hover:bg-[#ff5d6d]/10 hover:text-[#ff8a96]"
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    </div>
                  </div>

                  {open ? (
                    <div className="border-t border-white/[0.08] bg-white/[0.02] px-3 py-4 sm:px-4">
                      <div className="mb-4 space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-[12px] text-white/45">Оригинальное название</p>
                            <p className="mt-1 break-words text-[15px] font-medium text-white">
                              {t.name}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => replaceInputRefs.current[t.id]?.click()}
                            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[12px] border border-white/[0.08] bg-white/[0.03] px-4 text-[12px] font-medium text-white/72 transition-colors hover:border-[var(--ux-accent)]/40 hover:text-white"
                            title="Заменить аудио с сохранением метаданных"
                          >
                            <Upload className="h-3.5 w-3.5 shrink-0 opacity-80" />
                            Заменить аудио
                          </button>
                        </div>
                        {previewUrl ? (
                          <TrackAudioPreview
                            src={previewUrl}
                            fallbackDurationSec={t.durationSec}
                          />
                        ) : null}
                      </div>
                      <TrackMetaForm
                        meta={t.meta}
                        hasAudio={t.hasAudio}
                        onPatch={(patch) => patchTrackMeta(t.id, patch)}
                        uploadingAssetKind={
                          uploadingAsset?.trackId === t.id ? uploadingAsset.kind : null
                        }
                        onUploadAsset={(kind, file) => {
                          void uploadTrackAsset({ trackId: t.id, kind, file });
                        }}
                        onRemoveAsset={(kind) => removeTrackAsset({ trackId: t.id, kind })}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </WizardCard>
        </div>
      ) : null}
    </div>
  );
}
