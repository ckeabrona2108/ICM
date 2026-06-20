"use client";

import {
  buildSpectralProfile,
  calculateAverageEnergy,
  formatSnippetTime,
  getLayout,
  type VideoSnippetBackground,
  type VideoSnippetSpectrum,
  type VideoSnippetStyle
} from "@/lib/video-snippets";

import type { VideoSnippetRenderState } from "./video-snippet-state";

export type CoverImage = {
  image: HTMLImageElement;
  width: number;
  height: number;
  loadedAt: number;
};

type RendererMotionState = {
  bassEnergy: number;
  midEnergy: number;
  trebleEnergy: number;
  peakEnergy: number;
  smoothedBass: number;
  lastBass: number;
  bassImpact: number;
  dropImpact: number;
  lastDropTriggerTime: number;
  kickAmount: number;
  textPulseScale: number;
  textFloatOffset: number;
  coverScale: number;
  coverOffsetY: number;
  glowBurst: number;
  textShakeX: number;
  textShakeY: number;
  flashAlpha: number;
  vinylRotation: number;
  spectrumBars: number[];
  waveBars: number[];
  dotBars: number[];
  circleBars: number[];
  orbBars: number[];
  blurCanvas: HTMLCanvasElement | null;
  blurContext: CanvasRenderingContext2D | null;
  blurCacheKey: string;
};

type BassReactionState = {
  bassEnergy: number;
  midEnergy: number;
  trebleEnergy: number;
  peakEnergy: number;
  smoothedBass: number;
  bassImpact: number;
  dropImpact: number;
  coverPulse: number;
  backgroundPulse: number;
  spectrumPulse: number;
  glowBurst: number;
  shakeAmount: number;
  flashAlpha: number;
};

const rendererMotionState = new WeakMap<HTMLCanvasElement, RendererMotionState>();

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseRgba(color: string, alpha = 1): string {
  if (!color.startsWith("#")) return color;
  const normalized = color.slice(1);
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;
  if (expanded.length !== 6) return color;
  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const effectiveRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + effectiveRadius, y);
  context.arcTo(x + width, y, x + width, y + height, effectiveRadius);
  context.arcTo(x + width, y + height, x, y + height, effectiveRadius);
  context.arcTo(x, y + height, x, y, effectiveRadius);
  context.arcTo(x, y, x + effectiveRadius, y, effectiveRadius);
  context.closePath();
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  cover: CoverImage,
  centerX: number,
  centerY: number,
  size: number,
  width = size,
  height = size
) {
  if (!cover.width || !cover.height) return;
  const scale = Math.max(width / cover.width, height / cover.height);
  const drawWidth = cover.width * scale;
  const drawHeight = cover.height * scale;
  context.drawImage(cover.image, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);
}

function getRendererState(canvas: HTMLCanvasElement) {
  const existing = rendererMotionState.get(canvas);
  if (existing) return existing;
  const blurCanvas = document.createElement("canvas");
  const blurContext = blurCanvas.getContext("2d");
  const created: RendererMotionState = {
    bassEnergy: 0,
    midEnergy: 0,
    trebleEnergy: 0,
    peakEnergy: 0,
    smoothedBass: 0,
    lastBass: 0,
    bassImpact: 0,
    dropImpact: 0,
    lastDropTriggerTime: Number.NEGATIVE_INFINITY,
    kickAmount: 0,
    textPulseScale: 1,
    textFloatOffset: 0,
    coverScale: 1,
    coverOffsetY: 0,
    glowBurst: 0,
    textShakeX: 0,
    textShakeY: 0,
    flashAlpha: 0,
    vinylRotation: 0,
    spectrumBars: [],
    waveBars: [],
    dotBars: [],
    circleBars: [],
    orbBars: [],
    blurCanvas,
    blurContext,
    blurCacheKey: ""
  };
  rendererMotionState.set(canvas, created);
  return created;
}

function bassFromSpectrum(spectrum: Uint8Array) {
  if (!spectrum.length) return 0;
  return (
    (spectrum[2] ?? 0) * 0.4 +
    (spectrum[4] ?? 0) * 0.4 +
    (spectrum[5] ?? 0) * 0.2
  );
}

