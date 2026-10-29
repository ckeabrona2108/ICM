"use client";

import * as React from "react";

import { BackgroundPainter } from "@/components/snippet-studio/scene/backgrounds";
import type { SceneContext } from "@/components/snippet-studio/scene/draw-utils";
import { extractPalette } from "@/components/snippet-studio/scene/palette";
import { createDefaultSceneSettings, type BackgroundId } from "@/components/snippet-studio/scene/types";

/** Live backgrounds are drawn small and stretched — the stretch is the blur — so this stays cheap. */
const RENDER_SCALE = 0.35;
const FRAME_INTERVAL_MS = 1000 / 30;

/**
 * The studio's live background behind the smart link page: slow colour drifting in the
 * cover's palette. It fades in over the static blurred cover once the first frame is drawn,
 * stops while the tab is hidden and holds a single still frame for reduced-motion users.
 */
export function SmartLinkLiveBackground({ coverUrl, variant }: { coverUrl: string; variant: BackgroundId }) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frameId = 0;
    let disposed = false;
    const painter = new BackgroundPainter();
    const settings = { ...createDefaultSceneSettings(), background: variant, backgroundSpeed: 0 as const, backgroundBlur: 0.75, backgroundBeat: false };
    const image = new Image();
    image.crossOrigin = "anonymous";
    const startedAt = performance.now();
    let lastFrame = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      canvas.width = Math.max(64, Math.round(window.innerWidth * RENDER_SCALE));
      canvas.height = Math.max(64, Math.round(window.innerHeight * RENDER_SCALE));
    };

    const draw = (now: number) => {
      const width = canvas.width;
      const height = canvas.height;
      const scene: SceneContext = {
        ctx: context,
        width,
        height,
        unit: Math.min(width, height),
        isWide: width > height * 1.2,
        settings,
        frame: {
          time: (now - startedAt) / 1000,
          clipDuration: 60,
          trackTime: 0,
          trackDuration: 0,
          dropTime: null,
          frameIndex: Math.floor(now / FRAME_INTERVAL_MS),
          still: true,
          audio: { bass: 0, mid: 0, treble: 0, energy: 0, kick: 0, spectrum: new Float32Array(48) }
        },
        assets: { cover: image.complete && image.naturalWidth ? image : null, coverKey: coverUrl },
        drop: 0,
        pulse: 1,
        textShift: 0,
        cache: new Map()
      };
      painter.paint(scene);
    };

    const tick = (now: number) => {
      if (disposed) return;
      if (!document.hidden && now - lastFrame >= FRAME_INTERVAL_MS) {
        lastFrame = now;
        draw(now);
      }
      frameId = window.requestAnimationFrame(tick);
    };

    image.onload = () => {
      if (disposed) return;
      settings.palette = extractPalette(image);
      resize();
      draw(performance.now());
      setVisible(true);
      if (!reduceMotion) frameId = window.requestAnimationFrame(tick);
    };
    // A cover on another host without CORS can still be drawn, just not read for colours:
    // retry without crossOrigin and keep the ICM palette.
    image.onerror = () => {
      if (disposed || !image.crossOrigin) return;
      image.removeAttribute("crossorigin");
      image.src = coverUrl;
    };
    image.src = coverUrl;
    window.addEventListener("resize", resize);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
    };
  }, [coverUrl, variant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 h-full w-full transition-opacity duration-[1200ms] ${visible ? "opacity-100" : "opacity-0"}`}
    />
  );
}
