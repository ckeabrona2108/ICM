import type { SyncedLine } from "@/components/release-wizard/wizard-context";

/**
 * Lyric video for stories: a track pill grows into a player card, then the lyrics take the whole screen
 * and the sung line fills with light. Every frame is a pure function of time, so the same scene draws the
 * live preview and the frame-by-frame MP4 export.
 */

export const KARAOKE_VIDEO_WIDTH = 1080;
export const KARAOKE_VIDEO_HEIGHT = 1920;
export const KARAOKE_VIDEO_FPS = 60;
/** ~10 Mbit/s: smooth 60 fps text without the file growing past what phones upload comfortably. */
export const KARAOKE_VIDEO_BITRATE = 10_000_000;

export const KARAOKE_FONT = `"Manrope", "Onest", -apple-system, "SF Pro Display", "Segoe UI", Roboto, sans-serif`;
export const KARAOKE_LOGO_SRC = "/brand/logo.png";

export type KaraokeBackground = "cover" | "dark" | "gradient" | "light";
export type KaraokeHighlight = "sweep" | "line";
export type KaraokeEffect = "none" | "dust" | "bokeh" | "rays";

export interface KaraokeLook {
  background: KaraokeBackground;
  /** Hex colour for glows and the card accent; null takes it from the cover. */
  accent: string | null;
  /** Hex colour of the lyrics. */
  textColor: string;
  /** Opacity of the lines that are not being sung, 0..1. */
  inactiveOpacity: number;
  /** Lyrics size multiplier. */
  textScale: number;
  align: "left" | "center";
  highlight: KaraokeHighlight;
  /** Open with the track pill and player card. */
  intro: boolean;
  /** Moving particles or light over the background. */
  effect: KaraokeEffect;
  /** A soft light streak that glides across the player card. */
  shine: boolean;
}

export const DEFAULT_KARAOKE_LOOK: KaraokeLook = {
  background: "cover",
  accent: null,
  textColor: "#ffffff",
  inactiveOpacity: 0.3,
  textScale: 1,
  align: "left",
  highlight: "sweep",
  intro: true,
  effect: "dust",
  shine: true
};

const DEFAULT_ACCENT: Rgb = [123, 97, 255];
const WATERMARK_TEXT = "icecreammusic.net";

type Rgb = [number, number, number];

export interface KaraokeSceneOptions {
  lines: SyncedLine[];
  title: string;
  artist: string;
  cover: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  /** Track time the clip starts at, in seconds. */
  clipStart: number;
  clipDuration: number;
  trackDuration: number;
  watermark: boolean;
  look: KaraokeLook;
}

export interface KaraokeScene {
  /** `level` is 0..1 audio energy, used only for the breathing glow and the pill's equalizer. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, trackTime: number, level: number): void;
}

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Quintic smoothstep: zero velocity and acceleration at both ends, so nothing ever jerks. */
const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 4);
/** Stable pseudo-random 0..1 for particle n, so every frame (and every export) places it the same. */
const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
/** Canvas blur works in Chrome and Firefox; Safari skips it and simply draws sharp. */
const CAN_BLUR = typeof CanvasRenderingContext2D !== "undefined" && "filter" in CanvasRenderingContext2D.prototype;

/** Ease out with a small overshoot, like the iPhone island springing open. */
const springOut = (t: number) => {
  const x = clamp(t) - 1;
  return 1 + 2.2 * x * x * x + 1.2 * x * x;
};
const rgba = ([r, g, b]: Rgb, a: number) => `rgba(${r},${g},${b},${clamp(a)})`;

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)].map(Math.round) as Rgb;
}