function trebleFromSpectrum(spectrum: Uint8Array) {
  if (!spectrum.length) return 0;
  const start = Math.max(0, Math.floor(spectrum.length * 0.62));
  let total = 0;
  let count = 0;
  for (let index = start; index < spectrum.length; index += 1) {
    total += spectrum[index] ?? 0;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function smoothSeries(values: number[], previous: number[], attack: number, release: number) {
  const next = new Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const target = values[index] ?? 0;
    const current = previous[index] ?? target;
    const smoothing = target > current ? attack : release;
    next[index] = current + (target - current) * smoothing;
  }
  return next;
}

function buildWaveProfile(samples: Uint8Array, bandCount = 40) {
  if (!samples.length) return Array.from({ length: bandCount }, () => 0);
  const bands = Array.from({ length: bandCount }, () => 0);
  const sliceSize = Math.max(1, Math.floor(samples.length / bandCount));
  for (let band = 0; band < bandCount; band += 1) {
    const start = band * sliceSize;
    const end = band === bandCount - 1 ? samples.length : Math.min(samples.length, start + sliceSize);
    let total = 0;
    for (let index = start; index < end; index += 1) {
      total += Math.abs((samples[index] ?? 128) - 128) / 128;
    }
    bands[band] = total / Math.max(1, end - start);
  }
  return bands;
}

function averageSpectrumRange(spectrum: Uint8Array, startRatio: number, endRatio: number) {
  if (!spectrum.length) return 0;
  const start = Math.max(0, Math.floor(spectrum.length * startRatio));
  const end = Math.max(start + 1, Math.min(spectrum.length, Math.ceil(spectrum.length * endRatio)));
  let total = 0;
  let count = 0;
  for (let index = start; index < end; index += 1) {
    total += (spectrum[index] ?? 0) / 255;
    count += 1;
  }
  return count > 0 ? total / count : 0;
}

function peakFromWaveform(waveform: Uint8Array) {
  if (!waveform.length) return 0;
  let peak = 0;
  for (let index = 0; index < waveform.length; index += 1) {
    const centered = Math.abs(((waveform[index] ?? 128) - 128) / 128);
    if (centered > peak) peak = centered;
  }
  return peak;
}

function updateBassReaction(
  motion: RendererMotionState,
  state: VideoSnippetRenderState,
  renderTimeSeconds: number,
  activeDrop: boolean
): BassReactionState {
  const frequencyData = state.playback?.frequencyData ?? new Uint8Array(0);
  const waveformData = state.playback?.waveformData ?? new Uint8Array(0);
  const controls = state.config.bassReactionControls;
  const sensitivity = clamp(controls.bassSensitivity / 100, 0, 2);
  const smoothness = clamp(controls.bassSmoothness / 100, 0, 1);
  const attack = clamp(0.26 - smoothness * 0.16, 0.06, 0.26);
  const release = clamp(0.14 - smoothness * 0.09, 0.025, 0.14);

  const bassEnergy = clamp(averageSpectrumRange(frequencyData, 0, 0.14) * (0.95 + sensitivity * 0.7), 0, 1.8);
  const midEnergy = clamp(averageSpectrumRange(frequencyData, 0.14, 0.5) * (0.9 + sensitivity * 0.28), 0, 1.4);
  const trebleEnergy = clamp(averageSpectrumRange(frequencyData, 0.5, 1) * (0.88 + sensitivity * 0.22), 0, 1.3);
  const waveformPeak = peakFromWaveform(waveformData);
  const peakEnergy = clamp(Math.max(waveformPeak, bassEnergy * 0.72 + trebleEnergy * 0.28), 0, 1.6);

  motion.smoothedBass += (bassEnergy - motion.smoothedBass) * (bassEnergy > motion.smoothedBass ? attack : release);
  const transient = Math.max(0, bassEnergy - motion.smoothedBass * 0.92);
  const rising = Math.max(0, bassEnergy - motion.lastBass);
  motion.lastBass = bassEnergy;

  const targetImpact = clamp(transient * 1.6 + rising * 0.9 + peakEnergy * 0.22, 0, 1.7);
  motion.bassImpact += (targetImpact - motion.bassImpact) * (targetImpact > motion.bassImpact ? 0.48 : 0.1);

  const strongPeak = motion.bassImpact > 0.62 && peakEnergy > 0.78;
  const canTriggerPeakDrop = renderTimeSeconds - motion.lastDropTriggerTime > 0.26;
  if ((activeDrop || strongPeak) && canTriggerPeakDrop) {
    const triggerStrength = activeDrop ? 1 : clamp(motion.bassImpact * 1.18 + peakEnergy * 0.34, 0, 1.2);
    motion.dropImpact = Math.max(motion.dropImpact, triggerStrength);
    motion.glowBurst = Math.max(motion.glowBurst, triggerStrength);
    motion.flashAlpha = Math.max(motion.flashAlpha, triggerStrength * 0.34);
    motion.lastDropTriggerTime = renderTimeSeconds;
  }

  motion.dropImpact += (0 - motion.dropImpact) * (activeDrop ? 0.035 : 0.11);
  motion.glowBurst += (0 - motion.glowBurst) * 0.14;
  motion.flashAlpha += (0 - motion.flashAlpha) * 0.18;

  const shakePower = clamp(controls.shakeAmount / 50, 0, 1) * clamp((motion.dropImpact + peakEnergy * 0.18) * 1.1, 0, 1);
  motion.textShakeX = (Math.random() - 0.5) * shakePower * 12;
  motion.textShakeY = (Math.random() - 0.5) * shakePower * 8;
  motion.bassEnergy = bassEnergy;
  motion.midEnergy = midEnergy;
  motion.trebleEnergy = trebleEnergy;
  motion.peakEnergy = peakEnergy;

  return {
    bassEnergy,
    midEnergy,
    trebleEnergy,
    peakEnergy,
    smoothedBass: motion.smoothedBass,
    bassImpact: motion.bassImpact,
    dropImpact: motion.dropImpact,
    coverPulse: clamp(controls.coverPulse / 100, 0, 1),
    backgroundPulse: clamp(controls.backgroundPulse / 100, 0, 1),
    spectrumPulse: clamp(controls.spectrumPulse / 100, 0, 1),
    glowBurst: clamp((controls.glowBurst / 100) * (motion.glowBurst + motion.bassImpact * 0.55), 0, 1.6),
    shakeAmount: shakePower,
    flashAlpha: clamp(motion.flashAlpha * (controls.dropImpact / 100), 0, 0.42)
  };
}

function clearFrame(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  accentColor: string
) {
  context.clearRect(0, 0, canvasWidth, canvasHeight);
  context.fillStyle = "#050509";
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  const gradient = context.createRadialGradient(
    canvasWidth / 2,
    canvasHeight / 2,
    0,
    canvasWidth / 2,
    canvasHeight / 2,
    Math.max(canvasWidth, canvasHeight) * 0.82
  );
  gradient.addColorStop(0, parseRgba(accentColor, 0.22));
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
}

function rebuildBlurredBackground(
  motion: RendererMotionState,
  cover: CoverImage,
  canvasWidth: number,
  canvasHeight: number,
  blurBackground: number
) {
  const blurContext = motion.blurContext;
  const blurCanvas = motion.blurCanvas;
  if (!blurContext || !blurCanvas) return;

  const blurPixels = 24 + blurBackground * 36;
  const cacheKey = `${cover.image.src}:${canvasWidth}:${canvasHeight}:${blurPixels.toFixed(2)}`;
  if (cacheKey === motion.blurCacheKey) return;

  blurCanvas.width = canvasWidth;
  blurCanvas.height = canvasHeight;
  blurContext.clearRect(0, 0, canvasWidth, canvasHeight);
  blurContext.filter = `blur(${blurPixels}px) saturate(1.15) brightness(0.68)`;
  drawImageCover(blurContext, cover, canvasWidth / 2, canvasHeight / 2, canvasWidth, canvasWidth * 1.06, canvasHeight * 1.06);
  blurContext.filter = "none";
  motion.blurCacheKey = cacheKey;
}

function drawBackground(
  context: CanvasRenderingContext2D,
  motion: RendererMotionState,
  backgroundControls: VideoSnippetRenderState["config"]["backgroundControls"],
  bassReactionControls: VideoSnippetRenderState["config"]["bassReactionControls"],
  accentColor: string,
  cover: CoverImage | null,
  background: CoverImage | null,
  canvasWidth: number,
  canvasHeight: number,
  progress: number,
  intensity: number,
  bass: number,
  reaction: BassReactionState
) {
  const blurSource = backgroundControls.mode === "custom-image" ? background ?? cover : backgroundControls.mode === "auto-cover" ? cover : null;
  const brightness = clamp(backgroundControls.brightness / 100, 0, 2);
  const opacity = clamp(backgroundControls.opacity / 100, 0, 1);
  const scale = clamp(backgroundControls.scale / 100, 1, 2);
  const blur = clamp(backgroundControls.blur / 100, 0, 1);
  const motionEnabled = backgroundControls.motion;
  const motionSpeed = clamp(backgroundControls.motionSpeed, 0.1, 5);
  const pulseAmount = reaction.bassImpact * reaction.backgroundPulse + reaction.dropImpact * clamp(bassReactionControls.dropImpact / 100, 0, 1);
  const phase = progress * Math.PI * 2 * (motionSpeed + pulseAmount * 0.4);
  const bassGlow = clamp((bass / 255) * 0.18 + pulseAmount * 0.16 + reaction.glowBurst * 0.1, 0, 0.42);
  const motionX = motionEnabled ? Math.sin(phase * 0.73) * canvasWidth * (0.02 + pulseAmount * 0.012) : 0;
  const motionY = motionEnabled ? Math.cos(phase * 0.61) * canvasHeight * (0.02 + pulseAmount * 0.01) : 0;
  const blurBoost = clamp(blur + pulseAmount * 0.16, 0, 1);
  const brightnessBoost = clamp(brightness + pulseAmount * 0.22, 0.4, 2.3);
  const scaleBoost = clamp(scale + pulseAmount * 0.08, 1, 2.2);

  if (blurSource) {
    rebuildBlurredBackground(motion, blurSource, canvasWidth, canvasHeight, blur);
    if (motion.blurCanvas) {
      context.save();
      context.globalAlpha = opacity * clamp(0.4 + brightnessBoost * 0.35 + pulseAmount * 0.14, 0.2, 1);
      context.filter = `blur(${Math.round(blurBoost * 40)}px) brightness(${brightnessBoost}) saturate(${1.08 + intensity * 0.12 + pulseAmount * 0.18})`;
      drawImageCover(
        context,
        blurSource,
        canvasWidth / 2 + motionX,
        canvasHeight / 2 + motionY,
        canvasWidth * scaleBoost,
        canvasWidth * scaleBoost,
        canvasHeight * scaleBoost
      );
      context.filter = "none";
      context.restore();
    }
  }

  const gradient = context.createLinearGradient(0, 0, canvasWidth, canvasHeight);
  if (backgroundControls.mode === "gradient" || backgroundControls.mode === "auto-cover" || backgroundControls.mode === "custom-image") {
    gradient.addColorStop(0, parseRgba(accentColor, clamp(0.26 + bassGlow, 0, 1)));
    gradient.addColorStop(0.48, "rgba(7, 8, 13, 0.84)");
    gradient.addColorStop(1, "rgba(5, 5, 9, 0.98)");
  } else if (backgroundControls.mode === "animated-gradient") {
    gradient.addColorStop(0, parseRgba(accentColor, clamp(0.26 + Math.sin(phase) * 0.12 + bassGlow, 0, 1)));
    gradient.addColorStop(0.42, parseRgba(accentColor, clamp(0.12 + Math.cos(phase * 0.7) * 0.12, 0, 0.8)));
    gradient.addColorStop(1, "rgba(5, 5, 9, 0.98)");
  } else {
    gradient.addColorStop(0, parseRgba(accentColor, clamp(0.12 + bassGlow * 0.5, 0, 0.4)));
    gradient.addColorStop(1, "rgba(5, 5, 9, 0.98)");
  }

  context.fillStyle = gradient;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  if (backgroundControls.mode === "solid-color") {
    context.fillStyle = parseRgba(accentColor, clamp(0.12 + bassGlow * 0.3, 0, 0.35));
    context.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  const radialGlow = context.createRadialGradient(
    canvasWidth * 0.5,
    canvasHeight * 0.32,
    0,
    canvasWidth * 0.5,
    canvasHeight * 0.32,
    Math.min(canvasWidth, canvasHeight) * 0.72
  );
  radialGlow.addColorStop(0, parseRgba(accentColor, clamp((0.08 + intensity * 0.04 + bassGlow + pulseAmount * 0.12) * 1.2, 0, 1)));
  radialGlow.addColorStop(0.38, parseRgba(accentColor, clamp(0.04 + intensity * 0.02 + pulseAmount * 0.08, 0, 0.42)));
  radialGlow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = radialGlow;
  context.fillRect(0, 0, canvasWidth, canvasHeight);

  context.fillStyle = `rgba(2,4,10,${clamp(0.52 - brightnessBoost * 0.18 - pulseAmount * 0.08, 0.08, 0.55)})`;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
}

function updateKickAnimation(
  motion: RendererMotionState,
  reaction: BassReactionState,
  config: VideoSnippetRenderState["config"]
) {
  const targetKick = clamp(reaction.bassImpact * (0.7 + reaction.coverPulse * 0.55) + reaction.dropImpact * 0.35, 0, 1.45);
  motion.kickAmount += (targetKick - motion.kickAmount) * (targetKick > motion.kickAmount ? 0.52 : 0.12);

  const pulseScale = clamp(config.coverPulse, 0, 1.8) * (0.08 + reaction.coverPulse * 0.16);
  const targetScale = 1 + motion.kickAmount * pulseScale + reaction.dropImpact * 0.06;
  motion.coverScale += (targetScale - motion.coverScale) * 0.4;

  const targetOffsetY = -(motion.kickAmount * (10 + reaction.coverPulse * 20) + reaction.dropImpact * 16);
  motion.coverOffsetY += (targetOffsetY - motion.coverOffsetY) * 0.28;
}

function getDropTransform(
  dropEffect: VideoSnippetRenderState["config"]["dropEffect"],
  dropTiming: number,
  renderTimeSeconds: number,
  reaction: BassReactionState
) {
  const transform = {
    scale: 1,
    x: 0,
    y: 0
  };

  const timedDropActive = dropTiming > 0 && renderTimeSeconds >= dropTiming;
  const elapsed = timedDropActive ? renderTimeSeconds - dropTiming : 0;
  const dropPower = clamp(reaction.dropImpact + reaction.bassImpact * 0.35, 0, 1.6);
  if (!timedDropActive && dropPower < 0.04) return transform;

  const dampedBounce = timedDropActive
    ? Math.sin(-13 * (elapsed + 1) * Math.PI / 2) * Math.pow(2, -10 * Math.min(elapsed, 2))
    : 0;
  const effect = dropEffect === "auto" ? "bass-hit" : dropEffect;

  if (effect === "bass-hit" || effect === "beat-bounce" || effect === "bounce" || effect === "scale-hit") {
    transform.scale += dampedBounce * (0.34 + dropPower * 0.28) + dropPower * 0.04;
    transform.y -= dropPower * (18 + (effect === "beat-bounce" ? 16 : 8));
  }

  if (effect === "zoom-pulse") {
    transform.scale += dropPower * 0.16 + dampedBounce * 0.42;
  }

  if (effect === "fly-up" && elapsed < 0.6) {
    const progress = elapsed / 0.6;
    const ease = 1 - Math.pow(1 - progress, 3);
    transform.y += (1 - ease) * 800;
    transform.scale *= Math.max(0.001, progress);
  }

  if (effect === "camera-shake" || effect === "shake") {
    const power = dropPower * 46;
    transform.x += (Math.random() - 0.5) * power;
    transform.y += (Math.random() - 0.5) * power * 0.8;
  }

  if (effect === "orb-expansion" || effect === "wave-explosion") {
    transform.scale += dropPower * 0.08;
  }

  return transform;
}

function drawCoverPlaceholder(
  context: CanvasRenderingContext2D,
  stylePreset: VideoSnippetStyle,
  width: number,
  height: number
) {
  context.fillStyle = "#16161a";
  context.fillRect(-width / 2, -height / 2, width, height);
  context.fillStyle = "rgba(255,255,255,0.4)";
  context.textAlign = "center";
  context.font = stylePreset === "vinyl-rotation" ? "600 12px Inter, system-ui, sans-serif" : "600 24px Inter, system-ui, sans-serif";
  context.fillText("ОБЛОЖКА", 0, stylePreset === "vinyl-rotation" ? -6 : -10);
  if (stylePreset !== "vinyl-rotation") {
    context.font = "400 14px Inter, system-ui, sans-serif";
    context.fillText("Нажмите, чтобы загрузить", 0, 20);
  }
}

function drawTemplateBase(
  context: CanvasRenderingContext2D,
  stylePreset: VideoSnippetStyle,
  accentColor: string,
  glow: number,
  bass: number,
  coverWidth: number,
  coverHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  title: string,
  artist: string,
  radiusMultiplier: number
) {
  const shadowBlur = Math.min(80, 120 * glow + bass * 0.6 * glow);

  if (stylePreset === "neon-wave") {
    context.shadowBlur = shadowBlur * 2;
    context.shadowColor = accentColor;
    context.lineWidth = 6;
    context.strokeStyle = accentColor;
    context.strokeRect(-coverWidth / 2, -coverHeight / 2, coverWidth, coverHeight);
    context.beginPath();
    context.rect(-coverWidth / 2, -coverHeight / 2, coverWidth, coverHeight);
    context.clip();
    return;
  }

  if (stylePreset === "vinyl-rotation") {
    context.shadowBlur = shadowBlur;
    context.shadowColor = parseRgba(accentColor, 0.9);
    context.beginPath();
    context.arc(0, 0, coverWidth / 2, 0, Math.PI * 2);
    context.fillStyle = "#0a0a0c";
    context.fill();
    context.strokeStyle = "#1a1a1f";
    context.lineWidth = 1.5;
    for (let radius = coverWidth * 0.25; radius < coverWidth / 2 - 5; radius += Math.max(10, coverWidth * 0.03)) {
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.beginPath();
    context.arc(0, 0, coverWidth * 0.225, 0, Math.PI * 2);
    context.clip();
    return;
  }

  if (stylePreset === "polaroid") {
    context.shadowBlur = shadowBlur + 20;
    context.shadowColor = "rgba(0,0,0,0.6)";
    context.fillStyle = "#fff";
    context.fillRect(-coverWidth / 2 - 20, -coverHeight / 2 - 20, coverWidth + 40, coverHeight + 160);
    context.shadowBlur = 0;
    context.save();
    context.textAlign = "center";
    context.fillStyle = "#111";
    context.font = `700 ${Math.round(canvasHeight * 0.045)}px "Comic Sans MS", "Segoe Print", cursive`;
    context.fillText(title, 0, coverHeight / 2 + 70);
    context.fillStyle = "#666";
    context.font = `400 ${Math.round(canvasHeight * 0.03)}px "Comic Sans MS", "Segoe Script", cursive`;
    context.fillText(artist, 0, coverHeight / 2 + 118);
    context.restore();
    context.beginPath();
    context.rect(-coverWidth / 2, -coverHeight / 2, coverWidth, coverHeight);
    context.clip();
    return;
  }

  if (stylePreset === "glass-card") {
    const padding = 30;
    const textBoxHeight = 140;
    context.shadowBlur = 40;
    context.shadowColor = "rgba(0,0,0,0.5)";
    context.fillStyle = "rgba(255,255,255,0.10)";
    context.strokeStyle = "rgba(255,255,255,0.22)";
    context.lineWidth = 2;
    drawRoundedRect(
      context,
      -coverWidth / 2 - padding,
      -coverHeight / 2 - padding,
      coverWidth + padding * 2,
      coverHeight + padding + textBoxHeight,
      30 * radiusMultiplier
    );
    context.fill();
    context.stroke();
    context.save();
    context.textAlign = "center";
    context.fillStyle = "#fff";
    context.font = `800 ${Math.round(canvasHeight * 0.04)}px Inter, system-ui, sans-serif`;
    context.fillText(title, 0, coverHeight / 2 + 65);
    context.fillStyle = accentColor;
    context.font = `600 ${Math.round(canvasHeight * 0.025)}px Inter, system-ui, sans-serif`;
    context.fillText(artist.toUpperCase(), 0, coverHeight / 2 + 105);
    context.restore();
    context.shadowBlur = shadowBlur;
    context.shadowColor = accentColor;
    drawRoundedRect(context, -coverWidth / 2, -coverHeight / 2, coverWidth, coverHeight, 20 * radiusMultiplier);
    context.fillStyle = "#000";
    context.fill();
    context.clip();
    return;
  }

  if (stylePreset === "poster-split") {
    context.shadowBlur = shadowBlur * 1.3;
    context.shadowColor = accentColor;
    context.beginPath();
    context.rect(-canvasWidth / 2, -coverHeight / 2, canvasWidth, coverHeight);
    context.fillStyle = "#000";
    context.fill();
    context.clip();
    return;
  }

  const radius = ((stylePreset === "retro-vhs" || stylePreset === "glitch") ? 12 : 40) * radiusMultiplier;
  const effectiveShadow = stylePreset === "classic" || stylePreset === "left-align" || stylePreset === "retro-vhs" || stylePreset === "glitch" ? 0 : shadowBlur * 1.2;
  context.shadowBlur = effectiveShadow;
  context.shadowColor = accentColor;
  drawRoundedRect(context, -coverWidth / 2, -coverHeight / 2, coverWidth, coverHeight, radius);
  context.fillStyle = "#000";
  context.fill();
  context.clip();
}

function drawCoverAndTemplate(
  context: CanvasRenderingContext2D,
  motion: RendererMotionState,
  layout: ReturnType<typeof getLayout>,
  state: VideoSnippetRenderState,
  reaction: BassReactionState,
  renderTimeSeconds: number,
  intensity: number
) {
  const { config, cover, width: canvasWidth, height: canvasHeight } = state;
  const glow = clamp(config.coverGlow, 0, 1.6) + reaction.glowBurst * 0.22;
  updateKickAnimation(motion, reaction, config);
  const drop = getDropTransform(config.dropEffect, config.dropTiming, renderTimeSeconds, reaction);
  const coverRect = layout.coverRect;
  const coverCenterX = coverRect.x + coverRect.width / 2;
  const coverCenterY = coverRect.y + coverRect.height / 2 + config.coverOffsetY;
  const title = config.title || "New Track";
  const artist = config.artist || "Artist Name";
  const baseScale = clamp(config.coverScale, 0.5, 1.5);
  const pulseScale = 1 + motion.kickAmount * clamp(config.coverPulse, 0, 1.8) * clamp(config.coverZoom, 0, 0.6) + reaction.dropImpact * 0.05;
  const coverRotation = config.coverControls.autoRotation
    ? Math.sin(renderTimeSeconds * config.coverControls.rotationSpeed) * (31 * Math.PI / 180)
    : (clamp(config.coverControls.rotation, -31, 31) * Math.PI) / 180;
  context.save();
  context.translate(coverCenterX + drop.x, coverCenterY + drop.y + motion.coverOffsetY);
  if (config.stylePreset !== "poster-split") {
    context.scale(baseScale * motion.coverScale * pulseScale * drop.scale, baseScale * motion.coverScale * pulseScale * drop.scale);
  } else {
    context.scale(baseScale * drop.scale, baseScale * drop.scale);
  }

  if (config.stylePreset === "vinyl-rotation") {
    motion.vinylRotation += 0.01 + intensity * 0.006;
    context.rotate(motion.vinylRotation + coverRotation);
  } else if (config.stylePreset === "polaroid") {
    context.rotate(coverRotation * 0.35);
  } else {
    context.rotate(coverRotation * 0.15);
  }

  context.shadowBlur *= clamp(config.coverShadow, 0, 1.8) * (1 + reaction.bassImpact * 0.3 + reaction.glowBurst * 0.2);

  drawTemplateBase(
    context,
    config.stylePreset,
    config.accentColor,
    glow,
    reaction.bassEnergy * 255,
    coverRect.width,
    coverRect.height,
    canvasWidth,
    canvasHeight,
    title,
    artist,
    clamp(config.coverRadius, 0, 1.6)
  );

  if (cover) {
    if (config.stylePreset === "poster-split") {
      drawImageCover(context, cover, 0, 0, coverRect.width, canvasWidth, coverRect.height * 1.2);
    } else if (config.stylePreset === "vinyl-rotation") {
      drawImageCover(context, cover, 0, 0, coverRect.width * 0.45);
    } else {
      drawImageCover(context, cover, 0, 0, Math.max(coverRect.width, coverRect.height), coverRect.width, coverRect.height);
    }
  } else {
    drawCoverPlaceholder(context, config.stylePreset, coverRect.width, coverRect.height);
  }

  if (config.stylePreset === "vinyl-rotation") {
    context.beginPath();
    context.arc(0, 0, coverRect.width * 0.03, 0, Math.PI * 2);
    context.fillStyle = "#050509";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = config.accentColor;
    context.stroke();
  }

  context.restore();
}

function drawNeonFrame(
  context: CanvasRenderingContext2D,
  accentColor: string,
  bass: number,
  stylePreset: VideoSnippetStyle,
  canvasWidth: number,
  canvasHeight: number,
  glow: number,
  reaction: BassReactionState
) {
  if (stylePreset !== "neon-wave") return;
  context.save();
  context.shadowBlur = 60 * glow + bass * 0.3 + reaction.glowBurst * 28;
  context.shadowColor = accentColor;
  context.strokeStyle = accentColor;
  context.globalAlpha = clamp(0.6 + glow * 0.4 + reaction.dropImpact * 0.16, 0, 1);
  context.lineWidth = 4;
  drawRoundedRect(context, canvasWidth * 0.05, canvasHeight * 0.03, canvasWidth * 0.9, canvasHeight * 0.94, 30);
  context.stroke();
  context.restore();
}

function fitFontSize(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  baseSize: number,
  minSize: number,
  weight: number,
  family: string
) {
  let size = baseSize;
  while (size > minSize) {
    context.font = `${weight} ${size}px ${family}`;
    if (context.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function wrapText(text: string, maxCharsPerLine = 28) {
  return text
    .trim()
    .split(/\s+/)
    .reduce<string[]>((lines, word) => {
      const currentLine = lines[lines.length - 1] ?? "";
      const nextLine = currentLine ? `${currentLine} ${word}` : word;
      if (nextLine.length <= maxCharsPerLine) {
        if (lines.length === 0) return [nextLine];
        return [...lines.slice(0, -1), nextLine];
      }
      return [...lines, word];
    }, []);
}

function fitWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  options: { maxWidth: number; baseSize: number; minSize: number; weight: number; maxLines: number; family: string }
) {
  let size = options.baseSize;
  while (size > options.minSize) {
    context.font = `${options.weight} ${size}px ${options.family}`;
    const roughChars = Math.max(8, Math.floor(options.maxWidth / Math.max(8, size * 0.52)));
    const lines = wrapText(text, roughChars).slice(0, options.maxLines);
    const widestLine = lines.reduce((max, line) => Math.max(max, context.measureText(line).width), 0);
    const fullWrap = wrapText(text, roughChars);
    if (widestLine <= options.maxWidth && fullWrap.length <= options.maxLines) {
      return { size, lines };
    }
    size -= 2;
  }
  context.font = `${options.weight} ${options.minSize}px ${options.family}`;
  const fallbackChars = Math.max(8, Math.floor(options.maxWidth / Math.max(8, options.minSize * 0.52)));
  return { size: options.minSize, lines: wrapText(text, fallbackChars).slice(0, options.maxLines) };
}

function drawMultilineText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    align: "left" | "center";
    maxWidth: number;
    baseSize: number;
    minSize: number;
    weight: number;
    maxLines: number;
    fillStyle: string;
    shadowColor?: string;
    shadowBlur?: number;
    family?: string;
    lineHeight?: number;
  }
) {
  const family = options.family ?? "Inter, system-ui, sans-serif";
  const fitted = fitWrappedText(context, text, {
    maxWidth: options.maxWidth,
    baseSize: options.baseSize,
    minSize: options.minSize,
    weight: options.weight,
    maxLines: options.maxLines,
    family
  });
  const lineHeight = options.lineHeight ?? Math.round(fitted.size * 1.1);
  context.save();
  context.fillStyle = options.fillStyle;
  context.textAlign = options.align;
  context.textBaseline = "top";
  context.font = `${options.weight} ${fitted.size}px ${family}`;
  context.shadowColor = options.shadowColor ?? "transparent";
  context.shadowBlur = options.shadowBlur ?? 0;
  fitted.lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight, options.maxWidth);
  });
  context.restore();
  return { height: fitted.lines.length * lineHeight, fontSize: fitted.size };
}

