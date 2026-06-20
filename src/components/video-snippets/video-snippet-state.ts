"use client";

import type {
  SnippetMomentAnalysis,
  VideoSnippetBackground,
  VideoSnippetDropEffect,
  VideoSnippetDuration,
  VideoSnippetFormat,
  VideoSnippetSpectrum,
  VideoSnippetTextAnimation,
  VideoSnippetTextFont,
  VideoSnippetStyle
} from "@/lib/video-snippets";

export interface VideoSnippetPlaybackFrame {
  currentTime: number;
  duration: number;
  frequencyData: Uint8Array<ArrayBuffer>;
  waveformData: Uint8Array<ArrayBuffer>;
  isPlaying: boolean;
}

export interface SpectrumControlsState {
  mode: "bars" | "wave" | "circle" | "neon-orb" | "off";
  color: string;
  orientation: "normal" | "mirror-x" | "mirror-y" | "mirror-both";
  followCover: boolean;
  barsToDraw: number;
  spectrumSize: number;
  invertHorizontal: boolean;
  invertVertical: boolean;
  animationTime: number;
  barWidth: number;
  positionX: number;
  positionY: number;
  spectrumSpacing: number;
  shadowBlur: number;
  shadowAlpha: number;
  barHeightMultiplier: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  timeSmoothing: number;
  smoothingPoints: number;
  smoothingPasses: number;
}

export interface TextControlsState {
  fontFamily: VideoSnippetTextFont;
  animation: VideoSnippetTextAnimation;
  animationSource: "kick" | "bass";
  animationSpeed: number;
  pulseStrength: number;
}

export interface CoverControlsState {
  rotation: number;
  autoRotation: boolean;
  rotationSpeed: number;
}

export interface BackgroundControlsState {
  mode: "auto-cover" | "custom-image" | "gradient" | "solid-color" | "animated-gradient";
  customBackgroundFile: File | null;
  customBackgroundUrl: string | null;
  blur: number;
  brightness: number;
  opacity: number;
  scale: number;
  motion: boolean;
  motionSpeed: number;
}

export interface BassReactionControlsState {
  bassSensitivity: number;
  bassSmoothness: number;
  coverPulse: number;
  backgroundPulse: number;
  spectrumPulse: number;
  glowBurst: number;
  shakeAmount: number;
  dropImpact: number;
}

export interface VideoSnippetRenderConfig {
  coverUrl: string | null;
  title: string;
  artist: string;
  platformText: string;
  showWatermark: boolean;
  accentColor: string;
  format: VideoSnippetFormat;
  duration: VideoSnippetDuration;
  stylePreset: VideoSnippetStyle;
  spectrum: VideoSnippetSpectrum;
  backgroundEffect: VideoSnippetBackground;
  dropEffect: VideoSnippetDropEffect;
  dropTiming: number;
  visualPower: number;
  glow: number;
  blurBackground: number;
  vignette: number;
  textOffsetY: number;
  titleWeight: number;
  spectrumColor: string;
  useAccentForSpectrum: boolean;
  spectrumOpacity: number;
  spectrumGlow: number;
  spectrumLineWidth: number;
  spectrumDensity: number;
  spectrumSmoothness: number;
  spectrumSensitivity: number;
  spectrumBassBoost: number;
  spectrumTrebleBoost: number;
  spectrumMinHeight: number;
  spectrumMaxHeight: number;
  spectrumWidthScale: number;
  spectrumHeightScale: number;
  spectrumOffsetX: number;
  spectrumOffsetY: number;
  spectrumInvert: boolean;
  spectrumDiameter: number;
  spectrumImageSize: number;
  spectrumPositionX: number;
  spectrumPositionY: number;
  spectrumWaveHeight: number;
  spectrumSeparation: number;
  spectrumRotation: number;
  spectrumCenterCutout: number;
  spectrumGlowStrength: number;
  spectrumThickness: number;
  spectrumLayers: number;
  spectrumSensitivityBoost: number;
  spectrumSmoothnessBoost: number;
  orbSize: number;
  orbRingThickness: number;
  orbRingGlow: number;
  orbWaveHeight: number;
  orbWaveLayers: number;
  orbParticleAmount: number;
  orbParticleSpeed: number;
  orbBassSensitivity: number;
  spectrumControls: SpectrumControlsState;
  textControls: TextControlsState;
  coverControls: CoverControlsState;
  backgroundControls: BackgroundControlsState;
  bassReactionControls: BassReactionControlsState;
  coverScale: number;
  coverOffsetY: number;
  coverRadius: number;
  coverGlow: number;
  coverShadow: number;
  coverPulse: number;
  coverZoom: number;
  coverRotation: number;
  backgroundBrightness: number;
  gradientPower: number;
  glowPower: number;
  motionSpeed: number;
  backgroundBassPulse: number;
}

export interface VideoSnippetRenderState {
  width: number;
  height: number;
  config: VideoSnippetRenderConfig;
  playback: VideoSnippetPlaybackFrame | null;
  cover: {
    image: HTMLImageElement;
    width: number;
    height: number;
    loadedAt: number;
  } | null;
  background: {
    image: HTMLImageElement;
    width: number;
    height: number;
    loadedAt: number;
  } | null;
}

export interface VideoRecordState {
  status: "idle" | "recording" | "finalizing" | "complete" | "error";
  progress: number;
  downloadUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  message: string | null;
}

export interface VideoSnippetProState {
  isLoading: boolean;
  hasPro: boolean;
  plan: "STANDARD" | "PRO" | "ENTERPRISE" | null;
  status: "loading" | "ready" | "error";
}

export const defaultSnippetAnalysis: SnippetMomentAnalysis = {
  introEnd: 4,
  chorusStart: 8,
  dropAt: 12,
  peakAt: 14,
  confidence: 0
};

export const defaultRecordState: VideoRecordState = {
  status: "idle",
  progress: 0,
  downloadUrl: null,
  mimeType: null,
  fileName: null,
  message: null
};