function formatClock(sec: number) {
  const t = Math.max(0, Math.floor(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

/** Average colour of the cover, lifted so it still glows on a dark background. */
export function coverAccent(cover: HTMLImageElement | null): Rgb {
  if (!cover) return DEFAULT_ACCENT;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) return DEFAULT_ACCENT;
    x.drawImage(cover, 0, 0, 16, 16);
    const d = x.getImageData(0, 0, 16, 16).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const max = Math.max(d[i]!, d[i + 1]!, d[i + 2]!);
      const min = Math.min(d[i]!, d[i + 1]!, d[i + 2]!);
      // Grey and near-black pixels say little about the cover's colour.
      if (max < 40 || max - min < 18) continue;
      r += d[i]!;
      g += d[i + 1]!;
      b += d[i + 2]!;
      n += 1;
    }
    if (n < 6) return DEFAULT_ACCENT;
    const avg: Rgb = [r / n, g / n, b / n];
    const peak = Math.max(...avg);
    const lift = peak < 170 ? 170 / peak : 1;
    return avg.map((v) => Math.round(Math.min(255, v * lift))) as Rgb;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function rgbToHex([r, g, b]: Rgb) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** A heavily blurred cover made by shrinking then stretching it — works where canvas `filter` does not (Safari). */
function blurredBackdrop(cover: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const tiny = document.createElement("canvas");
  tiny.width = 12;
  tiny.height = Math.round((12 * height) / width);
  const t = tiny.getContext("2d");
  const out = document.createElement("canvas");
  out.width = Math.round(width / 4);
  out.height = Math.round(height / 4);
  const o = out.getContext("2d");
  if (!t || !o) return out;
  // Centre-crop the cover to the frame's aspect.
  const aspect = tiny.width / tiny.height;
  const sw = Math.min(cover.naturalWidth, cover.naturalHeight * aspect);
  const sh = sw / aspect;
  t.drawImage(cover, (cover.naturalWidth - sw) / 2, (cover.naturalHeight - sh) / 2, sw, sh, 0, 0, tiny.width, tiny.height);
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = "high";
  o.drawImage(tiny, 0, 0, out.width, out.height);
  return out;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    const next = row ? `${row} ${word}` : word;
    if (row && ctx.measureText(next).width > maxWidth) {
      rows.push(row);
      row = word;
    } else {
      row = next;
    }
  }
  if (row) rows.push(row);
  return rows.length ? rows : [""];
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * Draws wrapped rows with a karaoke sweep: everything up to `fill` (0..1 of the whole line) is bright,
 * the rest dim, with a soft edge between them.
 */
function drawSweptRows(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  lineHeight: number,
  align: "left" | "center",
  fill: number,
  bright: string,
  dim: string
) {
  const widths = rows.map((r) => ctx.measureText(r).width);
  const total = widths.reduce((a, b) => a + b, 0) || 1;
  let remaining = fill * total;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  rows.forEach((row, i) => {
    const w = widths[i]!;
    const left = align === "center" ? x - w / 2 : x;
    const rowFill = clamp(remaining / (w || 1));
    remaining -= w;
    if (rowFill >= 1) {
      ctx.fillStyle = bright;
    } else if (rowFill <= 0) {
      ctx.fillStyle = dim;
    } else {
      const edge = Math.min(0.2, 90 / (w || 1));
      const g = ctx.createLinearGradient(left, 0, left + w, 0);
      g.addColorStop(0, bright);
      g.addColorStop(clamp(rowFill - edge / 2), bright);
      g.addColorStop(clamp(rowFill + edge / 2), dim);
      g.addColorStop(1, dim);
      ctx.fillStyle = g;
    }
    ctx.fillText(row, left, y + i * lineHeight);
  });
}

/** Index of the line being sung, or the last one sung during a pause; -1 before the first. */
function activeLineIndex(lines: SyncedLine[], t: number) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.begin <= t) idx = i;
    else break;
  }
  return idx;
}

/** How far the sweep has run through a line. Eased slightly so it does not crawl linearly. */
function lineFill(line: SyncedLine | undefined, t: number) {
  if (!line) return 0;
  const p = clamp((t - line.begin) / Math.max(0.2, line.end - line.begin));
  return lerp(p, smooth(p), 0.35);
}

// How a line lights up and goes out around its start, in seconds.
const ON_LEAD = 0.12;
const ON_TIME = 0.4;
const OFF_TIME = 0.5;
const SCROLL_LEAD = 0.18;
const SCROLL_TIME = 0.85;