function avoidOverlap(currentY: number, minY: number, maxY: number) {
  return clamp(Math.max(currentY, minY), minY, maxY);
}

function resolveTextFontStack(fontFamily: VideoSnippetRenderState["config"]["textControls"]["fontFamily"]) {
  switch (fontFamily) {
    case "space-grotesk":
      return '"Space Grotesk", Inter, system-ui, sans-serif';
    case "montserrat":
      return "Montserrat, Inter, system-ui, sans-serif";
    case "serif":
      return '"Times New Roman", Georgia, serif';
    case "mono":
      return '"Courier New", ui-monospace, monospace';
    default:
      return "Inter, system-ui, sans-serif";
  }
}

function drawText(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof getLayout>,
  state: VideoSnippetRenderState,
  motion: RendererMotionState,
  reaction: BassReactionState,
  intensity: number,
  renderTimeSeconds: number,
  bass: number
) {
  const { config, playback } = state;
  if (config.stylePreset === "polaroid" || config.stylePreset === "glass-card") return;
  const textControls = config.textControls;
  const family = resolveTextFontStack(textControls.fontFamily);
  const pulseStrength = clamp(textControls.pulseStrength / 100, 0, 1);
  const animationSpeed = clamp(textControls.animationSpeed, 0.1, 5);
  const bassPulse = clamp(bass / 255, 0, 1);
  const isAnimatedText = textControls.animation !== "off";
  const sourcePulse = textControls.animationSource === "bass" ? bassPulse : motion.kickAmount;
  const targetPulse = isAnimatedText && textControls.animation === "pulse"
    ? 1 + sourcePulse * (0.12 + pulseStrength * 0.34)
    : 1;
  motion.textPulseScale += (targetPulse - motion.textPulseScale) * Math.min(0.28, 0.08 + animationSpeed * 0.06);
  const targetFloatOffset = textControls.animation === "float"
    ? Math.sin(renderTimeSeconds * 0.9 * animationSpeed) * (3 + pulseStrength * 7)
    : 0;
  motion.textFloatOffset += (targetFloatOffset - motion.textFloatOffset) * 0.12;
  const pulseBoost = motion.textPulseScale * (1 + reaction.bassImpact * 0.05);
  const artistBoost = motion.textPulseScale * (1 + reaction.bassImpact * 0.08 + reaction.dropImpact * 0.05);
  const floatOffset = motion.textFloatOffset;

  const titleWeight = clamp(config.titleWeight, 500, 900);
  const titleX = layout.align === "center" ? layout.titleRect.x + layout.titleRect.width / 2 : layout.titleRect.x;
  const artistX = layout.align === "center" ? layout.artistRect.x + layout.artistRect.width / 2 : layout.artistRect.x;
  const titleText = config.title || "New Track";
  const artistText = config.artist || "Artist Name";

  if (config.stylePreset === "retro-vhs" || config.stylePreset === "glitch") {
    context.save();
    context.translate(motion.textShakeX * 0.4, motion.textShakeY * 0.4);
    context.textAlign = layout.align;
    context.fillStyle = "#fff";
    context.font = `900 ${Math.round(layout.titleBaseSize)}px "Courier New", monospace`;
    context.fillText(titleText.toUpperCase(), titleX, layout.titleRect.y, layout.titleRect.width);
    context.fillStyle = config.accentColor;
    context.font = `700 ${Math.round(layout.artistBaseSize)}px "Courier New", monospace`;
    context.fillText(artistText.toUpperCase(), artistX, layout.artistRect.y, layout.artistRect.width);
    context.textAlign = "left";
    context.fillStyle = "#fff";
    context.font = `600 ${Math.round(layout.platformBaseSize * 1.1)}px "Courier New", monospace`;
    context.fillText("PLAY ►", layout.safeArea.left * 0.65, layout.safeArea.top * 0.65);
    context.fillText("SP", layout.safeArea.left * 0.65, layout.safeArea.top * 0.9);
    context.textAlign = "right";
    context.fillText(
      formatSnippetTime(playback?.currentTime ?? 0),
      layout.width - layout.safeArea.right * 0.65,
      layout.height - layout.safeArea.bottom * 0.4
    );
    context.restore();
    return;
  }

  context.save();
  context.translate(motion.textShakeX, motion.textShakeY);
  const titleY = layout.titleRect.y + (textControls.animation === "float" ? floatOffset * 0.55 : 0);
  const titleBlock = drawMultilineText(context, titleText, titleX, titleY, {
    align: layout.align,
    maxWidth: layout.titleRect.width,
    baseSize: Math.round(layout.titleBaseSize * (1 + (titleWeight - 700) / 1800) * pulseBoost),
    minSize: Math.max(42, Math.round(layout.titleBaseSize * 0.62 * pulseBoost)),
    weight: titleWeight,
    maxLines: layout.titleMaxLines,
    fillStyle: "#fff",
    shadowColor: config.stylePreset === "neon-wave" ? parseRgba(config.accentColor, 0.7 + reaction.glowBurst * 0.16) : "rgba(0,0,0,0.38)",
    shadowBlur: 24 + intensity * 18 + pulseStrength * 12 + reaction.glowBurst * 18,
    family
  });

  const artistY = avoidOverlap(
    layout.artistRect.y + floatOffset,
    layout.titleRect.y + titleBlock.height + 18,
    layout.visualizerRect.y - 120
  );
  drawMultilineText(context, artistText, artistX, artistY, {
    align: layout.align,
    maxWidth: layout.artistRect.width,
    baseSize: Math.round(layout.artistBaseSize * artistBoost),
    minSize: Math.max(28, Math.round(layout.artistBaseSize * 0.72 * artistBoost)),
    weight: clamp(titleWeight - 120, 500, 850),
    maxLines: layout.artistMaxLines,
    fillStyle: parseRgba(config.accentColor, 0.96),
    shadowColor: parseRgba(config.accentColor, 0.28 + reaction.glowBurst * 0.2),
    shadowBlur: 12 + pulseStrength * 8 + reaction.glowBurst * 16,
    family
  });
  context.restore();
}

