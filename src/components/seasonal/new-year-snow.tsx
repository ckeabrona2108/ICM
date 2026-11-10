"use client";

import * as React from "react";

interface Flake {
  x: number;
  y: number;
  r: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
}

/**
 * Light falling snow on one canvas. Few flakes (fewer on phones), ~30 fps, stops while the
 * tab is hidden and is not drawn at all for visitors who prefer reduced motion.
 */
export function NewYearSnow({
  density = 1,
  color = "#ffffff",
  className = "pointer-events-none fixed inset-0 z-[5]"
}: {
  /** 1 = default amount; scale down for small containers. */
  density?: number;
  /** Flake colour; use a pale blue on light backgrounds. */
  color?: string;
  className?: string;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frameId = 0;
    let last = 0;

    const makeFlake = (top = false): Flake => ({
      x: Math.random() * width,
      y: top ? -8 : Math.random() * height,
      r: Math.random() * 1.9 + 0.7,
      speed: Math.random() * 0.45 + 0.3,
      drift: Math.random() * 0.5 + 0.15,
      phase: Math.random() * Math.PI * 2,
      alpha: Math.random() * 0.45 + 0.45
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const perArea = width < 640 ? 26000 : 18000;
      const count = Math.round(Math.min(110, Math.max(14, (width * height) / perArea)) * density);
      flakes = Array.from({ length: count }, () => makeFlake());
    };

    const draw = (time: number) => {
      frameId = window.requestAnimationFrame(draw);
      if (time - last < 33) return;
      last = time;
      context.clearRect(0, 0, width, height);
      for (const flake of flakes) {
        flake.y += flake.speed;
        flake.phase += 0.012;
        flake.x += Math.sin(flake.phase) * flake.drift;
        if (flake.y > height + 6) Object.assign(flake, makeFlake(true));
        context.globalAlpha = flake.alpha;
        context.fillStyle = color;
        context.beginPath();
        context.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    };

    const onVisibility = () => {
      window.cancelAnimationFrame(frameId);
      if (document.visibilityState === "visible") frameId = window.requestAnimationFrame(draw);
    };

    resize();
    frameId = window.requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density, color]);

  return <canvas ref={canvasRef} aria-hidden className={className} style={{ width: "100%", height: "100%" }} />;
}
