import { clamp, DISPLAY_FONT, fitFontSize, type SceneContext, smoothstep, wrapLines } from "./draw-utils";
import type { LyricLine } from "./types";

const LAST_LINE_SECONDS = 4;
const FADE_SECONDS = 0.25;

interface ActiveLine {
  line: LyricLine;
  next: LyricLine | null;
  previous: LyricLine | null;
  /** 0..1 through the line. */
  progress: number;
  /** Fades the line in at its start and out at its end. */
  presence: number;
}

/** The line being sung at this moment of the track, if any. */
export function activeLyricLine(lines: LyricLine[], trackTime: number): ActiveLine | null {
  const sorted = lines.filter((line) => line.text.trim()).slice().sort((a, b) => a.start - b.start);
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const line = sorted[index];
    if (trackTime < line.start) continue;
    const next = sorted[index + 1] ?? null;
    const end = next ? next.start : line.start + LAST_LINE_SECONDS;
    if (trackTime >= end) return null;
    const duration = Math.max(0.2, end - line.start);
    return {
      line,
      next,
      previous: sorted[index - 1] ?? null,
      progress: clamp((trackTime - line.start) / duration, 0, 1),
      presence: Math.min(smoothstep(line.start, line.start + FADE_SECONDS, trackTime), 1 - smoothstep(end - FADE_SECONDS, end, trackTime))
    };
  }
  return null;
}

function lineY(scene: SceneContext) {
  const tall = scene.height > scene.width * 1.4;
  switch (scene.settings.lyrics.position) {
    case "top":
      return scene.height * (tall ? 0.17 : 0.14);
    case "middle":
      return scene.height * 0.5;
    case "bottom":
    default:
      return scene.height * (tall ? 0.74 : 0.82);
  }
}

/** Karaoke: the current line fills with colour as it is sung, the next one waits below. */
export function drawKaraoke(scene: SceneContext) {
  const { ctx, width, unit, settings, frame } = scene;
  const active = activeLyricLine(settings.lyrics.lines, frame.trackTime);
  if (!active) return;
  const maxWidth = width * 0.86;
  const size = fitFontSize(ctx, active.line.text, maxWidth, unit * 0.07, 800, DISPLAY_FONT);
  const centerY = lineY(scene);
  ctx.save();
  ctx.globalAlpha = active.presence;
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textWidth = ctx.measureText(active.line.text).width;
  const left = width / 2 - textWidth / 2;

  // Soft backing so the line reads over any template.
  const band = ctx.createLinearGradient(0, centerY - size * 1.6, 0, centerY + size * 1.9);
  band.addColorStop(0, "rgba(0,0,0,0)");
  band.addColorStop(0.3, "rgba(0,0,0,0.55)");
  band.addColorStop(0.7, "rgba(0,0,0,0.55)");
  band.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, centerY - size * 1.6, width, size * 3.5);

  const lift = (1 - active.presence) * unit * 0.02;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.35;
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillText(active.line.text, width / 2, centerY + lift);
  ctx.shadowColor = "transparent";

  // The sung part turns bright white with a glow in the cover's accent colour.
  ctx.save();
  ctx.beginPath();
  ctx.rect(left - size, centerY - size, (textWidth + size) * active.progress + size * 0.2, size * 2);
  ctx.clip();
  ctx.shadowColor = settings.palette[0];
  ctx.shadowBlur = size * (0.5 + frame.audio.bass * 0.6);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(active.line.text, width / 2, centerY + lift);
  ctx.restore();

  if (active.next) {
    const nextSize = fitFontSize(ctx, active.next.text, maxWidth, size * 0.62, 600, DISPLAY_FONT);
    ctx.font = `600 ${nextSize}px ${DISPLAY_FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fillText(active.next.text, width / 2, centerY + size * 1.05 + lift);
  }
  ctx.restore();
}

/** Background lyrics: the current line set huge and faint behind the template. */
export function drawBackgroundLyrics(scene: SceneContext) {
  const { ctx, width, height, unit, settings, frame } = scene;
  const active = activeLyricLine(settings.lyrics.lines, frame.trackTime);
  if (!active) return;
  const text = active.line.text.toUpperCase();
  const maxWidth = width * 0.9;
  ctx.save();
  ctx.font = `800 ${unit * 0.16}px ${DISPLAY_FONT}`;
  const lines = wrapLines(ctx, text, maxWidth, 4);
  const widest = lines.reduce((a, b) => (ctx.measureText(a).width > ctx.measureText(b).width ? a : b), "");
  const size = fitFontSize(ctx, widest, maxWidth, unit * 0.16, 800, DISPLAY_FONT);
  const lineHeight = size * 0.92;
  const top = height / 2 - (lineHeight * lines.length) / 2 + lineHeight * 0.75;
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
  ctx.textAlign = "center";
  ctx.globalAlpha = 0.28 * active.presence + frame.audio.kick * 0.06;
  ctx.fillStyle = "#ffffff";
  lines.forEach((line, index) => {
    const drift = (active.progress - 0.5) * unit * 0.04 * (index % 2 === 0 ? 1 : -1);
    ctx.fillText(line, width / 2 + drift, top + index * lineHeight);
  });
  ctx.restore();
}

/** Spreads lines evenly over the clip — a quick start before tap-syncing. */
export function distributeLyrics(texts: string[], clipStart: number, clipDuration: number): LyricLine[] {
  const usable = texts.map((text) => text.trim()).filter(Boolean);
  if (!usable.length) return [];
  const step = clipDuration / usable.length;
  return usable.map((text, index) => ({ text, start: Math.round((clipStart + index * step) * 100) / 100 }));
}