function drawPlatformText(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof getLayout>,
  state: VideoSnippetRenderState,
  motion: RendererMotionState,
  renderTimeSeconds: number
) {
  const text = state.config.platformText.trim();
  if (!layout.showPlatforms || !text) return;
  const x = layout.align === "center" ? layout.platformRect.x + layout.platformRect.width / 2 : layout.platformRect.x;
  const textControls = state.config.textControls;
  const family = resolveTextFontStack(textControls.fontFamily);
  const pulseStrength = clamp(textControls.pulseStrength / 100, 0, 1);
  const animationSpeed = clamp(textControls.animationSpeed, 0.1, 5);
  const sourcePulse = textControls.animationSource === "bass" ? clamp(state.playback ? bassFromSpectrum(state.playback.frequencyData) / 255 : 0, 0, 1) : motion.kickAmount;
  const targetPulse = textControls.animation === "pulse" ? 1 + sourcePulse * (0.1 + pulseStrength * 0.18) : 1;
  motion.textPulseScale += (targetPulse - motion.textPulseScale) * Math.min(0.28, 0.08 + animationSpeed * 0.06);
  const pulse = motion.textPulseScale;
  drawMultilineText(context, text, x, layout.platformRect.y, {
    align: layout.align,
    maxWidth: layout.platformRect.width,
    baseSize: Math.round(layout.platformBaseSize * pulse),
    minSize: Math.max(20, Math.round(layout.platformBaseSize * 0.88 * pulse)),
    weight: 600,
    maxLines: layout.platformMaxLines,
    fillStyle: "rgba(255,255,255,0.74)",
    shadowColor: "rgba(0,0,0,0.28)",
    shadowBlur: 8 + pulseStrength * 4,
    family
  });
}

