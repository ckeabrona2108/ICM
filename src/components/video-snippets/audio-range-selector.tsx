"use client";

import * as React from "react";

import { formatSnippetTime, getEffectiveSegment } from "@/lib/video-snippets";
import { cn } from "@/lib/utils";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildWaveformBars(audioBuffer: AudioBuffer, barCount: number) {
  const channelData = audioBuffer.getChannelData(0);
  if (!channelData.length || barCount <= 0) return [];

  const bars: number[] = [];
  const samplesPerBar = Math.max(1, Math.floor(channelData.length / barCount));

  for (let barIndex = 0; barIndex < barCount; barIndex += 1) {
    const start = barIndex * samplesPerBar;
    const end = Math.min(channelData.length, start + samplesPerBar);
    let peak = 0;
    let sumSquares = 0;

    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      const sample = channelData[sampleIndex] ?? 0;
      const absolute = Math.abs(sample);
      peak = Math.max(peak, absolute);
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
    bars.push(clamp(rms * 0.85 + peak * 0.55, 0.05, 1));
  }

  return bars;
}

function buildPlaceholderBars(trackDuration: number, barCount: number) {
  if (trackDuration <= 0 || barCount <= 0) return [];
  return Array.from({ length: barCount }, (_, index) => {
    const phase = (index / Math.max(1, barCount - 1)) * Math.PI * 6.5;
    const accent = 0.38 + Math.sin(phase) * 0.18 + Math.cos(phase * 0.37) * 0.12;
    const durationBoost = clamp(trackDuration / 240, 0.2, 1);
    return clamp(accent * durationBoost, 0.08, 0.95);
  });
}

export function AudioRangeSelector(props: {
  audioBuffer: AudioBuffer | null;
  audioDuration: number;
  audioMode?: "buffer" | "element" | "unsupported";
  durationSeconds: number;
  startTime: number;
  currentTime: number;
  onStartTimeChange: (time: number) => void;
  className?: string;
  accentColor?: string;
}) {
  const {
    audioBuffer,
    audioDuration,
    audioMode = "unsupported",
    durationSeconds,
    startTime,
    currentTime,
    onStartTimeChange,
    className,
    accentColor = "#38e8c5"
  } = props;
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = React.useRef(0);
  const draggingRef = React.useRef(false);
  const trackDuration = audioBuffer?.duration ?? audioDuration ?? 0;
  const bars = React.useMemo(() => {
    if (audioBuffer) return buildWaveformBars(audioBuffer, 160);
    return buildPlaceholderBars(trackDuration, 160);
  }, [audioBuffer, trackDuration]);

  const effectiveSegment = React.useMemo(
    () =>
      getEffectiveSegment({
        audioDuration: trackDuration,
        startTime,
        requestedDuration: durationSeconds
      }),
    [durationSeconds, startTime, trackDuration]
  );
  const maxStartTime = Math.max(0, trackDuration - effectiveSegment.durationSeconds);
  const safeStartTime = effectiveSegment.startTime;
  const safeEndTime = effectiveSegment.endTime;
  const selectionLeft = trackDuration > 0 ? (safeStartTime / trackDuration) * 100 : 0;
  const selectionWidth = trackDuration > 0 ? (effectiveSegment.durationSeconds / trackDuration) * 100 : 100;
  const playheadLeft = trackDuration > 0 ? clamp((currentTime / trackDuration) * 100, 0, 100) : 0;

  const timeFromClientX = React.useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container || trackDuration <= 0) return 0;
    const rect = container.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return ratio * trackDuration;
  }, [trackDuration]);

  const moveSelection = React.useCallback((clientX: number) => {
    const rawTime = timeFromClientX(clientX) - dragOffsetRef.current;
    onStartTimeChange(clamp(rawTime, 0, maxStartTime));
  }, [maxStartTime, onStartTimeChange, timeFromClientX]);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (trackDuration <= 0) return;
    const clickedTime = timeFromClientX(event.clientX);
    const insideSelection = clickedTime >= safeStartTime && clickedTime <= safeEndTime;
    dragOffsetRef.current = insideSelection ? clickedTime - safeStartTime : 0;
    draggingRef.current = true;
    if (!insideSelection) {
      onStartTimeChange(clamp(clickedTime, 0, maxStartTime));
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [audioBuffer, maxStartTime, onStartTimeChange, safeEndTime, safeStartTime, timeFromClientX, trackDuration]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    moveSelection(event.clientX);
  }, [moveSelection]);

  const handlePointerUp = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  if (trackDuration <= 0) {
    return (
      <div className={cn("rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-white/50", className)}>
        Загрузите аудио, чтобы выбрать участок трека.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-[12px] text-white/60">
        <span>Участок трека</span>
        <span>
          {formatSnippetTime(safeStartTime)} - {formatSnippetTime(safeEndTime)}
        </span>
      </div>
      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label="Audio range selector"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxStartTime)}
        aria-valuenow={Math.round(safeStartTime)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onStartTimeChange(clamp(safeStartTime - 1, 0, maxStartTime));
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            onStartTimeChange(clamp(safeStartTime + 1, 0, maxStartTime));
          }
        }}
        className="group relative h-28 cursor-grab overflow-hidden rounded-2xl border border-white/8 bg-[#0d1016] px-3 py-3 active:cursor-grabbing"
      >
        <div className="absolute inset-y-0 left-0 bg-black/34" style={{ width: `${selectionLeft}%` }} />
        <div
          className="absolute inset-y-0 rounded-xl border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
          style={{
            left: `${selectionLeft}%`,
            width: `${Math.min(selectionWidth, 100)}%`,
            background: `linear-gradient(180deg, ${accentColor}33 0%, ${accentColor}1a 100%)`,
            boxShadow: `0 0 0 1px ${accentColor}22, 0 18px 38px -24px ${accentColor}88`
          }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-black/38"
          style={{ width: `${Math.max(0, 100 - selectionLeft - Math.min(selectionWidth, 100))}%` }}
        />

        <div className="relative flex h-full items-end gap-[2px]">
          {bars.map((value, index) => {
            const progress = trackDuration > 0 ? (index / bars.length) * trackDuration : 0;
            const inRange = progress >= safeStartTime && progress <= safeEndTime;
            return (
              <div
                key={index}
                className="w-full rounded-full transition-colors"
                style={{
                  height: `${18 + value * 72}%`,
                  background: inRange
                    ? `linear-gradient(180deg, ${accentColor} 0%, rgba(255,255,255,0.85) 100%)`
                    : "linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(148,163,184,0.46) 100%)",
                  opacity: inRange ? 0.96 : 0.5
                }}
              />
            );
          })}
        </div>

        {audioMode !== "buffer" ? (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/8 bg-black/50 px-2 py-1 text-[10px] text-white/55 backdrop-blur-sm">
            Совместимая волна
          </div>
        ) : null}

        <div
          className="pointer-events-none absolute inset-y-2 w-[2px] rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.75)]"
          style={{ left: `calc(${playheadLeft}% - 1px)` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-white/45">
        <span>0:00</span>
        <span>{formatSnippetTime(trackDuration)}</span>
      </div>
    </div>
  );
}