export function createKaraokeScene(options: KaraokeSceneOptions): KaraokeScene {
  const { look } = options;
  const lines = [...options.lines].sort((a, b) => a.begin - b.begin);
  const accent = (look.accent && hexToRgb(look.accent)) || coverAccent(options.cover);
  const text = hexToRgb(look.textColor) ?? [255, 255, 255];
  const light = look.background === "light";
  const D = options.clipDuration;

  // Scene beats, in seconds from the clip start. Short clips get a shorter player card.
  // The island grows in, holds for a couple of seconds, then opens into the card.
  const PILL_IN = 0.9;
  const MORPH_START = 2.1;
  const MORPH_END = 3.05;
  // The card holds for half the clip: 15 s of a 30 s video, 7.5 s of a 15 s one.
  const CARD_OUT_START = look.intro ? Math.max(MORPH_END + 1.5, D * 0.5) : -10;
  const CARD_OUT_END = CARD_OUT_START + 1.1;
  // Full turns while the card holds: the first soon after it opens, then every few seconds.
  const SPIN_TIME = 1.3;
  const spins: number[] = [];
  for (let at = MORPH_END + 1.4; at + SPIN_TIME < CARD_OUT_START - 0.6; at += 4.2) spins.push(at);

  let layer: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;

  let backdrop: { canvas: HTMLCanvasElement; w: number; h: number } | null = null;
  const rowCache = new Map<string, string[]>();

  function rowsFor(ctx: CanvasRenderingContext2D, key: string, value: string, maxWidth: number) {
    const cacheKey = `${key}|${Math.round(maxWidth)}|${ctx.font}|${value}`;
    let rows = rowCache.get(cacheKey);
    if (!rows) {
      rows = wrapText(ctx, value, maxWidth);
      rowCache.set(cacheKey, rows);
    }
    return rows;
  }

  /** 0..1: how lit line i is at time t. Rises as it starts, falls as the next one starts. */
  function activeness(i: number, t: number) {
    const line = lines[i]!;
    const on = smooth((t - line.begin + ON_LEAD) / ON_TIME);
    const next = lines[i + 1];
    const offAt = next ? next.begin : line.end + 1.5;
    const off = smooth((t - offAt + ON_LEAD) / OFF_TIME);
    return on * (1 - off);
  }

  /** Continuous scroll position: each line start adds one smooth step, so fast lines never snap. */
  function scrollFocus(tops: number[], t: number) {
    let focus = tops[0] ?? 0;
    for (let i = 1; i < lines.length; i++) {
      const k = smooth((t - lines[i]!.begin + SCROLL_LEAD) / SCROLL_TIME);
      if (k <= 0) break;
      focus += (tops[i]! - tops[i - 1]!) * k;
    }
    return focus;
  }

  function drawCover(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, r: number) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, s, s, r);
    ctx.clip();
    if (options.cover) {
      const img = options.cover;
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, x, y, s, s);
    } else {
      const g = ctx.createLinearGradient(x, y, x + s, y + s);
      g.addColorStop(0, rgba(accent, 1));
      g.addColorStop(1, rgba(mix(accent, [16, 12, 40], 0.75), 1));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, s, s);
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.font = `800 ${Math.round(s * 0.42)}px ${KARAOKE_FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText((options.title.trim()[0] ?? "♪").toUpperCase(), x + s / 2, y + s / 2 + s * 0.02);
    }
    ctx.restore();
  }

  function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, rel: number, level: number) {
    const mode = look.background === "cover" && !options.cover ? "gradient" : look.background;
    ctx.fillStyle = light ? "#f3f1f8" : "#07070c";
    ctx.fillRect(0, 0, w, h);

    if (mode === "gradient") {
      // Two accent tones drifting slowly around the frame.
      const a = rel * 0.18;
      const g = ctx.createLinearGradient(
        w * (0.5 + 0.5 * Math.cos(a)),
        0,
        w * (0.5 - 0.5 * Math.cos(a)),
        h
      );
      g.addColorStop(0, rgba(mix(accent, [8, 8, 14], 0.35), 1));
      g.addColorStop(0.55, rgba(mix(accent, [8, 8, 14], 0.72), 1));
      g.addColorStop(1, rgba(mix(accent, [8, 8, 14], 0.9), 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if ((mode === "cover" || mode === "light") && options.cover) {
      if (!backdrop || backdrop.w !== w || backdrop.h !== h) {
        backdrop = { canvas: blurredBackdrop(options.cover, w, h), w, h };
      }
      ctx.save();
      ctx.globalAlpha = mode === "light" ? 0.32 : 0.62;
      // A slow zoom keeps the blurred cover alive without drawing attention.
      const z = 1.08 + 0.04 * Math.sin(rel * 0.15);
      ctx.drawImage(backdrop.canvas, (w - w * z) / 2, (h - h * z) / 2, w * z, h * z);
      ctx.restore();
    }

    // Soft glows; the music nudges them only a little so they never flicker.
    const breathe = (light ? 0.14 : 0.2) + level * 0.08;
    const gx = w * (0.3 + 0.12 * Math.sin(rel * 0.3));
    const gy = h * (0.28 + 0.06 * Math.cos(rel * 0.23));
    const g1 = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.95);
    g1.addColorStop(0, rgba(accent, breathe));
    g1.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, w, h);
    const hx = w * (0.75 + 0.1 * Math.cos(rel * 0.19));
    const hy = h * 0.82;
    const g2 = ctx.createRadialGradient(hx, hy, 0, hx, hy, w * 0.8);
    g2.addColorStop(0, rgba(accent, breathe * 0.6));
    g2.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);

    drawEffect(ctx, w, h, rel);

    if (!light) {
      const v = ctx.createLinearGradient(0, 0, 0, h);
      v.addColorStop(0, "rgba(5,5,10,0.5)");
      v.addColorStop(0.25, "rgba(5,5,10,0.12)");
      v.addColorStop(0.75, "rgba(5,5,10,0.12)");
      v.addColorStop(1, "rgba(5,5,10,0.6)");
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** Background particles or light. Positions come from time alone, so preview and export match. */
  function drawEffect(ctx: CanvasRenderingContext2D, w: number, h: number, rel: number) {
    const u = w / 1080;
    const ink: Rgb = light ? [40, 30, 70] : [255, 255, 255];
    ctx.save();
    if (look.effect === "dust") {
      // Fine glowing dust drifting slowly upward and twinkling.
      for (let i = 0; i < 90; i++) {
        const speed = (8 + hash(i + 0.3) * 24) * u;
        const x = hash(i) * w + Math.sin(rel * 0.25 + i) * 18 * u;
        const y = (((hash(i + 0.5) * h - rel * speed) % h) + h) % h;
        const r = (0.9 + hash(i + 0.7) * 2.3) * u;
        const twinkle = 0.55 + 0.45 * Math.sin(rel * (1.2 + hash(i + 0.2) * 2.2) + i * 3.1);
        ctx.globalAlpha = (0.12 + 0.5 * hash(i + 0.9)) * twinkle;
        ctx.fillStyle = rgba(ink, 1);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (look.effect === "bokeh") {
      // Large soft out-of-focus circles in the accent colour.
      for (let i = 0; i < 16; i++) {
        const r = (45 + hash(i + 0.4) * 120) * u;
        const x = hash(i + 0.1) * w + Math.sin(rel * 0.18 + i * 1.7) * 60 * u;
        const y = (((hash(i + 0.6) * (h + 2 * r) - rel * (6 + hash(i) * 14) * u) % (h + 2 * r)) + h + 2 * r) % (h + 2 * r) - r;
        const a = (light ? 0.1 : 0.07) + 0.08 * hash(i + 0.8);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const tone = i % 3 === 0 ? mix(accent, [255, 255, 255], 0.5) : accent;
        g.addColorStop(0, rgba(tone, a));
        g.addColorStop(0.7, rgba(tone, a * 0.7));
        g.addColorStop(1, rgba(tone, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (look.effect === "rays") {
      // Long beams of light falling from the top corner, slowly swinging.
      ctx.translate(-0.15 * w, -0.08 * h);
      for (let k = 0; k < 5; k++) {
        const angle = 0.72 + k * 0.13 + 0.05 * Math.sin(rel * 0.35 + k * 1.3);
        const width = (60 + hash(k + 0.2) * 120) * u;
        const length = h * 1.5;
        ctx.save();
        ctx.rotate(angle);
        const g = ctx.createLinearGradient(0, 0, length, 0);
        const a = (light ? 0.1 : 0.07) * (0.6 + 0.4 * Math.sin(rel * 0.6 + k * 2));
        g.addColorStop(0, rgba(mix(accent, [255, 255, 255], 0.6), a));
        g.addColorStop(1, rgba(accent, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(length, -width);
        ctx.lineTo(length, width);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /** The pill growing into the player card, drawn flat facing the camera; the 3D turn is applied afterwards. */
  function drawPlayerFlat(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    rel: number,
    t: number,
    level: number,
    face: "front" | "back",
    angle: number
  ) {
    const u = w / 1080;
    const appear = easeOut(rel / PILL_IN);
    const m = smooth((rel - MORPH_START) / (MORPH_END - MORPH_START));
    // Leaving: the card shrinks into the middle and fades while the lyrics open out from behind it.
    const out = smooth((rel - CARD_OUT_START) / (CARD_OUT_END - CARD_OUT_START));
    const alpha = appear * (1 - smooth((rel - CARD_OUT_START - 0.15) / (CARD_OUT_END - CARD_OUT_START - 0.15)));

    // Dynamic-Island-style capsule: starts as a small black bead and springs out sideways.
    const grow = springOut(rel / PILL_IN);
    const pill = { w: lerp(210 * u, 600 * u, grow), h: 100 * u };
    const card = { w: 700 * u, h: 1010 * u };
    const cw = lerp(pill.w, card.w, m);
    const ch = lerp(pill.h, card.h, m);
    const cx = w / 2;
    // A slow float so the card never sits dead still.
    const float = Math.sin(rel * 1.2) * 12 * u * smooth((rel - MORPH_END) / 0.8);
    const cy = lerp(h * 0.46, h * 0.43, m) - out * h * 0.04 + float;
    const x = cx - cw / 2;
    const y = cy - ch / 2;
    const geometry = { x, y, cw, ch, cx, cy };
    if (alpha <= 0) return { bottom: cy + ch / 2, alpha, ...geometry };

    const radius = lerp(pill.h / 2, 56 * u, m);
    const scale = lerp(0.9, 1, appear) * lerp(1, 0.42, out);
    const ink: Rgb = light ? [20, 18, 30] : [255, 255, 255];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);

    // Black like the island, warming into the card's own colour as it opens.
    const cardFill: Rgb = light ? [255, 255, 255] : [22, 22, 32];
    ctx.shadowColor = m > 0 ? rgba(accent, (light ? 0.25 : 0.35) * m) : "rgba(0,0,0,0.45)";
    ctx.shadowBlur = lerp(36, 80, m) * u;
    ctx.fillStyle = rgba(mix([0, 0, 0], cardFill, m), 0.97);
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, radius);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = light && m > 0.5 ? "rgba(20,18,30,0.06)" : `rgba(255,255,255,${lerp(0.05, 0.09, m)})`;
    ctx.lineWidth = 2 * u;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, radius);
    ctx.clip();

    if (face === "back") {
      drawBackFace(ctx, x, y, cw, ch, u, ink);
    } else {
    // Pill contents fade out as the card opens.
    const pillAlpha = (1 - smooth(m * 2.2)) * smooth((grow - 0.55) / 0.35);
    if (pillAlpha > 0) {
      ctx.globalAlpha = alpha * pillAlpha;
      const s = 66 * u;
      const pad = (pill.h - s) / 2;
      drawCover(ctx, x + pad, y + pad, s, 15 * u);
      const textX = x + pad + s + 18 * u;
      const textW = pill.w - (textX - x) - 110 * u;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${27 * u}px ${KARAOKE_FONT}`;
      ctx.fillText(fitText(ctx, options.title || "Без названия", textW), textX, y + pill.h / 2 - 3 * u);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `500 ${22 * u}px ${KARAOKE_FONT}`;
      ctx.fillText(fitText(ctx, options.artist, textW), textX, y + pill.h / 2 + 25 * u);
      // Live waveform: six thin bars, tallest in the middle, moving with the music.
      const bars = 6;
      const bw = 5 * u;
      const gap = 5 * u;
      const right = x + pill.w - 34 * u;
      const left = right - bars * bw - (bars - 1) * gap;
      const g = ctx.createLinearGradient(left, 0, right, 0);
      g.addColorStop(0, rgba(accent, 1));
      g.addColorStop(1, rgba(mix(accent, [255, 255, 255], 0.35), 1));
      ctx.fillStyle = g;
      for (let i = 0; i < bars; i++) {
        const shape = 1 - Math.abs(i - (bars - 1) / 2) / bars;
        const wave = 0.5 + 0.5 * Math.sin(rel * (5 + i * 0.7) + i * 1.9);
        const bh = (8 + 32 * shape * (0.35 + 0.65 * wave) * (0.6 + level * 0.8)) * u;
        ctx.beginPath();
        ctx.roundRect(left + i * (bw + gap), y + pill.h / 2 - bh / 2, bw, bh, bw / 2);
        ctx.fill();
      }
    }

    const cardAlpha = smooth((m - 0.3) / 0.7);
    if (cardAlpha > 0) {
      ctx.globalAlpha = alpha * cardAlpha;
      const pad = 44 * u;
      const s = cw - pad * 2;
      drawCover(ctx, x + pad, y + pad, s, 30 * u);
      let ty = y + pad + s + 70 * u;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = rgba(ink, 1);
      ctx.font = `800 ${42 * u}px ${KARAOKE_FONT}`;
      ctx.fillText(fitText(ctx, options.title || "Без названия", s - 70 * u), x + pad, ty);
      ctx.fillStyle = rgba(accent, 1);
      ctx.beginPath();
      ctx.arc(x + pad + s - 20 * u, ty - 14 * u, 20 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 4 * u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(x + pad + s - 29 * u, ty - 14 * u);
      ctx.lineTo(x + pad + s - 22 * u, ty - 7 * u);
      ctx.lineTo(x + pad + s - 11 * u, ty - 21 * u);
      ctx.stroke();
      ty += 46 * u;
      ctx.fillStyle = rgba(ink, 0.55);
      ctx.font = `500 ${30 * u}px ${KARAOKE_FONT}`;
      ctx.fillText(fitText(ctx, options.artist, s), x + pad, ty);

      ty += 52 * u;
      const progress = options.trackDuration > 0 ? clamp(t / options.trackDuration) : 0;
      ctx.fillStyle = rgba(ink, 0.16);
      ctx.beginPath();
      ctx.roundRect(x + pad, ty, s, 8 * u, 4 * u);
      ctx.fill();
      ctx.fillStyle = rgba(ink, 1);
      ctx.beginPath();
      ctx.roundRect(x + pad, ty, Math.max(8 * u, s * progress), 8 * u, 4 * u);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + pad + s * progress, ty + 4 * u, 11 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(ink, 0.45);
      ctx.font = `600 ${22 * u}px ${KARAOKE_FONT}`;
      ctx.fillText(formatClock(t), x + pad, ty + 44 * u);
      ctx.textAlign = "right";
      ctx.fillText(formatClock(options.trackDuration), x + pad + s, ty + 44 * u);

      const by = ty + 118 * u;
      // The card opens on ▶ and then "gets pressed": a little pop, and it turns into ⏸.
      const pressAt = MORPH_END + 0.4;
      const pressed = smooth((rel - pressAt) / 0.25);
      const pop = 1 - 0.12 * Math.sin(Math.PI * clamp((rel - pressAt + 0.1) / 0.35));
      const baseAlpha = ctx.globalAlpha;
      ctx.save();
      ctx.translate(cx, by);
      ctx.scale(pop, pop);
      ctx.translate(-cx, -by);
      ctx.fillStyle = rgba(ink, 1);
      ctx.beginPath();
      ctx.arc(cx, by, 48 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = light ? "#fff" : "#111";
      if (pressed < 1) {
        ctx.globalAlpha = baseAlpha * (1 - pressed);
        ctx.beginPath();
        ctx.moveTo(cx - 11 * u, by - 20 * u);
        ctx.lineTo(cx + 19 * u, by);
        ctx.lineTo(cx - 11 * u, by + 20 * u);
        ctx.closePath();
        ctx.fill();
      }
      if (pressed > 0) {
        ctx.globalAlpha = baseAlpha * pressed;
        ctx.beginPath();
        ctx.roundRect(cx - 15 * u, by - 18 * u, 10 * u, 36 * u, 3 * u);
        ctx.roundRect(cx + 5 * u, by - 18 * u, 10 * u, 36 * u, 3 * u);
        ctx.fill();
      }
      ctx.restore();
      ctx.fillStyle = rgba(ink, 0.85);
      for (const dir of [-1, 1]) {
        const bx = cx + dir * 150 * u;
        ctx.beginPath();
        ctx.moveTo(bx + dir * 14 * u, by);
        ctx.lineTo(bx - dir * 12 * u, by - 18 * u);
        ctx.lineTo(bx - dir * 12 * u, by + 18 * u);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(bx + dir * 14 * u - (dir > 0 ? 0 : 6 * u), by - 18 * u, 6 * u, 36 * u);
      }
    }
    }
    if (m > 0) drawSheen(ctx, x, y, cw, ch, rel, angle, alpha * m, u);
    ctx.restore();
    ctx.restore();
    return { bottom: cy + (ch / 2) * scale, alpha, ...geometry };
  }

  /** Glass-like light on the card: a diagonal streak gliding across it, and a thin bright rim at the top edge. */
  function drawSheen(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cw: number,
    ch: number,
    rel: number,
    angle: number,
    alpha: number,
    u: number
  ) {
    ctx.save();
    if (look.shine) {
      // One pass every 3.4 s; turning the card shifts the reflection, as on real glass.
      const cycle = (((rel - MORPH_END) / 3.4) % 1 + 1) % 1;
      const p = lerp(-0.45, 1.45, smooth(cycle * 1.25)) + Math.sin(angle) * 0.35;
      const g = ctx.createLinearGradient(x, y, x + cw, y + ch * 0.7);
      const strong = light ? 0.35 : 0.13;
      g.addColorStop(clamp(p - 0.2), "rgba(255,255,255,0)");
      g.addColorStop(clamp(p - 0.05), `rgba(255,255,255,${strong * 0.6})`);
      g.addColorStop(clamp(p), `rgba(255,255,255,${strong})`);
      g.addColorStop(clamp(p + 0.04), `rgba(255,255,255,${strong * 0.35})`);
      g.addColorStop(clamp(p + 0.1), `rgba(255,255,255,${strong * 0.55})`);
      g.addColorStop(clamp(p + 0.22), "rgba(255,255,255,0)");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cw, ch);
    }
    // Rim light: brightest along the top-left, fading round the card.
    const rim = ctx.createLinearGradient(x, y, x + cw * 0.6, y + ch);
    rim.addColorStop(0, `rgba(255,255,255,${light ? 0.7 : 0.28})`);
    rim.addColorStop(0.45, "rgba(255,255,255,0.04)");
    rim.addColorStop(1, `rgba(255,255,255,${light ? 0.2 : 0.08})`);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rim;
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.roundRect(x + 1 * u, y + 1 * u, cw - 2 * u, ch - 2 * u, 55 * u);
    ctx.stroke();
    ctx.restore();
  }

  /** The back of the card, seen mid-spin: blurred cover with the logo. */
  function drawBackFace(ctx: CanvasRenderingContext2D, x: number, y: number, cw: number, ch: number, u: number, ink: Rgb) {
    if (options.cover) {
      const side = Math.min(options.cover.naturalWidth, options.cover.naturalHeight);
      ctx.save();
      ctx.globalAlpha *= 0.3;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        options.cover,
        (options.cover.naturalWidth - side) / 2,
        (options.cover.naturalHeight - side) / 2,
        side,
        side,
        x - cw * 0.2,
        y,
        cw * 1.4,
        ch
      );
      ctx.restore();
    }
    const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
    g.addColorStop(0, rgba(accent, 0.55));
    g.addColorStop(1, rgba(mix(accent, [10, 8, 20], 0.8), 0.85));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, cw, ch);
    const cx = x + cw / 2;
    const cy = y + ch / 2;
    const size = Math.min(cw, ch) * 0.34;
    if (options.logo) ctx.drawImage(options.logo, cx - size / 2, cy - size / 2 - 30 * u, size, size);
    ctx.fillStyle = rgba(ink, 0.9);
    ctx.font = `800 ${Math.max(14, 34 * u * (cw / (700 * u)))}px ${KARAOKE_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ICECREAMMUSIC", cx, cy + size / 2 + 10 * u);
  }

  /** Card's turn around its vertical axis: sways and spins a few times, settling before it leaves. */
  function playerAngle(rel: number) {
    // The sway settles before the card leaves, so it shrinks away facing the viewer.
    const settle = 1 - smooth((rel - CARD_OUT_START + 0.6) / 0.7);
    const sway = 0.32 * Math.sin(rel * 0.95) * smooth((rel - MORPH_END) / 1.2) * settle;
    let spin = 0;
    for (const at of spins) spin += smooth((rel - at) / SPIN_TIME) * Math.PI * 2;
    return sway + spin;
  }

  /** Draws the flat layer onto the frame in vertical strips, each scaled for perspective. */
  function project(
    ctx: CanvasRenderingContext2D,
    source: HTMLCanvasElement,
    box: { x: number; y: number; w: number; h: number },
    cx: number,
    cy: number,
    angle: number,
    u: number
  ) {
    const cos = Math.abs(Math.cos(angle));
    if (cos < 0.015) return;
    // The back face is drawn facing the camera, so it turns by the angle minus half a turn.
    const sin = Math.cos(angle) >= 0 ? Math.sin(angle) : -Math.sin(angle);
    const depth = 2600 * u;
    const strips = 64;
    const map = (X: number) => {
      const k = depth / (depth + X * sin);
      return { x: cx + X * cos * k, k };
    };
    for (let i = 0; i < strips; i++) {
      const sx = box.x + (box.w * i) / strips;
      const sw = box.w / strips;
      const a = map(sx - cx);
      const b = map(sx + sw - cx);
      const k = (a.k + b.k) / 2;
      const left = Math.min(a.x, b.x);
      const width = Math.abs(b.x - a.x) + 0.8;
      ctx.drawImage(source, sx, box.y, sw, box.h, left, cy + (box.y - cy) * k, width, box.h * k);
    }
  }

  function drawPlayer(ctx: CanvasRenderingContext2D, w: number, h: number, rel: number, t: number, level: number) {
    if (!look.intro) return { bottom: h * 0.5, alpha: 0 };
    const u = w / 1080;
    if (!layer || layer.canvas.width !== w || layer.canvas.height !== h) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const lctx = canvas.getContext("2d");
      if (!lctx) return { bottom: h * 0.5, alpha: 0 };
      layer = { canvas, ctx: lctx };
    }
    const angle = playerAngle(rel);
    const face = Math.cos(angle) >= 0 ? "front" : "back";
    const lctx = layer.ctx;
    lctx.clearRect(0, 0, w, h);
    const result = drawPlayerFlat(lctx, w, h, rel, t, level, face, angle);
    if (result.alpha <= 0) return result;
    // Room around the card for its glow.
    const pad = 110 * u;
    const box = {
      x: Math.max(0, result.x - pad),
      y: Math.max(0, result.y - pad),
      w: Math.min(w, result.cw + pad * 2),
      h: Math.min(h, result.ch + pad * 2)
    };
    // Leaving, the card goes out of focus as it shrinks, like the reference.
    const defocus = smooth((rel - CARD_OUT_START) / (CARD_OUT_END - CARD_OUT_START));
    if (CAN_BLUR && defocus > 0) ctx.filter = `blur(${(defocus * 18 * u).toFixed(2)}px)`;
    project(ctx, layer.canvas, box, result.cx, result.cy, angle, u);
    if (CAN_BLUR) ctx.filter = "none";
    return result;
  }

  /** The current line as a centred subtitle under the card; lines cross-fade instead of swapping. */
  function drawSubtitle(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, top: number, alpha: number) {
    if (alpha <= 0 || lines.length === 0) return;
    const u = w / 1080;
    const y0 = Math.max(top + 70 * u, h * 0.5 + 100 * u);
    const base = look.inactiveOpacity;
    ctx.save();
    ctx.font = `700 ${40 * u}px ${KARAOKE_FONT}`;
    const idx = activeLineIndex(lines, t + ON_LEAD);
    const from = Math.max(0, idx - 1);
    for (let i = from; i <= Math.max(0, idx); i++) {
      const line = lines[i]!;
      const isCurrent = i === Math.max(0, idx);
      const swap = idx <= 0 ? 1 : smooth((t - lines[idx]!.begin + ON_LEAD) / 0.35);
      const a = isCurrent ? (idx < 0 ? 1 : swap) : 1 - swap;
      if (a <= 0) continue;
      const shift = isCurrent ? (1 - a) * 24 * u : -(1 - a) * 24 * u;
      ctx.globalAlpha = alpha * a;
      const rows = rowsFor(ctx, "sub", line.text, w * 0.78);
      const fill = idx < 0 ? 0 : look.highlight === "line" ? 1 : lineFill(line, t);
      drawSweptRows(ctx, rows, w / 2, y0 + shift, 52 * u, "center", fill, rgba(text, 1), rgba(text, Math.max(base, 0.4)));
    }
    ctx.restore();
  }

  /** Full-screen lyrics: the sung line lights up, the rest stay dim, and the list glides upward. */
  function drawLyrics(ctx: CanvasRenderingContext2D, w: number, h: number, rel: number, t: number) {
    // With the intro, the lyrics fade in and grow to full size as the card shrinks away.
    const reveal = look.intro ? smooth((rel - CARD_OUT_START) / (CARD_OUT_END - CARD_OUT_START + 0.2)) : 1;
    const appear = look.intro ? smooth((rel - CARD_OUT_START - 0.05) / 0.8) : 1;
    if (reveal <= 0 || lines.length === 0) return;
    const u = w / 1080;
    const fontSize = 66 * u * look.textScale;
    const lineHeight = fontSize * 1.2;
    const gap = fontSize * 0.7;
    const side = 84 * u;
    const maxWidth = w - side * 2;
    const center = look.align === "center";
    const x = center ? w / 2 : side;
    const base = look.inactiveOpacity;

    ctx.save();
    const revealBlur = (1 - reveal) * 20 * u;
    if (reveal < 1) {
      // The text comes forward from slightly smaller while it fades in behind the shrinking card.
      const zoom = lerp(0.86, 1, reveal);

      const cy = h * 0.43;
      ctx.translate(w / 2, cy);
      ctx.scale(zoom, zoom);
      ctx.translate(-w / 2, -cy);
    }
    ctx.font = `800 ${fontSize}px ${KARAOKE_FONT}`;
    const blocks = lines.map((l, i) => rowsFor(ctx, `ly${i}`, l.text, maxWidth / 1.04));
    const heights = blocks.map((rows) => rows.length * lineHeight);
    const tops: number[] = [];
    let acc = 0;
    for (const hgt of heights) {
      tops.push(acc);
      acc += hgt + gap;
    }

    const anchorY = h * 0.36;
    const offset = anchorY - scrollFocus(tops, t);
    const idx = activeLineIndex(lines, t);

    lines.forEach((line, i) => {
      const y = offset + tops[i]!;
      if (y > h + lineHeight || y + heights[i]! < -lineHeight) return;
      const act = activeness(i, t);
      // Lines far below the focus fade a little more, like the tail of a list.
      const below = Math.max(0, i - Math.max(0, idx) - 2);
      const rest = base * Math.max(0.45, 1 - below * 0.15);
      const edgeFade = smooth(y / (h * 0.16)) * smooth((h * 0.8 - y) / (h * 0.16));
      if (edgeFade <= 0) return;
      ctx.globalAlpha = appear * edgeFade;

      // The lit line grows a touch, pivoting on its own edge.
      const scale = 1 + 0.04 * act;
      const pivotY = y + heights[i]! / 2;
      ctx.save();
      // Lines away from the sung one sit slightly out of focus; the lit line is always sharp.
      const lineBlur = (1 - act) * Math.min(4, Math.max(0, Math.abs(i - Math.max(0, idx)) - 1) * 1.6) * u;
      if (CAN_BLUR && revealBlur + lineBlur > 0.3) ctx.filter = `blur(${(revealBlur + lineBlur).toFixed(2)}px)`;
      ctx.translate(x, pivotY);
      ctx.scale(scale, scale);
      ctx.translate(-x, -pivotY);
      if (act > 0.001) {
        const fill = look.highlight === "line" ? 1 : lineFill(line, t);
        const bright = rgba(text, lerp(rest, 1, act));
        const dim = rgba(text, lerp(rest, Math.max(rest, 0.42), act));
        drawSweptRows(ctx, blocks[i]!, x, y, lineHeight, center ? "center" : "left", fill, bright, dim);
      } else {
        ctx.textAlign = center ? "center" : "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = rgba(text, rest);
        blocks[i]!.forEach((row, r) => ctx.fillText(row, x, y + r * lineHeight));
      }
      ctx.restore();
    });
    ctx.restore();
  }

  /** Small logo and address centred at the very bottom — there, but out of the way. */
  function drawWatermark(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (!options.watermark) return;
    const u = w / 1080;
    const ink: Rgb = light ? [20, 18, 30] : [255, 255, 255];
    ctx.save();
    ctx.font = `600 ${21 * u}px ${KARAOKE_FONT}`;
    const tw = ctx.measureText(WATERMARK_TEXT).width;
    const icon = options.logo ? 30 * u : 0;
    const gapX = icon ? 9 * u : 0;
    const y = h - 78 * u;
    const x = (w - (icon + gapX + tw)) / 2;
    ctx.globalAlpha = 0.5;
    if (options.logo) ctx.drawImage(options.logo, x, y - icon / 2, icon, icon);
    ctx.fillStyle = rgba(ink, 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(WATERMARK_TEXT, x + icon + gapX, y + 1 * u);
    ctx.restore();
  }

  return {
    draw(ctx, w, h, trackTime, level) {
      const rel = trackTime - options.clipStart;
      // Fade the whole frame in and out at the clip edges.
      const edge = smooth(rel / 0.3) * smooth((D - rel) / 0.5);
      drawBackground(ctx, w, h, rel, level);
      // Lyrics go first so the shrinking card stays on top while they open out behind it.
      drawLyrics(ctx, w, h, rel, trackTime);
      const player = drawPlayer(ctx, w, h, rel, trackTime, level);
      // The subtitle clears out faster than the card so it never sits over the opening lyrics.
      drawSubtitle(ctx, w, h, trackTime, player.bottom, player.alpha ** 4);
      drawWatermark(ctx, w, h);
      if (edge < 1) {
        ctx.fillStyle = light ? `rgba(243,241,248,${1 - edge})` : `rgba(0,0,0,${1 - edge})`;
        ctx.fillRect(0, 0, w, h);
      }
    }
  };
}

/** 0..1 energy from the low part of an analyser's byte spectrum. */
export function levelFromSpectrum(data: Uint8Array) {
  const n = Math.max(1, Math.floor(data.length / 6));
  let sum = 0;
  for (let i = 0; i < n; i++) sum += data[i]!;
  return clamp(sum / n / 255);
}
