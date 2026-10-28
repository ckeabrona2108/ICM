"use client";

import * as React from "react";

import type { VideoSnippetPlaybackFrame } from "@/components/video-snippets/video-snippet-state";
import { cn } from "@/lib/utils";

import { SceneRenderer } from "./scene/render-scene";
import { SNIPPET_FORMATS, type SceneAssets, type SceneSettings, type SnippetFormatId } from "./scene/types";

/** Preview renders at half resolution: the scene is resolution-independent, so it matches the export. */
const PREVIEW_SCALE = 0.5;

export function StudioPreview(props: {
  format: SnippetFormatId;
  settings: SceneSettings;
  assets: SceneAssets;
  clipStart: number;
  clipDuration: number;
  trackDuration: number;
  dropTrackTime: number | null;
  isPlaying: boolean;
  analysisRef: React.RefObject<VideoSnippetPlaybackFrame | null>;
  showSafeZones: boolean;
  className?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const rendererRef = React.useRef(new SceneRenderer());
  const latest = React.useRef(props);
  latest.current = props;

  const { width, height } = SNIPPET_FORMATS[props.format];

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let frameId = 0;
    const idleStartedAt = performance.now();

    const tick = () => {
      const current = latest.current;
      const playback = current.analysisRef.current;
      const playing = current.isPlaying && playback !== null;
      // Paused: the background keeps drifting on a local clock, text stays settled.
      const trackTime = playing ? playback.currentTime : current.clipStart;
      const time = playing ? Math.max(0, trackTime - current.clipStart) : (performance.now() - idleStartedAt) / 1000;
      rendererRef.current.render(
        context,
        canvas.width,
        canvas.height,
        current.settings,
        {
          time,
          clipDuration: current.clipDuration,
          trackTime,
          trackDuration: current.trackDuration,
          dropTime: current.dropTrackTime === null ? null : current.dropTrackTime - current.clipStart,
          frequencyData: playing ? playback.frequencyData : null,
          still: !playing
        },
        current.assets
      );
      frameId = window.requestAnimationFrame(tick);
    };
    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [props.format]);

  return (
    <div className={cn("relative mx-auto overflow-hidden rounded-[22px] shadow-[0_40px_120px_-40px_rgba(123,97,255,0.55)] ring-1 ring-white/10", props.className)} style={{ aspectRatio: `${width} / ${height}` }}>
      <canvas ref={canvasRef} width={width * PREVIEW_SCALE} height={height * PREVIEW_SCALE} className="block h-full w-full" aria-label="Превью сниппета" />
      {props.showSafeZones && props.format === "story" ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 h-[11%] border-b border-dashed border-rose-300/80 bg-rose-500/15" />
          <div className="absolute inset-x-0 bottom-0 h-[19%] border-t border-dashed border-rose-300/80 bg-rose-500/15" />
          <div className="absolute bottom-[19%] right-0 top-[11%] w-[15%] border-l border-dashed border-rose-300/80 bg-rose-500/15" />
          <span className="absolute bottom-[20%] left-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-rose-100">
            Интерфейс TikTok / Reels
          </span>
        </div>
      ) : null}
    </div>
  );
}
