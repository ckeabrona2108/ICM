"use client";

import * as React from "react";

import { SceneRenderer } from "./scene/render-scene";
import type { SceneAssets, SceneSettings } from "./scene/types";

/** A settled still frame of the scene — template and background pickers show the real look on the user's cover. */
export function SceneThumb(props: { settings: SceneSettings; assets: SceneAssets; width?: number; height?: number; className?: string }) {
  const { settings, assets } = props;
  const width = props.width ?? 180;
  const height = props.height ?? 320;
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  // Redraw only when what the thumbnail shows changes, not on every studio re-render.
  const settingsKey = JSON.stringify(settings);
  const latestSettings = React.useRef(settings);
  latestSettings.current = settings;

  React.useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const renderer = new SceneRenderer();
    renderer.render(
      context,
      width,
      height,
      { ...latestSettings.current, watermark: false, endCard: false },
      { time: 4, clipDuration: 15, trackTime: 42, trackDuration: 180, dropTime: null, frequencyData: null, still: true },
      assets
    );
  }, [assets, height, settingsKey, width]);

  return <canvas ref={canvasRef} width={width} height={height} className={props.className} aria-hidden="true" />;
}
