"use client";

import * as React from "react";
import { Loader2, Pause, Play } from "lucide-react";

import {
  AUDIO_CLIP_MAX_SECONDS,
  AUDIO_CLIP_MIN_SECONDS,
  normalizeAudioClipRange
} from "@/lib/browser-audio-clip";

interface Props {
  peaks: number[];
  sourceDurationSec: number;
  startSec: number;
  durationSec: number;
  playbackTimeSec: number | null;
  loading?: boolean;
  disabled?: boolean;
  onChange: (startSec: number, durationSec: number) => void;
  onPreview: () => void;
}

type DragMode = "move" | "start" | "end";

function formatTime(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = Math.floor(safe % 60);
  const tenths = Math.floor((safe % 1) * 10);
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${tenths}`;
}

export function AudioWaveformRange({
  peaks,
  sourceDurationSec,
  startSec,
  durationSec,
  playbackTimeSec,
  loading = false,
  disabled = false,
  onChange,
  onPreview
}: Props) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<{
    mode: DragMode;
    pointerId: number;
    anchorSec: number;
    initialStartSec: number;
    initialDurationSec: number;
  } | null>(null);

  const selectionLeft = sourceDurationSec > 0 ? (startSec / sourceDurationSec) * 100 : 0;
  const selectionWidth = sourceDurationSec > 0 ? (durationSec / sourceDurationSec) * 100 : 0;
  const playbackLeft =
    playbackTimeSec !== null && sourceDurationSec > 0
      ? (playbackTimeSec / sourceDurationSec) * 100
      : null;
  const isPlaying = playbackTimeSec !== null;

  function secondsFromPointer(clientX: number): number {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return Math.min(
      sourceDurationSec,
      Math.max(0, ((clientX - rect.left) / rect.width) * sourceDurationSec)
    );
  }

  function beginDrag(mode: DragMode, event: React.PointerEvent) {
    if (disabled || sourceDurationSec < AUDIO_CLIP_MIN_SECONDS) return;
    event.preventDefault();
    event.stopPropagation();
    const pointerSec = secondsFromPointer(event.clientX);
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      anchorSec: mode === "move" ? pointerSec - startSec : 0,
      initialStartSec: startSec,
      initialDurationSec: durationSec
    };
    rootRef.current?.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pointerSec = secondsFromPointer(event.clientX);

    if (drag.mode === "move") {
      const next = normalizeAudioClipRange(
        { startSec: pointerSec - drag.anchorSec, durationSec: drag.initialDurationSec },
        sourceDurationSec
      );
      onChange(next.startSec, next.durationSec);
      return;
    }

    if (drag.mode === "start") {
      const fixedEnd = drag.initialStartSec + drag.initialDurationSec;
      const nextStart = Math.min(
        fixedEnd - AUDIO_CLIP_MIN_SECONDS,
        Math.max(0, fixedEnd - AUDIO_CLIP_MAX_SECONDS, pointerSec)
      );
      onChange(nextStart, fixedEnd - nextStart);
      return;
    }

    const nextDuration = Math.min(
      AUDIO_CLIP_MAX_SECONDS,
      sourceDurationSec - drag.initialStartSec,
      Math.max(AUDIO_CLIP_MIN_SECONDS, pointerSec - drag.initialStartSec)
    );
    onChange(drag.initialStartSec, nextDuration);
  }

  function endDrag(event: React.PointerEvent) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    rootRef.current?.releasePointerCapture(event.pointerId);
  }

  function selectAtPointer(event: React.PointerEvent) {
    if (disabled || sourceDurationSec < AUDIO_CLIP_MIN_SECONDS) return;
    event.preventDefault();
    const pointerSec = secondsFromPointer(event.clientX);
    const next = normalizeAudioClipRange(
      { startSec: pointerSec - durationSec / 2, durationSec },
      sourceDurationSec
    );
    onChange(next.startSec, next.durationSec);
    dragRef.current = {
      mode: "move",
      pointerId: event.pointerId,
      anchorSec: pointerSec - next.startSec,
      initialStartSec: next.startSec,
      initialDurationSec: next.durationSec
    };
    rootRef.current?.setPointerCapture(event.pointerId);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4 text-white/50">
          <span>Начало <strong className="ml-1 text-white">{formatTime(startSec)}</strong></span>
          <span>Конец <strong className="ml-1 text-white">{formatTime(startSec + durationSec)}</strong></span>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.08] px-2.5 py-1 font-semibold text-emerald-100">
          {durationSec.toFixed(1)} сек.
        </span>
      </div>

      <div
        ref={rootRef}
        role="slider"
        aria-label="Выбранный фрагмент трека"
        aria-valuemin={0}
        aria-valuemax={sourceDurationSec}
        aria-valuenow={startSec}
        tabIndex={0}
        onPointerDown={selectAtPointer}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-32 touch-none select-none overflow-hidden rounded-2xl border border-white/[0.08] bg-[#080a0f] px-3 py-5"
      >
        {loading ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center gap-2 bg-black/45 text-sm text-white/55">
            <Loader2 className="h-4 w-4 animate-spin" /> Строим волну трека…
          </div>
        ) : null}

        <div className="flex h-full items-center gap-[2px]" aria-hidden="true">
          {(peaks.length > 0 ? peaks : Array.from({ length: 96 }, () => 0.12)).map((peak, index) => (
            <span
              key={index}
              className="min-w-0 flex-1 rounded-full bg-white/20"
              style={{ height: `${Math.max(8, peak * 100)}%` }}
            />
          ))}
        </div>

        <div
          className="absolute bottom-2 top-2 z-10 cursor-grab rounded-xl border border-emerald-200/70 bg-emerald-200/[0.12] shadow-[0_0_32px_rgba(110,231,183,0.12)] backdrop-brightness-125 active:cursor-grabbing"
          style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }}
          onPointerDown={(event) => beginDrag("move", event)}
        >
          <button
            type="button"
            aria-label="Изменить начало фрагмента"
            className="absolute -left-1.5 top-1/2 h-12 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border border-emerald-100/80 bg-emerald-200 shadow-[0_0_18px_rgba(110,231,183,0.45)]"
            onPointerDown={(event) => beginDrag("start", event)}
          />
          <button
            type="button"
            aria-label="Изменить конец фрагмента"
            className="absolute -right-1.5 top-1/2 h-12 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border border-emerald-100/80 bg-emerald-200 shadow-[0_0_18px_rgba(110,231,183,0.45)]"
            onPointerDown={(event) => beginDrag("end", event)}
          />
        </div>

        {playbackLeft !== null && playbackTimeSec! >= startSec && playbackTimeSec! <= startSec + durationSec ? (
          <span
            className="pointer-events-none absolute bottom-2 top-2 z-20 w-px bg-white shadow-[0_0_10px_rgba(255,255,255,0.85)]"
            style={{ left: `${playbackLeft}%` }}
          />
        ) : null}
      </div>

      <button
        type="button"
        disabled={disabled || loading}
        onClick={onPreview}
        className="mt-3 inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 px-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-50"
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {isPlaying ? "Пауза" : "Прослушать"} {formatTime(startSec)}–{formatTime(startSec + durationSec)}
      </button>
    </div>
  );
}
