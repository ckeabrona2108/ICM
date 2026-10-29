import type { SceneAssets, SceneFrame, SceneSettings } from "./types";

export const DISPLAY_FONT = '"Space Grotesk", "Inter", system-ui, sans-serif';
export const BODY_FONT = '"Inter", system-ui, sans-serif';
export const MONO_FONT = 'ui-monospace, "SFMono-Regular", Menlo, monospace';

export type Ctx = CanvasRenderingContext2D;

/** Everything a template needs for one frame. */
export interface SceneContext {
  ctx: Ctx;
  width: number;
  height: number;
  /** min(width, height) — templates size things in these units so every format scales. */
  unit: number;
  isWide: boolean;
  settings: SceneSettings;
  frame: SceneFrame;
  assets: SceneAssets;
  /** 0..1 envelope right after the drop, already gated by the drop-hit switch. */
  drop: number;
  /** Cover scale factor driven by bass and the bass-pulse setting. */
  pulse: number;
  cache: Map<string, HTMLCanvasElement>;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic pseudo-random in 0..1. */
export function hash(seed: number) {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((char) => char + char).join("") : clean.padEnd(6, "0");
  const number = Number.parseInt(full.slice(0, 6), 16);
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

export function rgba(hex: string, alpha: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

export function mix(hexA: string, hexB: string, amount: number) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const channel = (index: number) => Math.round(a[index] + (b[index] - a[index]) * amount);
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`;
}

export function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function sourceSize(image: CanvasImageSource) {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
  }
  const sized = image as { width: number; height: number };
  return { width: sized.width, height: sized.height };
}

/** object-fit: cover into the given rect (no clipping — callers clip when needed). */
export function drawImageCover(ctx: Ctx, image: CanvasImageSource, x: number, y: number, width: number, height: number) {
  const { width: sourceWidth, height: sourceHeight } = sourceSize(image);
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

export function roundRectPath(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Cover art (or a palette placeholder) in a rounded square. */
export function drawCover(
  scene: SceneContext,
  x: number,
  y: number,
  size: number,
  options: { radius?: number; filter?: string; glow?: number; shadow?: boolean; height?: number } = {}
) {
  const { ctx, assets, settings } = scene;
  const height = options.height ?? size;
  const radius = options.radius ?? size * 0.05;
  ctx.save();
  if (options.shadow !== false) {
    ctx.shadowColor = options.glow ? rgba(settings.palette[0], 0.55 + options.glow * 0.4) : "rgba(0,0,0,0.45)";
    ctx.shadowBlur = scene.unit * (0.05 + (options.glow ?? 0) * 0.09);
    ctx.shadowOffsetY = options.glow ? 0 : scene.unit * 0.02;
    roundRectPath(ctx, x, y, size, height, radius);
    ctx.fillStyle = settings.palette[3];
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  roundRectPath(ctx, x, y, size, height, radius);
  ctx.clip();
  if (assets.cover) {
    if (options.filter) ctx.filter = options.filter;
    // Ken Burns: the picture slowly pushes in inside a steady frame.
    const drift = settings.fx.kenBurns && !scene.frame.still ? 1 + 0.1 * clamp(scene.frame.time / Math.max(1, scene.frame.clipDuration), 0, 1) : 1;
    ctx.translate(x + size / 2, y + height / 2);
    ctx.scale(drift, drift);
    drawImageCover(ctx, assets.cover, -size / 2, -height / 2, size, height);
    ctx.filter = "none";
  } else {
    drawCoverPlaceholder(ctx, settings.palette, x, y, size, height);
  }
  ctx.restore();
}

export function drawCoverPlaceholder(ctx: Ctx, palette: string[], x: number, y: number, width: number, height: number) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(1, palette[3]);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
  const glow = ctx.createRadialGradient(x + width * 0.3, y + height * 0.3, 0, x + width * 0.3, y + height * 0.3, width * 0.6);
  glow.addColorStop(0, rgba(palette[1], 0.85));
  glow.addColorStop(1, rgba(palette[1], 0));
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, width, height);
}

/** Largest font size (≤ start) at which the text fits the width. */
export function fitFontSize(ctx: Ctx, text: string, maxWidth: number, startSize: number, weight: number, family: string, minSize = startSize * 0.25) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size *= 0.94;
  }
  return Math.max(minSize, size);
}

/** Splits text into at most `maxLines` lines that fit `maxWidth` at the current font. */
export function wrapLines(ctx: Ctx, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;
  // Anything past the limit joins the last line; callers shrink the font to fit it.
  return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(" ")];
}

/** Entrance animation and bass reaction for text, per the text-animation setting. */
export function textMotion(scene: SceneContext, delay = 0) {
  const { settings, frame } = scene;
  const appear = frame.still ? 1 : smoothstep(0.15 + delay, 0.85 + delay, frame.time);
  switch (settings.textAnimation) {
    case "static":
      return { alpha: 1, offsetY: 0, scale: 1 };
    case "kinetic":
      return { alpha: appear, offsetY: (1 - appear) * scene.unit * 0.06, scale: 1 + frame.audio.kick * 0.06 };
    case "bass":
      return { alpha: 1, offsetY: 0, scale: 1 + frame.audio.bass * 0.05 };
    case "fade":
    default:
      return { alpha: appear, offsetY: (1 - appear) * scene.unit * 0.03, scale: 1 };
  }
}

/** Draws centred (or left-aligned) text with the text motion applied. */
export function drawText(
  scene: SceneContext,
  text: string,
  x: number,
  y: number,
  options: {
    size: number;
    weight?: number;
    family?: string;
    color?: string;
    align?: CanvasTextAlign;
    delay?: number;
    letterSpacing?: number;
    stroke?: string;
    strokeWidth?: number;
    shadow?: boolean;
    /** Defaults to the free room between the anchor and the frame edge. */
    maxWidth?: number;
  }
) {
  if (!text) return;
  const { ctx } = scene;
  const motion = textMotion(scene, options.delay ?? 0);
  const align = options.align ?? "center";
  const weight = options.weight ?? 700;
  const family = options.family ?? DISPLAY_FONT;
  // Never let a line run off the frame: shrink it to the room it has from its anchor.
  const margin = scene.unit * 0.06;
  const room =
    options.maxWidth ??
    (align === "center" ? Math.min(x, scene.width - x) * 2 - margin * 2 : align === "right" || align === "end" ? x - margin : scene.width - x - margin);
  const size = fitFontSize(ctx, text, Math.max(room, scene.unit * 0.1), options.size, weight, family);
  ctx.save();
  ctx.globalAlpha *= motion.alpha;
  ctx.translate(x, y + motion.offsetY);
  ctx.scale(motion.scale, motion.scale);
  ctx.font = `${weight} ${size}px ${family}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  if (options.letterSpacing) {
    (ctx as Ctx & { letterSpacing?: string }).letterSpacing = `${options.letterSpacing * (size / options.size)}px`;
  }
  if (options.shadow) {
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = size * 0.4;
  }
  if (options.stroke) {
    ctx.lineWidth = options.strokeWidth ?? Math.max(1, size * 0.035);
    ctx.strokeStyle = options.stroke;
    ctx.lineJoin = "round";
    ctx.strokeText(text, 0, 0);
  }
  if (options.color) {
    ctx.fillStyle = options.color;
    ctx.fillText(text, 0, 0);
  }
  ctx.restore();
}

/** A rounded pill with centred label; returns its height. */
export function drawPill(
  scene: SceneContext,
  text: string,
  centerX: number,
  y: number,
  options: { size: number; background: string; color: string; border?: string; delay?: number; align?: "center" | "left" }
) {
  if (!text) return 0;
  const { ctx } = scene;
  const motion = textMotion(scene, options.delay ?? 0);
  ctx.save();
  ctx.globalAlpha *= motion.alpha;
  const maxPillWidth = scene.width - scene.unit * 0.12;
  const fontSize = fitFontSize(ctx, text, maxPillWidth - options.size * 2.2, options.size, 600, BODY_FONT);
  ctx.font = `600 ${fontSize}px ${BODY_FONT}`;
  const paddingX = options.size * 1.1;
  const height = options.size * 2.4;
  const width = ctx.measureText(text).width + paddingX * 2;
  const x = options.align === "left" ? centerX : centerX - width / 2;
  const top = y + motion.offsetY;
  roundRectPath(ctx, x, top, width, height, height / 2);
  ctx.fillStyle = options.background;
  ctx.fill();
  if (options.border) {
    ctx.lineWidth = Math.max(1.5, options.size * 0.08);
    ctx.strokeStyle = options.border;
    ctx.stroke();
  }
  ctx.fillStyle = options.color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, top + height / 2 + fontSize * 0.04);
  ctx.restore();
  return height;
}

/** Spectrum in a rect. `bars` grow from the bottom edge; `line` and `dots` sit on the centre line. */
export function drawSpectrum(
  scene: SceneContext,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { color: string; style?: SceneSettings["spectrum"]; mirror?: boolean; alpha?: number }
) {
  const style = options.style ?? scene.settings.spectrum;
  if (style === "off") return;
  const { ctx } = scene;
  const bands = scene.frame.audio.spectrum;
  // Silence (paused preview, quiet intro) would leave a flat dotted line — draw nothing instead.
  if (!bands.some((value) => value > 0.03)) return;
  const count = options.mirror ? bands.length * 2 : bands.length;
  const valueAt = (index: number) => {
    const band = options.mirror ? Math.abs(index - bands.length + 0.5) - 0.5 : index;
    return clamp(bands[Math.round(band)] ?? 0, 0, 1);
  };
  ctx.save();
  ctx.globalAlpha *= options.alpha ?? 0.92;
  ctx.fillStyle = options.color;
  ctx.strokeStyle = options.color;
  const step = width / count;
  if (style === "bars") {
    const barWidth = step * 0.58;
    for (let index = 0; index < count; index += 1) {
      const value = Math.pow(valueAt(index), 1.4);
      const barHeight = Math.max(height * 0.06, value * height);
      roundRectPath(ctx, x + index * step + (step - barWidth) / 2, y + height - barHeight, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    }
  } else if (style === "dots") {
    for (let index = 0; index < count; index += 1) {
      const value = Math.pow(valueAt(index), 1.3);
      const radius = step * (0.16 + value * 0.32);
      ctx.beginPath();
      ctx.arc(x + index * step + step / 2, y + height / 2 - (value - 0.3) * height * 0.35, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.lineWidth = Math.max(2, scene.unit * 0.005);
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let index = 0; index < count; index += 1) {
      const value = Math.pow(valueAt(index), 1.3) * (index % 2 === 0 ? 1 : -1);
      const pointX = x + index * step + step / 2;
      const pointY = y + height / 2 - value * height * 0.48;
      if (index === 0) ctx.moveTo(pointX, pointY);
      else ctx.lineTo(pointX, pointY);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

/** Cached derivative of the cover (grayscale, duotone…); rebuilt when the cover or key changes. */
export function cachedCanvas(scene: SceneContext, key: string, build: () => HTMLCanvasElement | null) {
  const fullKey = `${scene.assets.coverKey}|${key}`;
  const existing = scene.cache.get(fullKey);
  if (existing) return existing;
  const created = build();
  if (created) {
    for (const cachedKey of scene.cache.keys()) {
      if (cachedKey.endsWith(`|${key}`)) scene.cache.delete(cachedKey);
    }
    scene.cache.set(fullKey, created);
  }
  return created;
}
