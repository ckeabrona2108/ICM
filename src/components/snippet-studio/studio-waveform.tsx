"use client";

import * as React from "react";

import { formatSnippetTime } from "@/lib/video-snippets";

const BAR_COUNT = 140;

function buildBars(buffer: AudioBuffer | null) {
  if (!buffer) return null;
  const data = buffer.getChannelData(0);
  const perBar = Math.max(1, Math.floor(data.length / BAR_COUNT));
  const bars: number[] = [];
  for (let bar = 0; bar < BAR_COUNT; bar += 1) {
    let sum = 0;
    let peak = 0;
    const start = bar * perBar;
    // Sampling every 8th sample is plenty for a 140-bar overview.
    for (let index = start; index < Math.min(data.length, start + perBar); index += 8) {
      const value = Math.abs(data[index] ?? 0);
      sum += value * value;
      peak = Math.max(peak, value);
    }
    bars.push(Math.min(1, Math.sqrt(sum / Math.max(1, perBar / 8)) * 1.6 + peak * 0.35));
  }
  const max = Math.max(...bars, 0.01);
  return bars.map((value) => Math.max(0.06, value / max));
}

export function StudioWaveform(props: {
  audioBuffer: AudioBuffer | null;
  trackDuration: number;
  clipStart: number;
  clipDuration: number;
  currentTime: number;
  isPlaying: boolean;
  markers: Array<{ time: number; label: string; tone: "violet" | "mint" | "muted" }>;
  onClipStartChange: (time: number) => void;
}) {
  const { trackDuration, clipStart, clipDuration, onClipStartChange, markers: rawMarkers } = props;
  const bars = React.useMemo(() => buildBars(props.audioBuffer), [props.audioBuffer]);
  // Markers closer than ~6% of the track share one label instead of overlapping.
  const markers = React.useMemo(() => {
    const merged: typeof rawMarkers = [];
    for (const marker of [...rawMarkers].sort((a, b) => a.time - b.time)) {
      const previous = merged[merged.length - 1];
      if (previous && trackDuration > 0 && (marker.time - previous.time) / trackDuration < 0.06) {
        merged[merged.length - 1] = { ...previous, label: `${previous.label} · ${marker.label}`, tone: marker.tone };
      } else {
        merged.push(marker);
      }
    }
    return merged;
  }, [rawMarkers, trackDuration]);
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{ pointerX: number; startTime: number } | null>(null);

  const toPercent = (time: number) => (trackDuration > 0 ? (time / trackDuration) * 100 : 0);
  const maxStart = Math.max(0, trackDuration - clipDuration);

  const timeAtPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || trackDuration <= 0) return 0;
    return ((clientX - rect.left) / rect.width) * trackDuration;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (trackDuration <= 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const time = timeAtPointer(event.clientX);
    const insideSelection = time >= clipStart && time <= clipStart + clipDuration;
    const nextStart = insideSelection ? clipStart : Math.min(maxStart, Math.max(0, time - clipDuration / 2));
    if (!insideSelection) onClipStartChange(nextStart);
    dragRef.current = { pointerX: event.clientX, startTime: nextStart };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const delta = ((event.clientX - drag.pointerX) / rect.width) * trackDuration;
    onClipStartChange(Math.min(maxStart, Math.max(0, drag.startTime + delta)));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 5 : 1;
    if (event.key === "ArrowLeft") onClipStartChange(Math.max(0, clipStart - step));
    if (event.key === "ArrowRight") onClipStartChange(Math.min(maxStart, clipStart + step));
  };

  const playheadVisible = props.isPlaying && props.currentTime >= clipStart && props.currentTime <= clipStart + clipDuration;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-6">
        {markers.map((marker) => (
          <span
            key={marker.label}
            className={
              marker.tone === "violet"
                ? "absolute top-0 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold text-[#b3a6ff]"
                : marker.tone === "mint"
                  ? "absolute top-0 -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold text-[#7df0c4]"
                  : "absolute top-0 -translate-x-1/2 whitespace-nowrap text-[12px] text-white/60"
            }
            style={{ left: `${Math.min(94, Math.max(6, toPercent(marker.time)))}%` }}
          >
            ▼ {marker.label} {formatSnippetTime(marker.time)}
          </span>
        ))}
      </div>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Начало фрагмента"
        aria-valuemin={0}
        aria-valuemax={Math.round(maxStart)}
        aria-valuenow={Math.round(clipStart)}
        aria-valuetext={`${formatSnippetTime(clipStart)} – ${formatSnippetTime(clipStart + clipDuration)}`}
        className="relative h-[88px] cursor-grab touch-none select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[#8b72ff] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragRef.current = null)}
        onPointerCancel={() => (dragRef.current = null)}
        onKeyDown={onKeyDown}
      >
        <div className="absolute inset-0 flex items-center gap-[2px]">
          {(bars ?? Array.from({ length: BAR_COUNT }, (_, index) => 0.15 + 0.1 * Math.abs(Math.sin(index * 0.4)))).map((value, index) => {
            const barTime = ((index + 0.5) / BAR_COUNT) * trackDuration;
            const selected = barTime >= clipStart && barTime <= clipStart + clipDuration;
            return (
              <span
                key={index}
                className={selected ? "min-w-px flex-1 rounded-sm bg-[#a594ff]" : "min-w-px flex-1 rounded-sm bg-white/25"}
                style={{ height: `${Math.round(value * 100)}%` }}
              />
            );
          })}
        </div>
        {trackDuration > 0 ? (
          <div
            className="pointer-events-none absolute inset-y-0 rounded-[10px] border-2 border-[#8b72ff] bg-[#7b61ff]/15"
            style={{ left: `${toPercent(clipStart)}%`, width: `${toPercent(clipDuration)}%` }}
          >
            {playheadVisible ? (
              <span className="absolute -inset-y-0.5 w-0.5 bg-white" style={{ left: `${((props.currentTime - clipStart) / clipDuration) * 100}%` }} />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex justify-between text-[12px] tabular-nums text-white/55">
        <span>0:00</span>
        <span>
          {formatSnippetTime(clipStart)} – {formatSnippetTime(clipStart + clipDuration)}
        </span>
        <span>{formatSnippetTime(trackDuration)}</span>
      </div>
    </div>
  );
}
