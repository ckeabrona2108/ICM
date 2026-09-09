"use client";

import * as React from "react";
import { CheckCircle2, Loader2, Scissors, Upload } from "lucide-react";

import { AudioWaveformRange } from "@/components/releases/audio-waveform-range";
import { uploadBrowserBlobToStorage } from "@/lib/browser-storage-upload";
import {
  AUDIO_CLIP_MAX_SECONDS,
  AUDIO_CLIP_MIN_SECONDS,
  createWavClipFromBlob,
  createWavClipFromUrl,
  loadAudioWaveformFromUrl,
  normalizeAudioClipRange
} from "@/lib/browser-audio-clip";
import type { CabinetTrack } from "@/lib/cabinet-types";
import {
  SCENE_PREVIEW_MAX_SIZE_BYTES,
  type SceneShowcaseState
} from "@/lib/scene-showcase-state";

interface Props {
  releaseId: string;
  tracks: CabinetTrack[];
  initialState: SceneShowcaseState;
}

export function ReleaseSceneSettingsClient({ releaseId, tracks, initialState }: Props) {
  const [state, setState] = React.useState(initialState);
  const [trackIndex, setTrackIndex] = React.useState(initialState.trackIndex || tracks[0]?.num || 1);
  const [sourceDurationSec, setSourceDurationSec] = React.useState(0);
  const [clipStartSec, setClipStartSec] = React.useState(0);
  const [clipDurationSec, setClipDurationSec] = React.useState(AUDIO_CLIP_MAX_SECONDS);
  const [waveformPeaks, setWaveformPeaks] = React.useState<number[]>([]);
  const [waveformLoading, setWaveformLoading] = React.useState(false);
  const [sourceBlob, setSourceBlob] = React.useState<Blob | null>(null);
  const [playbackTimeSec, setPlaybackTimeSec] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const playbackTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedTrack = tracks.find((track) => track.num === trackIndex) ?? tracks[0];

  React.useEffect(() => {
    return () => {
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    };
  }, []);

  React.useEffect(() => {
    const duration = selectedTrack?.durationSec ?? 0;
    setSourceDurationSec(duration);
    setClipStartSec(0);
    setClipDurationSec(Math.min(AUDIO_CLIP_MAX_SECONDS, Math.max(AUDIO_CLIP_MIN_SECONDS, duration || AUDIO_CLIP_MAX_SECONDS)));
  }, [selectedTrack?.num, selectedTrack?.durationSec]);

  React.useEffect(() => {
    let cancelled = false;
    setWaveformPeaks([]);
    setSourceBlob(null);
    setPlaybackTimeSec(null);
    if (!selectedTrack?.audioUrl) {
      setWaveformLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setWaveformLoading(true);
    void loadAudioWaveformFromUrl(selectedTrack.audioUrl)
      .then((result) => {
        if (cancelled) return;
        setWaveformPeaks(result.peaks);
        setSourceBlob(result.blob);
        setSourceDurationSec(result.durationSec);
        const initialRange = normalizeAudioClipRange(
          { startSec: 0, durationSec: Math.min(AUDIO_CLIP_MAX_SECONDS, result.durationSec) },
          result.durationSec
        );
        setClipStartSec(initialRange.startSec);
        setClipDurationSec(initialRange.durationSec);
      })
      .catch((waveformError) => {
        if (cancelled) return;
        setError(waveformError instanceof Error ? waveformError.message : "Не удалось построить волну трека.");
      })
      .finally(() => {
        if (!cancelled) setWaveformLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTrack?.audioUrl]);

  async function uploadPreviewBlob(blob: Blob, durationSec: number, baseName: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (blob.size > SCENE_PREVIEW_MAX_SIZE_BYTES) throw new Error("Фрагмент должен быть меньше 20 МБ.");

      const uploaded = await uploadBrowserBlobToStorage({
        fileName: `${baseName.replace(/\.[^.]+$/u, "")}-preview.wav`,
        contentType: "audio/wav",
        kind: "audio",
        blob
      });
      const response = await fetch(`/api/releases/${releaseId}/scene`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: true,
          trackIndex,
          previewAsset: {
            storageKey: uploaded.key,
            fileName: `${baseName.replace(/\.[^.]+$/u, "")}-preview.wav`,
            contentType: "audio/wav",
            size: blob.size,
            durationSec
          }
        })
      });
      const payload = await response.json().catch(() => null) as { state?: SceneShowcaseState; error?: string } | null;
      if (!response.ok || !payload?.state) throw new Error(payload?.error || "Не удалось добавить релиз на витрину.");
      setState(payload.state);
      setMessage("Фрагмент опубликован. Релиз участвует в выборе слушателей.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить фрагмент.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function uploadReadyFile(file: File) {
    setBusy(true);
    setError(null);
    setMessage("Подготавливаем WAV-фрагмент…");
    try {
      if (!file.type.startsWith("audio/")) throw new Error("Выберите аудиофайл.");
      const clip = await createWavClipFromBlob(file, {
        startSec: 0,
        durationSec: AUDIO_CLIP_MAX_SECONDS
      });
      await uploadPreviewBlob(clip.blob, clip.durationSec, file.name);
    } catch (clipError) {
      setError(clipError instanceof Error ? clipError.message : "Не удалось подготовить фрагмент.");
      setMessage(null);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateClipRange(nextStart: number, nextDuration: number, duration = sourceDurationSec) {
    const normalized = normalizeAudioClipRange(
      { startSec: nextStart, durationSec: nextDuration },
      duration
    );
    setClipStartSec(normalized.startSec);
    setClipDurationSec(normalized.durationSec);
  }

  async function previewSelection() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
      setPlaybackTimeSec(null);
      return;
    }

    if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    audio.currentTime = clipStartSec;
    setPlaybackTimeSec(clipStartSec);
    try {
      await audio.play();
    } catch (playbackError) {
      setPlaybackTimeSec(null);
      setError(
        playbackError instanceof Error
          ? playbackError.message
          : "Не удалось воспроизвести выбранный фрагмент."
      );
      return;
    }
    playbackTimerRef.current = setTimeout(() => {
      audio.pause();
      playbackTimerRef.current = null;
      setPlaybackTimeSec(null);
    }, clipDurationSec * 1000);
  }

  async function publishSelection() {
    if (!selectedTrack?.audioUrl) return;
    setBusy(true);
    setError(null);
    setMessage("Вырезаем выбранный фрагмент из загруженного трека…");
    try {
      const range = { startSec: clipStartSec, durationSec: clipDurationSec };
      const clip = sourceBlob
        ? await createWavClipFromBlob(sourceBlob, range)
        : await createWavClipFromUrl(selectedTrack.audioUrl, range);
      await uploadPreviewBlob(clip.blob, clip.durationSec, selectedTrack.title || `track-${trackIndex}`);
    } catch (clipError) {
      setError(clipError instanceof Error ? clipError.message : "Не удалось подготовить фрагмент.");
      setMessage(null);
      setBusy(false);
    }
  }

  async function disableShowcase() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/releases/${releaseId}/scene`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false, trackIndex, previewAsset: state.previewAsset })
    });
    const payload = await response.json().catch(() => null) as { state?: SceneShowcaseState; error?: string } | null;
    setBusy(false);
    if (!response.ok || !payload?.state) {
      setError(payload?.error || "Не удалось убрать релиз с витрины.");
      return;
    }
    setState(payload.state);
    setMessage("Релиз убран из выбора слушателей.");
  }

  return (
    <div className="mt-4 rounded-2xl border border-[#7b3df5]/20 bg-[#7b3df5]/[0.055] p-4 sm:p-5">
      <p className="text-sm leading-relaxed text-white/55">
        Выберите трек и загрузите отдельный фрагмент длительностью 5–30 секунд. Полный мастер публично не используется.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <select
          value={trackIndex}
          onChange={(event) => setTrackIndex(Number(event.target.value))}
          disabled={busy}
          className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-[#7b3df5]/60"
        >
          {tracks.map((track) => <option key={track.num} value={track.num}>{track.num}. {track.title}</option>)}
        </select>
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadReadyFile(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#7b3df5] px-5 text-sm font-bold text-white shadow-[0_12px_30px_-16px_rgba(123,61,245,0.9)] transition hover:bg-[#8b5cf6] disabled:opacity-55"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Загрузить готовый фрагмент
        </button>
      </div>

      {selectedTrack?.audioUrl ? (
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <div className="flex items-start gap-3">
            <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
            <div>
              <p className="text-sm font-semibold text-white">Выбрать фрагмент из загруженного трека</p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">
                Укажите начало и длительность. На витрину отправится только новый WAV-файл, полный мастер останется закрытым.
              </p>
            </div>
          </div>

          <audio
            ref={audioRef}
            src={selectedTrack.audioUrl}
            preload="metadata"
            className="hidden"
            onTimeUpdate={(event) => {
              const currentTime = event.currentTarget.currentTime;
              if (currentTime >= clipStartSec + clipDurationSec) {
                event.currentTarget.pause();
                setPlaybackTimeSec(null);
                return;
              }
              setPlaybackTimeSec(currentTime);
            }}
            onPause={() => setPlaybackTimeSec(null)}
            onEnded={() => {
              if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
              playbackTimerRef.current = null;
              setPlaybackTimeSec(null);
            }}
            onLoadedMetadata={(event) => {
              const duration = event.currentTarget.duration;
              if (!Number.isFinite(duration)) return;
              setSourceDurationSec(duration);
              updateClipRange(clipStartSec, Math.min(AUDIO_CLIP_MAX_SECONDS, duration), duration);
            }}
          />

          {sourceDurationSec >= AUDIO_CLIP_MIN_SECONDS ? (
            <div className="mt-4 grid gap-4">
              <AudioWaveformRange
                peaks={waveformPeaks}
                sourceDurationSec={sourceDurationSec}
                startSec={clipStartSec}
                durationSec={clipDurationSec}
                playbackTimeSec={playbackTimeSec}
                loading={waveformLoading}
                disabled={busy}
                onChange={updateClipRange}
                onPreview={() => void previewSelection()}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void publishSelection()}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#7b3df5] px-4 text-sm font-bold text-white shadow-[0_12px_30px_-16px_rgba(123,61,245,0.9)] transition hover:bg-[#8b5cf6] disabled:opacity-55"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
                  Опубликовать выбранное
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-white/40">
          Исходный трек недоступен для обрезки. Можно загрузить отдельный готовый фрагмент кнопкой выше.
        </p>
      )}

      {state.enabled ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300/15 bg-black/20 px-3 py-2.5 text-sm">
          <span className="inline-flex items-center gap-2 text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Релиз на витрине</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void disableShowcase()}
            className="rounded-lg border border-rose-400/25 bg-rose-400/[0.07] px-3 py-1.5 font-semibold text-rose-300 transition hover:border-rose-400/45 hover:bg-rose-400/[0.13] hover:text-rose-200 disabled:opacity-50"
          >
            Убрать с витрины
          </button>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-emerald-200">{message}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
    </div>
  );
}
