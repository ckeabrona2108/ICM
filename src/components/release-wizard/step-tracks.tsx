"use client";

import * as React from "react";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  FilePlus2,
  Music2,
  Pencil,
  Trash2,
  Upload
} from "lucide-react";

import { cn } from "@/lib/utils";
import { getTrackAuthorCoverage } from "@/lib/release-policy";

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
    allowedExtensions: [".wav", ".flac", ".mp3"]
  },
  video: {
    maxBytes: 6 * 1024 * 1024 * 1024,
    allowedExtensions: [".mov", ".mp4", ".avi"]
  }
} as const;
type TrackAssetKind = keyof typeof TRACK_ASSET_LIMITS;

interface PresignedUploadResponse {
  key: string;
  url: string;
  method?: string;
  fields?: Record<string, string>;
  mock?: boolean;
}

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
  const [error, setError] = React.useState<string | null>(null);
  const [openMetaId, setOpenMetaId] = React.useState<string | null>(null);
  const [loadingDuration, setLoadingDuration] = React.useState(false);
  const [uploadingAsset, setUploadingAsset] = React.useState<{
    trackId: string;
    kind: TrackAssetKind;
  } | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

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
        const targetResponse = await fetch("/api/uploads/presigned", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: sanitizeFileName(file.name),
            contentType
          })
        });

        const target = (await targetResponse.json().catch(() => null)) as
          | PresignedUploadResponse
          | { error?: string }
          | null;

        if (!targetResponse.ok || !target || !("url" in target) || !target.url || !target.key) {
          const fallback =
            target && "error" in target && typeof target.error === "string"
              ? target.error
              : "Не удалось получить ссылку для загрузки файла.";
          throw new Error(fallback);
        }

        const uploadResponse = await fetch(target.url, {
          method: target.method ?? "PUT",
          headers: {
            "Content-Type": contentType
          },
          body: file
        });

        if (!uploadResponse.ok) {
          throw new Error("Ошибка загрузки файла в хранилище.");
        }

        const uploadedFile: UploadedFileRef = {
          storageKey: target.key,
          url: target.url.split("?")[0] ?? target.url,
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
    <div className="space-y-4">
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
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            drag
              ? "border-[#7b3df5]/60 bg-[#7b3df5]/[0.05]"
              : "border-white/[0.10] hover:border-[#7b3df5]/40 hover:bg-white/[0.02]"
          )}
        >
          <div className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.05] text-white/65">
            <Upload className="h-4 w-4" />
          </div>
          <p className="text-[14px] text-white/85">
            Перенесите поочерёдно аудиофайлы сюда или нажмите, чтобы загрузить
          </p>
          <div className="text-[12px] text-white/45">
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] px-5 py-3">
          <p className="text-[12px] text-white/55">
            Для видеорелиза можно добавить трек без аудиофайла.
          </p>
          <button
            type="button"
            onClick={addTrackWithoutAudio}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/85 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]"
          >
            <FilePlus2 className="h-3.5 w-3.5" />
            Добавить трек без аудио
          </button>
        </div>

        {loadingDuration ? (
          <p className="border-t border-white/[0.06] bg-white/[0.03] px-5 py-2 text-[12px] text-white/70">
            Считываем длительность загруженных файлов...
          </p>
        ) : null}

        {error ? (
          <p className="border-t border-[#ff5d6d]/20 bg-[#ff5d6d]/[0.06] px-5 py-2 text-[12px] text-[#ff5d6d]">
            {error}
          </p>
        ) : null}
      </WizardCard>

      {data.tracks.length > 0 ? (
        <WizardCard
          title={`Загруженные треки (${data.tracks.length})`}
          description="Заполните метаданные трека: название, участники, авторские права, язык, ISRC и дополнительные параметры."
        >
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => sortTracks("file")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/85 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              Сортировать по файлу
            </button>
            <button
              type="button"
              onClick={() => sortTracks("title")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[12px] text-white/85 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06]"
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              Сортировать по названию
            </button>
          </div>

          <div className="space-y-2">
            {data.tracks.map((t, i) => {
              const open = openMetaId === t.id;
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
                  className="overflow-hidden rounded-lg border border-white/[0.05] bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/[0.04] text-[11px] tabular-nums text-white/55">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Music2 className="h-3.5 w-3.5 shrink-0 text-white/45" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-white/85">{displayTitle}</p>
                      <p className="truncate text-[11px] text-white/40">{t.name}</p>
                    </div>

                    {!t.hasAudio ? (
                      <span className="hidden shrink-0 rounded-md bg-indigo-500/15 px-2 py-0.5 text-[10px] text-indigo-200/95 sm:inline">
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

                    <span className="shrink-0 text-[12px] tabular-nums text-white/45">
                      {t.hasAudio ? t.durationLabel ?? formatSize(t.size) : "—"}
                    </span>

                    <button
                      type="button"
                      onClick={() => moveTrack(t.id, "up")}
                      disabled={i === 0}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.08] text-white/45 transition-colors hover:border-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                      title="Переместить вверх"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveTrack(t.id, "down")}
                      disabled={i === data.tracks.length - 1}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/[0.08] text-white/45 transition-colors hover:border-white/[0.16] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
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
                          ? "border-[#7b3df5]/50 bg-[#7b3df5]/15 text-white"
                          : "border-white/[0.08] bg-white/[0.03] text-white/75 hover:border-[#7b3df5]/40 hover:text-white"
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

                    <button
                      type="button"
                      onClick={() => removeTrack(t.id)}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white/45 transition-colors hover:bg-[#ff5d6d]/10 hover:text-[#ff5d6d]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {open ? (
                    <div className="border-t border-white/[0.05] bg-black/25 px-3 py-4 sm:px-4">
                      <TrackMetaForm
                        meta={t.meta}
                        fileName={t.name}
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
      ) : null}
    </div>
  );
}