function drawWatermark(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof getLayout>,
  width: number,
  height: number
) {
  context.save();
  context.fillStyle = "rgba(255,255,255,0.45)";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = `500 ${Math.round(Math.max(14, Math.min(width, height) * 0.016))}px Inter, system-ui, sans-serif`;
  context.shadowColor = "rgba(0,0,0,0.35)";
  context.shadowBlur = 10;
  context.fillText("video by ICECREAMMUSIC", width / 2, height - Math.max(28, layout.safeArea.bottom * 0.42));
  context.restore();
}

function smoothNeighborBands(values: number[], smoothingPoints: number, smoothingPasses: number) {
  const radius = Math.max(0, Math.round(smoothingPoints));
  const passes = Math.max(0, Math.round(smoothingPasses));
  let current = values.slice();
  if (radius === 0 || passes === 0) return current;

  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.map((_, index) => {
      let total = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const value = current[index + offset];
        if (value == null) continue;
        total += value;
        count += 1;
      }
      return count > 0 ? total / count : current[index] ?? 0;
    });
    current = next;
  }

  return current;
}

function applyTimeSmoothing(values: number[], previous: number[], timeSmoothing: number) {
  const smoothing = clamp(timeSmoothing, 0, 0.99);
  const attack = clamp(1 - smoothing * 0.88, 0.02, 1);
  const release = clamp(1 - smoothing * 0.98, 0.01, 1);
  return smoothSeries(values, previous, attack, release);
}

