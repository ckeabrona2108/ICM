"use client";

import * as React from "react";

interface Flake {
  x: number;
  y: number;
  size: number;
  sprite: number;
  speed: number;
  drift: number;
  phase: number;
  rotation: number;
  spin: number;
  alpha: number;
}

/** Flake radii in CSS px; each gets a pre-drawn sprite so frames only blit images. */
const SIZES = [3, 4.5, 6.5];

/** A six-armed snowflake with a pair of side branches on each arm, drawn once per size. */
function drawSprite(radius: number, ratio: number, color: string): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  const side = Math.ceil((radius * 2 + 2) * ratio);
  sprite.width = side;
  sprite.height = side;
  const context = sprite.getContext("2d");
  if (!context) return sprite;
  context.scale(ratio, ratio);
  context.translate(radius + 1, radius + 1);
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineWidth = Math.max(0.8, radius / 5);
  for (let arm = 0; arm < 6; arm += 1) {
    context.save();
    context.rotate((arm * Math.PI) / 3);
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -radius);
    const fork = -radius * 0.55;
    const twig = radius * 0.32;
    context.moveTo(0, fork);
    context.lineTo(-twig, fork - twig);
    context.moveTo(0, fork);
    context.lineTo(twig, fork - twig);
    context.stroke();
    context.restore();
  }
  return sprite;
}

/**
 * Light falling snowflakes on one canvas. Few flakes (fewer on phones), ~30 fps, movement scaled
 * by real elapsed time so a slow first frame doesn't make them jump. Resizing keeps the flakes
 * already on screen (phone toolbars resize the viewport while scrolling). The canvas fades in once
 * the first frame is drawn, stops while the tab is hidden and is not drawn at all for visitors who
 * prefer reduced motion.
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
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const sprites = SIZES.map((size) => drawSprite(size, ratio, color));
    let width = 0;
    let height = 0;
    let flakes: Flake[] = [];
    let frameId = 0;
    let last = 0;
    let shown = false;

    const makeFlake = (top = false): Flake => {
      const sprite = Math.random() < 0.5 ? 0 : Math.random() < 0.7 ? 1 : 2;
      return {
        x: Math.random() * width,
        y: top ? -SIZES[sprite] * 2 : Math.random() * height,
        size: SIZES[sprite],
        sprite,
        speed: 0.35 + sprite * 0.12 + Math.random() * 0.3,
        drift: Math.random() * 0.45 + 0.15,
        phase: Math.random() * Math.PI * 2,
        rotation: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.02,
        alpha: Math.random() * 0.4 + 0.5
      };
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const perArea = width < 640 ? 30000 : 21000;
      const count = Math.round(Math.min(90, Math.max(12, (width * height) / perArea)) * density);
      // Keep the flakes already falling; only add or drop the difference.
      for (const flake of flakes) if (flake.x > width) flake.x = Math.random() * width;
      if (flakes.length > count) flakes.length = count;
      while (flakes.length < count) flakes.push(makeFlake());
    };

    const draw = (time: number) => {
      frameId = window.requestAnimationFrame(draw);
      if (!width || time - last < 33) return;
      const step = last ? Math.min(time - last, 100) / 33 : 1;
      last = time;
      context.clearRect(0, 0, width, height);
      for (const flake of flakes) {
        flake.y += flake.speed * step;
        flake.phase += 0.012 * step;
        flake.x += Math.sin(flake.phase) * flake.drift * step;
        flake.rotation += flake.spin * step;
        if (flake.y > height + flake.size * 2) Object.assign(flake, makeFlake(true));
        const sprite = sprites[flake.sprite];
        const half = flake.size + 1;
        context.save();
        context.globalAlpha = flake.alpha;
        context.translate(flake.x, flake.y);
        context.rotate(flake.rotation);
        context.drawImage(sprite, -half, -half, half * 2, half * 2);
        context.restore();
      }
      if (!shown) {
        shown = true;
        setVisible(true);
      }
    };

    const onVisibility = () => {
      window.cancelAnimationFrame(frameId);
      last = 0;
      if (document.visibilityState === "visible") frameId = window.requestAnimationFrame(draw);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    frameId = window.requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [density, color]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ width: "100%", height: "100%", opacity: visible ? 1 : 0, transition: "opacity 1.2s ease" }}
    />
  );
}