function drawVisualizer(
  context: CanvasRenderingContext2D,
  motion: RendererMotionState,
  spectrumMode: VideoSnippetSpectrum,
  spectrum: Uint8Array,
  waveform: Uint8Array,
  layout: ReturnType<typeof getLayout>,
  accentColor: string,
  bass: number,
  treble: number,
  intensity: number,
  renderTimeSeconds: number,
  config: VideoSnippetRenderState["config"],
  reaction: BassReactionState
) {
  if (spectrumMode === "off") return;
  const controls = config.spectrumControls;
  const spectrumColor = controls.color;
  const centerX = layout.width * clamp(controls.positionX, 0, 1);
  const centerY = layout.height * clamp(controls.positionY, 0, 1);
  const frameScale = clamp(controls.spectrumSize / 64, 0.25, 3);
  const pointCount = Math.max(8, Math.min(256, Math.round(controls.barsToDraw)));
  const animationPhase = renderTimeSeconds * Math.max(0, controls.animationTime);
  const reactionBoost = reaction.bassImpact * reaction.spectrumPulse + reaction.dropImpact * clamp(config.bassReactionControls.dropImpact / 100, 0, 1);
  const intensityScale = clamp(intensity * (0.8 + controls.barHeightMultiplier * 0.12) * (1 + reactionBoost * 0.9), 0.1, 5.2);
  const timeMix = clamp(controls.timeSmoothing, 0, 0.99);
  const gap = clamp(controls.spectrumSpacing, 0, 50);
  const baseShadow = clamp(controls.shadowBlur, 0, 100) * 0.8 + reaction.glowBurst * 18;
  const shadowAlpha = clamp(controls.shadowAlpha, 0, 1);
  const useShadow = baseShadow > 0.5 && shadowAlpha > 0;
  const barWidth = Math.max(1, clamp(controls.barWidth, 1, 40));
  const heightFactor = Math.max(0.12, controls.barHeightMultiplier);
  const horizontalDirection =
    controls.orientation === "mirror-x" || controls.orientation === "mirror-both" ? -1 : 1;
  const verticalDirectionBase =
    controls.orientation === "mirror-y" || controls.orientation === "mirror-both" ? -1 : 1;
  const verticalDirection = config.spectrumInvert ? verticalDirectionBase * -1 : verticalDirectionBase;
  const profile = smoothNeighborBands(
    applyTimeSmoothing(buildSpectralProfile(spectrum, pointCount), motion.spectrumBars, timeMix),
    controls.smoothingPoints,
    controls.smoothingPasses
  );
  motion.spectrumBars = profile;

  if (spectrumMode === "bars") {
    const frameWidth = layout.visualizerRect.width * frameScale * (1 + reactionBoost * 0.08);
    const frameHeight = layout.visualizerRect.height * frameScale * (1 + reactionBoost * 0.22);
    const totalWidth = pointCount * barWidth + Math.max(0, pointCount - 1) * gap;
    const startX = centerX - totalWidth / 2;
    const baseY = centerY + (verticalDirection > 0 ? frameHeight / 2 : -frameHeight / 2);
    context.save();
    context.shadowColor = useShadow ? parseRgba(spectrumColor, shadowAlpha) : "transparent";
    context.shadowBlur = useShadow ? baseShadow : 0;
    context.shadowOffsetX = useShadow ? controls.shadowOffsetX : 0;
    context.shadowOffsetY = useShadow ? controls.shadowOffsetY : 0;
    context.globalAlpha = 1;
    for (let index = 0; index < profile.length; index += 1) {
      const sourceIndex = horizontalDirection > 0 ? index : profile.length - 1 - index;
      const value = profile[sourceIndex] ?? 0;
      const x = startX + index * (barWidth + gap);
      const barHeight = Math.max(2, value * frameHeight * intensityScale * Math.max(0.1, heightFactor) + barWidth * (0.6 + reactionBoost * 0.4));
      const y = verticalDirection > 0 ? baseY - barHeight : baseY;
      const gradient = context.createLinearGradient(x, y, x, y + barHeight);
      gradient.addColorStop(0, spectrumColor);
      gradient.addColorStop(1, parseRgba(spectrumColor, shadowAlpha));
      context.fillStyle = gradient;
      drawRoundedRect(context, x, y, barWidth, barHeight, Math.min(8, barWidth / 2));
      context.fill();
    }
    context.restore();
    return;
  }

  if (spectrumMode === "wave") {
    const waveWidth = layout.visualizerRect.width * frameScale * (1 + reactionBoost * 0.06);
    const waveHeight = layout.visualizerRect.height * frameScale * (0.62 + reactionBoost * 0.18);
    const values = applyTimeSmoothing(profile, motion.waveBars, timeMix);
    motion.waveBars = values;
    context.save();
    context.translate(centerX, centerY);
    context.globalAlpha = 1;
    context.lineWidth = barWidth;
    context.lineCap = "round";
    context.strokeStyle = spectrumColor;
    context.shadowColor = useShadow ? parseRgba(spectrumColor, shadowAlpha) : "transparent";
    context.shadowBlur = useShadow ? baseShadow : 0;
    context.shadowOffsetX = useShadow ? controls.shadowOffsetX : 0;
    context.shadowOffsetY = useShadow ? controls.shadowOffsetY : 0;
    context.beginPath();
    values.forEach((value, index) => {
      const t = index / Math.max(1, values.length - 1);
      const x = (t - 0.5) * waveWidth * horizontalDirection;
      const amplitude = (value * waveHeight * intensityScale * heightFactor + gap) * verticalDirection;
      const y = -amplitude - Math.sin(animationPhase * 0.8 + t * Math.PI * 2) * gap * 0.06;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
    context.restore();
    return;
  }

  const ringValues = applyTimeSmoothing(profile, motion.circleBars, timeMix);
  motion.circleBars = ringValues;
  const radius = Math.min(layout.width, layout.height) * 0.12 * frameScale * (1 + reactionBoost * 0.16);
  const ringRadius = radius + gap * 0.45;

  if (spectrumMode === "circle") {
    context.save();
    context.translate(centerX, centerY);
    context.rotate(animationPhase * 0.12 * horizontalDirection);
    context.globalAlpha = 1;
    context.strokeStyle = spectrumColor;
    context.shadowColor = useShadow ? parseRgba(spectrumColor, shadowAlpha) : "transparent";
    context.shadowBlur = useShadow ? baseShadow : 0;
    context.shadowOffsetX = useShadow ? controls.shadowOffsetX : 0;
    context.shadowOffsetY = useShadow ? controls.shadowOffsetY : 0;
    context.lineWidth = barWidth;
    context.beginPath();
    for (let index = 0; index < ringValues.length; index += 1) {
      const sourceIndex = horizontalDirection > 0 ? index : ringValues.length - 1 - index;
      const value = ringValues[sourceIndex] ?? 0;
      const t = index / Math.max(1, ringValues.length);
      const angle = t * Math.PI * 2 - Math.PI / 2;
      const amplitude = (value * heightFactor * 16 + gap) * verticalDirection;
      const ringPoint = ringRadius + amplitude;
      const x = Math.cos(angle) * ringPoint;
      const y = Math.sin(angle) * ringPoint;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.stroke();
    context.restore();
    return;
  }

  const center = controls.followCover
    ? {
        x: layout.coverRect.x + layout.coverRect.width / 2,
        y: layout.coverRect.y + layout.coverRect.height / 2
      }
    : {
        x: layout.width * clamp(controls.positionX, 0, 1),
        y: layout.height * clamp(controls.positionY, 0, 1)
      };
  const layerCount = Math.max(4, Math.min(10, Math.round(3 + gap / 6)));
  const ringBase = Math.min(layout.coverRect.width, layout.coverRect.height) * 0.46 * frameScale * (1 + reactionBoost * 0.18);
  const orbValues = applyTimeSmoothing(profile, motion.orbBars, timeMix);
  motion.orbBars = orbValues;

  context.save();
  context.translate(center.x, center.y);
  context.rotate(animationPhase * 0.08 * horizontalDirection);
  context.globalAlpha = 1;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = useShadow ? parseRgba(spectrumColor, shadowAlpha) : "transparent";
  context.shadowBlur = useShadow ? baseShadow + 12 : 0;
  context.shadowOffsetX = useShadow ? controls.shadowOffsetX : 0;
  context.shadowOffsetY = useShadow ? controls.shadowOffsetY : 0;

  context.strokeStyle = parseRgba(spectrumColor, clamp(shadowAlpha * 0.7 + reaction.glowBurst * 0.14, 0, 1));
  context.lineWidth = barWidth * 2.2;
  context.beginPath();
  context.arc(0, 0, ringBase, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = spectrumColor;
  context.lineWidth = Math.max(1.5, barWidth);
  context.beginPath();
  orbValues.forEach((value, index) => {
    const t = index / Math.max(1, orbValues.length - 1);
    const angle = (t * Math.PI * 2 - Math.PI / 2) * horizontalDirection;
    const waveLift = Math.sin(t * Math.PI) * (gap * 1.4 + value * heightFactor * 18) * verticalDirection;
    const radiusValue = ringBase + waveLift + value * heightFactor * 8;
    const x = Math.cos(angle) * radiusValue;
    const y = Math.sin(angle) * radiusValue;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();

  for (let layer = 1; layer < layerCount; layer += 1) {
    const scale = 1 + layer * (gap / 260);
    context.globalAlpha = clamp(1 - layer * 0.08, 0.18, 1);
    context.lineWidth = Math.max(1, barWidth - layer * 0.55);
    context.beginPath();
    orbValues.forEach((value, index) => {
      const t = index / Math.max(1, orbValues.length - 1);
      const angle = (t * Math.PI * 2 - Math.PI / 2) * horizontalDirection;
      const waveLift = Math.sin(t * Math.PI) * (gap * 1.1 + value * heightFactor * 14) * verticalDirection;
      const radiusValue = ringBase * scale + waveLift;
      const x = Math.cos(angle) * radiusValue;
      const y = Math.sin(angle) * radiusValue - layer * gap * 0.25;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  const particleCount = Math.max(12, Math.min(48, Math.round(pointCount / 4)));
  for (let index = 0; index < particleCount; index += 1) {
    const seed = index * 12.9898;
    const random = ((Math.sin(seed) * 43758.5453) % 1 + 1) % 1;
    const angle = random * Math.PI * 2 + animationPhase * 0.7;
    const radius = ringBase * (1.02 + random * 0.6) + Math.sin(animationPhase + index) * gap * 0.14;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    context.fillStyle = spectrumColor;
    context.shadowBlur = useShadow ? baseShadow * 0.5 : 0;
    context.beginPath();
    context.arc(x, y, 1.2 + random * 2.8, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();
}

function drawStyleOverlays(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof getLayout>,
  stylePreset: VideoSnippetStyle,
  accentColor: string
) {
  if (stylePreset === "poster-split") {
    context.save();
    context.strokeStyle = parseRgba(accentColor, 0.22);
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(layout.safeArea.left, layout.coverRect.y + layout.coverRect.height + 56);
    context.lineTo(layout.width - layout.safeArea.right, layout.coverRect.y + layout.coverRect.height + 56);
    context.stroke();
    context.restore();
  }

  if (stylePreset === "retro-vhs" || stylePreset === "glitch") {
    context.save();
    context.globalAlpha = 0.08;
    context.fillStyle = "#ffffff";
    for (let y = 0; y < layout.height; y += 8) {
      context.fillRect(0, y, layout.width, 1);
    }
    context.restore();
  }
}

function drawReactiveOverlays(
  context: CanvasRenderingContext2D,
  layout: ReturnType<typeof getLayout>,
  reaction: BassReactionState,
  config: VideoSnippetRenderState["config"]
) {
  if (reaction.dropImpact <= 0.02 && reaction.glowBurst <= 0.02 && reaction.flashAlpha <= 0.01) return;
  const effect = config.dropEffect === "auto" ? "bass-hit" : config.dropEffect;
  const centerX = layout.coverRect.x + layout.coverRect.width / 2;
  const centerY = layout.coverRect.y + layout.coverRect.height / 2;

  if (effect === "wave-explosion" || effect === "orb-expansion" || effect === "bass-hit" || effect === "beat-bounce") {
    context.save();
    context.strokeStyle = parseRgba(config.accentColor, clamp(0.14 + reaction.glowBurst * 0.34, 0, 0.55));
    context.lineWidth = 4 + reaction.dropImpact * 14;
    context.shadowColor = parseRgba(config.accentColor, 0.42);
    context.shadowBlur = 22 + reaction.glowBurst * 28;
    context.beginPath();
    context.arc(centerX, centerY, layout.coverRect.width * (0.42 + reaction.dropImpact * 0.2), 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  if (effect === "glow-burst" || effect === "flash") {
    context.save();
    context.fillStyle = parseRgba("#ffffff", clamp(reaction.flashAlpha + (effect === "flash" ? reaction.dropImpact * 0.12 : 0), 0, 0.34));
    context.fillRect(0, 0, layout.width, layout.height);
    context.restore();
  }
}

function drawVignette(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  vignette: number,
  activeDrop: boolean,
  reaction: BassReactionState
) {
  const vignetteStrength = clamp(vignette + (activeDrop ? 0.12 : 0) + reaction.dropImpact * 0.08, 0, 1);
  if (vignetteStrength <= 0) return;
  const gradient = context.createRadialGradient(
    canvasWidth / 2,
    canvasHeight / 2,
    Math.min(canvasWidth, canvasHeight) * 0.18,
    canvasWidth / 2,
    canvasHeight / 2,
    Math.min(canvasWidth, canvasHeight) * 0.72
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${0.72 * vignetteStrength})`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
}

export function renderFrame(context: CanvasRenderingContext2D, state: VideoSnippetRenderState) {
  const { width, height, config, playback, cover } = state;
  const motion = getRendererState(context.canvas);
  const frequencyData = playback?.frequencyData ?? new Uint8Array(0);
  const waveformData = playback?.waveformData ?? new Uint8Array(0);
  const duration = playback?.duration ?? 0;
  const currentTime = playback?.currentTime ?? 0;
  const progress = duration > 0 ? clamp(currentTime / duration, 0, 1) : 0;
  const bass = bassFromSpectrum(frequencyData);
  const treble = trebleFromSpectrum(frequencyData);
  const energy = calculateAverageEnergy(frequencyData);
  const intensity = clamp(config.visualPower * (0.62 + energy * 0.96), 0, 1.8);
  const activeDrop = currentTime >= config.dropTiming && currentTime <= config.dropTiming + 1.8;
  const reaction = updateBassReaction(motion, state, currentTime, activeDrop);
  const layout = getLayout({
    format: config.format,
    style: config.stylePreset,
    width,
    height,
    textOffsetY: config.textOffsetY,
    titleWeight: config.titleWeight,
    platformText: config.platformText
  });

  clearFrame(context, width, height, config.accentColor);
  drawBackground(
    context,
    motion,
    config.backgroundControls,
    config.bassReactionControls,
    config.accentColor,
    cover,
    state.background,
    width,
    height,
    progress,
    intensity,
    bass,
    reaction
  );
  drawStyleOverlays(context, layout, config.stylePreset, config.accentColor);
  drawCoverAndTemplate(context, motion, layout, state, reaction, currentTime, intensity);
  drawNeonFrame(context, config.accentColor, bass, config.stylePreset, width, height, clamp(config.glow, 0, 1.4), reaction);
  drawText(context, layout, state, motion, reaction, intensity, currentTime, bass);
  drawVisualizer(context, motion, config.spectrum, frequencyData, waveformData, layout, config.accentColor, bass, treble, intensity, currentTime, config, reaction);
  drawPlatformText(context, layout, state, motion, currentTime);
  drawReactiveOverlays(context, layout, reaction, config);
  drawVignette(context, width, height, config.vignette, activeDrop, reaction);

  if (config.stylePreset === "retro-vhs" || config.stylePreset === "glitch") {
    context.save();
    context.fillStyle = "rgba(255,255,255,0.58)";
    context.font = "500 15px ui-monospace, SFMono-Regular, monospace";
    context.textAlign = "left";
    context.fillText(`T-${formatSnippetTime(currentTime)}`, layout.coverRect.x + 22, layout.coverRect.y + layout.coverRect.height - 24);
    context.restore();
  }

  if (config.showWatermark) {
    drawWatermark(context, layout, width, height);
  }
}

export function renderSnippetFrame(params: VideoSnippetRenderState & { context: CanvasRenderingContext2D }) {
  renderFrame(params.context, {
    width: params.width,
    height: params.height,
    config: params.config,
    playback: params.playback,
    cover: params.cover,
    background: params.background
  });
}
