"use client";

import * as React from "react";
import { FastAverageColor } from "fast-average-color";
import {
  Lock,
  Download,
  Music2,
  Pause,
  Play,
  Sparkles,
  Upload,
  Wand2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { SubscriptionStateResponse } from "@/lib/api/contracts";
import {
  formatSnippetTime,
  getEffectiveSegment,
  isAcceptedImageFile,
  normalizeVideoSnippetStyle,
  VIDEO_SNIPPET_BACKGROUNDS,
  VIDEO_SNIPPET_DURATIONS,
  VIDEO_SNIPPET_DROP_EFFECTS,
  VIDEO_SNIPPET_FORMATS,
  VIDEO_SNIPPET_PLATFORM_PRESETS,
  VIDEO_SNIPPET_SPECTRUMS,
  VIDEO_SNIPPET_TEXT_FONTS,
  VIDEO_SNIPPET_STYLES,
  type VideoSnippetDropEffect,
  type VideoSnippetDuration,
  type VideoSnippetFormat,
  type VideoSnippetPlatformPreset,
  type VideoSnippetTextAnimation,
  type VideoSnippetStyle
} from "@/lib/video-snippets";
import { cn } from "@/lib/utils";

import { AudioRangeSelector } from "./audio-range-selector";
import { VideoSnippetPreview } from "./video-snippet-preview";
import type {
  BassReactionControlsState,
  BackgroundControlsState,
  CoverControlsState,
  SpectrumControlsState,
  TextControlsState
} from "./video-snippet-state";
import { useAudioAnalyzer } from "./use-audio-analyzer";
import { useVideoRecorder } from "./use-video-recorder";

interface VideoSnippetsGeneratorProps {
  initialSeed?: {
    title?: string;
    artist?: string;
    coverUrl?: string;
    audioUrl?: string;
  };
}

const ACCEPTED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a"
];

const WATERMARK_TEXT = "video by ICECREAMMUSIC";

const TEXT_ANIMATION_OPTIONS: Array<{ value: VideoSnippetTextAnimation; label: string }> = [
  { value: "off", label: "Off" },
  { value: "pulse", label: "Pulse" },
  { value: "float", label: "Float" }
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getPlatformText(preset: VideoSnippetPlatformPreset, customText: string): string {
  const entry = VIDEO_SNIPPET_PLATFORM_PRESETS.find((option) => option.value === preset);
  if (!entry) return "";
  return preset === "custom" ? customText.trim() : entry.text;
}

function SliderControl(props: {
  id: string;
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const { id, label, valueLabel, min, max, step, value, onChange, disabled } = props;
  const progress = ((value - min) / Math.max(0.0001, max - min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-[12px]">{label}</Label>
        <span className="text-[12px] font-semibold text-white/55">{valueLabel}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        disabled={disabled}
        className="icm-audio-slider h-6 w-full"
        style={{ ["--slider-progress" as never]: `${progress}%` }}
      />
    </div>
  );
}

function ToggleControl(props: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const { id, label, checked, onChange } = props;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-[12px]">{label}</Label>
        <button
          id={id}
          type="button"
          onClick={() => onChange(!checked)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
            checked
              ? "border-cyan-400/40 bg-cyan-500/12 text-cyan-100"
              : "border-white/10 bg-black/20 text-white/55 hover:border-white/18 hover:bg-white/[0.05]"
          )}
        >
          {checked ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}

export function VideoSnippetsGenerator({ initialSeed }: VideoSnippetsGeneratorProps) {
  const previewCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const coverUrlRef = React.useRef<string | null>(null);
  const backgroundUrlRef = React.useRef<string | null>(null);
  const facRef = React.useRef<FastAverageColor | null>(null);

  const [coverFile, setCoverFile] = React.useState<File | null>(null);
  const [audioFile, setAudioFile] = React.useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = React.useState<AudioBuffer | null>(null);
  const [coverUrl, setCoverUrl] = React.useState<string | null>(initialSeed?.coverUrl ?? null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(initialSeed?.audioUrl ?? null);
  const [title, setTitle] = React.useState(initialSeed?.title ?? "New Track");
  const [artist, setArtist] = React.useState(initialSeed?.artist ?? "Artist Name");
  const [format, setFormat] = React.useState<VideoSnippetFormat>("story");
  const [duration, setDuration] = React.useState<VideoSnippetDuration>(15);
  const [stylePreset, setStylePreset] = React.useState<VideoSnippetStyle>("classic");
  const [dropEffect, setDropEffect] = React.useState<VideoSnippetDropEffect>("auto");
  const [dropTime, setDropTime] = React.useState(0);
  const [startOffset, setStartOffset] = React.useState(0);
  const [platformPreset, setPlatformPreset] = React.useState<VideoSnippetPlatformPreset>("none");
  const [customPlatformText, setCustomPlatformText] = React.useState("");
  const [accentMode, setAccentMode] = React.useState<"auto" | "manual">("auto");
  const [accentColor, setAccentColor] = React.useState("#38e8c5");
  const [spectrumControls, setSpectrumControls] = React.useState<SpectrumControlsState>({
    mode: "bars",
    color: "#ffeeee",
    orientation: "normal",
    followCover: true,
    barsToDraw: 64,
    spectrumSize: 64,
    invertHorizontal: false,
    invertVertical: false,
    animationTime: 1,
    barWidth: 13,
    positionX: 0.5,
    positionY: 0.5,
    spectrumSpacing: 0,
    shadowBlur: 0,
    shadowAlpha: 0.286,
    barHeightMultiplier: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    timeSmoothing: 0.8,
    smoothingPoints: 3,
    smoothingPasses: 1
  });
  const [textControls, setTextControls] = React.useState<TextControlsState>({
    fontFamily: "inter",
    animation: "pulse",
    animationSource: "kick",
    animationSpeed: 1,
    pulseStrength: 60
  });
  const [coverControls, setCoverControls] = React.useState<CoverControlsState>({
    rotation: 0,
    autoRotation: false,
    rotationSpeed: 1
  });
  const [backgroundControls, setBackgroundControls] = React.useState<BackgroundControlsState>({
    mode: "auto-cover",
    customBackgroundFile: null,
    customBackgroundUrl: null,
    blur: 40,
    brightness: 100,
    opacity: 100,
    scale: 100,
    motion: true,
    motionSpeed: 1
  });
  const [bassReactionControls, setBassReactionControls] = React.useState<BassReactionControlsState>({
    bassSensitivity: 118,
    bassSmoothness: 72,
    coverPulse: 64,
    backgroundPulse: 58,
    spectrumPulse: 82,
    glowBurst: 68,
    shakeAmount: 10,
    dropImpact: 76
  });
  const [removeWatermark, setRemoveWatermark] = React.useState(false);
  const [visualPower, setVisualPower] = React.useState(0.7);
  const [glow, setGlow] = React.useState(0.6);
  const [vignette, setVignette] = React.useState(0.45);
  const [blurBackground, setBlurBackground] = React.useState(0.58);
  const [titleWeight, setTitleWeight] = React.useState(800);
  const [textOffsetY, setTextOffsetY] = React.useState(0);
  const [spectrumColor, setSpectrumColor] = React.useState("#38e8c5");
  const [useAccentForSpectrum, setUseAccentForSpectrum] = React.useState(true);
  const [spectrumOpacity, setSpectrumOpacity] = React.useState(0.9);
  const [spectrumGlow, setSpectrumGlow] = React.useState(0.7);
  const [spectrumLineWidth, setSpectrumLineWidth] = React.useState(0.55);
  const [spectrumDensity, setSpectrumDensity] = React.useState(0.65);
  const [spectrumSmoothness, setSpectrumSmoothness] = React.useState(0.65);
  const [spectrumSensitivity, setSpectrumSensitivity] = React.useState(0.82);
  const [spectrumBassBoost, setSpectrumBassBoost] = React.useState(0.72);
  const [spectrumTrebleBoost, setSpectrumTrebleBoost] = React.useState(0.48);
  const [spectrumMinHeight, setSpectrumMinHeight] = React.useState(0.14);
  const [spectrumMaxHeight, setSpectrumMaxHeight] = React.useState(0.92);
  const [spectrumWidthScale, setSpectrumWidthScale] = React.useState(1);
  const [spectrumHeightScale, setSpectrumHeightScale] = React.useState(1);
  const [spectrumOffsetX, setSpectrumOffsetX] = React.useState(0);
  const [spectrumOffsetY, setSpectrumOffsetY] = React.useState(0);
  const [spectrumInvert, setSpectrumInvert] = React.useState(false);
  const [spectrumDiameter, setSpectrumDiameter] = React.useState(62);
  const [spectrumImageSize, setSpectrumImageSize] = React.useState(68);
  const [spectrumPositionX, setSpectrumPositionX] = React.useState(0);
  const [spectrumPositionY, setSpectrumPositionY] = React.useState(0);
  const [spectrumWaveHeight, setSpectrumWaveHeight] = React.useState(72);
  const [spectrumSeparation, setSpectrumSeparation] = React.useState(42);
  const [spectrumRotation, setSpectrumRotation] = React.useState(0);
  const [spectrumCenterCutout, setSpectrumCenterCutout] = React.useState(18);
  const [spectrumGlowStrength, setSpectrumGlowStrength] = React.useState(64);
  const [spectrumThickness, setSpectrumThickness] = React.useState(8);
  const [spectrumLayers, setSpectrumLayers] = React.useState(8);
  const [spectrumSensitivityBoost, setSpectrumSensitivityBoost] = React.useState(124);
  const [spectrumSmoothnessBoost, setSpectrumSmoothnessBoost] = React.useState(72);
  const [orbSize, setOrbSize] = React.useState(1.02);
  const [orbRingThickness, setOrbRingThickness] = React.useState(0.9);
  const [orbRingGlow, setOrbRingGlow] = React.useState(1);
  const [orbWaveHeight, setOrbWaveHeight] = React.useState(1);
  const [orbWaveLayers, setOrbWaveLayers] = React.useState(8);
  const [orbParticleAmount, setOrbParticleAmount] = React.useState(0.68);
  const [orbParticleSpeed, setOrbParticleSpeed] = React.useState(0.6);
  const [orbBassSensitivity, setOrbBassSensitivity] = React.useState(1.05);
  const [coverScale, setCoverScale] = React.useState(1);
  const [coverOffsetY, setCoverOffsetY] = React.useState(0);
  const [coverRadius, setCoverRadius] = React.useState(1);
  const [coverGlow, setCoverGlow] = React.useState(0.7);
  const [coverShadow, setCoverShadow] = React.useState(0.7);
  const [coverPulse, setCoverPulse] = React.useState(0.85);
  const [coverZoom, setCoverZoom] = React.useState(0.18);
  const [coverRotation, setCoverRotation] = React.useState(0.12);
  const [backgroundBrightness, setBackgroundBrightness] = React.useState(0.7);
  const [gradientPower, setGradientPower] = React.useState(0.72);
  const [glowPower, setGlowPower] = React.useState(0.72);
  const [motionSpeed, setMotionSpeed] = React.useState(0.55);
  const [backgroundBassPulse, setBackgroundBassPulse] = React.useState(0.45);
  const [autoDetectEnabled, setAutoDetectEnabled] = React.useState(true);
  const [proModalOpen, setProModalOpen] = React.useState(false);
  const [proMessage, setProMessage] = React.useState("Этот функционал доступен в PRO-подписке.");
  const [subscriptionPlan, setSubscriptionPlan] = React.useState<"STANDARD" | "PRO" | "ENTERPRISE" | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = React.useState<"loading" | "ready" | "error">("loading");

  const selectedPlatformText = getPlatformText(platformPreset, customPlatformText);
  const {
    analysisRef,
    analysis,
    analysisStatus,
    audioMode,
    resolvedAudioBuffer,
    currentTime,
    durationSeconds,
    isPlaying,
    isReady,
    play,
    pause,
    stop,
    seek,
    getAudioStream
  } = useAudioAnalyzer({
    audioUrl,
    audioFile,
    audioBuffer,
    autoDetectEnabled,
    startOffset
  });
  const { recordState, start: startRecording } = useVideoRecorder({
    canvasRef: previewCanvasRef,
    getAudioStream
  });
  const canRemoveWatermark = subscriptionPlan === "PRO" || subscriptionPlan === "ENTERPRISE";
  const activeDropTime = dropEffect === "auto" && autoDetectEnabled ? analysis.dropAt : dropTime;
  const selectedFormatLabel = VIDEO_SNIPPET_FORMATS.find((entry) => entry.value === format)?.label ?? "9:16";
  const availableDuration = durationSeconds > 0 ? durationSeconds : duration;
  const effectiveSegment = React.useMemo(
    () =>
      getEffectiveSegment({
        audioDuration: availableDuration,
        startTime: startOffset,
        requestedDuration: duration
      }),
    [availableDuration, duration, startOffset]
  );
  const segmentEndTime = effectiveSegment.endTime;
  const isPreviewAnimating = isPlaying || recordState.status === "recording";
  const snippetConfig = React.useMemo(
    () =>
      ({
        title,
        artist,
        coverUrl,
        audioUrl,
        accentColor,
        format,
        duration,
        stylePreset: normalizeVideoSnippetStyle(stylePreset),
        spectrum: spectrumControls.mode,
        backgroundEffect: backgroundControls.mode,
        platformText: selectedPlatformText,
        glow,
        vignette,
        blurBackground,
        visualPower,
        dropEffect,
        dropTiming: activeDropTime,
        textOffsetY,
        titleWeight,
        spectrumColor,
        useAccentForSpectrum,
        spectrumOpacity,
        spectrumGlow,
        spectrumLineWidth,
        spectrumDensity,
        spectrumSmoothness,
        spectrumSensitivity,
        spectrumBassBoost,
        spectrumTrebleBoost,
        spectrumMinHeight,
        spectrumMaxHeight,
        spectrumWidthScale,
        spectrumHeightScale,
        spectrumOffsetX,
        spectrumOffsetY,
        spectrumInvert,
        spectrumDiameter,
        spectrumImageSize,
        spectrumPositionX,
        spectrumPositionY,
        spectrumWaveHeight,
        spectrumSeparation,
        spectrumRotation,
        spectrumCenterCutout,
        spectrumGlowStrength,
        spectrumThickness,
        spectrumLayers,
        spectrumSensitivityBoost,
        spectrumSmoothnessBoost,
        orbSize,
        orbRingThickness,
        orbRingGlow,
        orbWaveHeight,
        orbWaveLayers,
        orbParticleAmount,
        orbParticleSpeed,
        orbBassSensitivity,
        coverScale,
        coverOffsetY,
        coverRadius,
        coverGlow,
        coverShadow,
        coverPulse,
        coverZoom,
        coverRotation,
        backgroundBrightness,
        gradientPower,
        glowPower,
        motionSpeed,
        backgroundBassPulse,
        showWatermark: !(removeWatermark && canRemoveWatermark),
        spectrumControls,
        textControls,
        coverControls,
        backgroundControls,
        bassReactionControls
      }) as const,
    [
      accentColor,
      activeDropTime,
      artist,
      audioUrl,
      blurBackground,
      coverUrl,
      dropEffect,
      duration,
      format,
      glow,
      selectedPlatformText,
      stylePreset,
      textOffsetY,
      title,
      titleWeight,
      spectrumColor,
      useAccentForSpectrum,
      spectrumOpacity,
      spectrumGlow,
      spectrumLineWidth,
      spectrumDensity,
      spectrumSmoothness,
      spectrumSensitivity,
      spectrumBassBoost,
      spectrumTrebleBoost,
      spectrumMinHeight,
      spectrumMaxHeight,
      spectrumWidthScale,
      spectrumHeightScale,
      spectrumOffsetX,
      spectrumOffsetY,
      spectrumInvert,
      spectrumDiameter,
      spectrumImageSize,
      spectrumPositionX,
      spectrumPositionY,
      spectrumWaveHeight,
      spectrumSeparation,
      spectrumRotation,
      spectrumCenterCutout,
      spectrumGlowStrength,
      spectrumThickness,
      spectrumLayers,
      spectrumSensitivityBoost,
      spectrumSmoothnessBoost,
      orbSize,
      orbRingThickness,
      orbRingGlow,
      orbWaveHeight,
      orbWaveLayers,
      orbParticleAmount,
      orbParticleSpeed,
      orbBassSensitivity,
      textControls,
      coverScale,
      coverOffsetY,
      coverRadius,
      coverGlow,
      coverShadow,
      coverPulse,
      coverZoom,
      coverRotation,
      backgroundBrightness,
      gradientPower,
      glowPower,
      motionSpeed,
      backgroundBassPulse,
      canRemoveWatermark,
      removeWatermark,
      spectrumControls,
      coverControls,
      backgroundControls,
      bassReactionControls,
      vignette,
      visualPower
    ]
  );

  React.useEffect(() => {
    if (!coverUrl || accentMode !== "auto") return;

    let canceled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = async () => {
      if (canceled) return;
      try {
        facRef.current ??= new FastAverageColor();
        const color = await facRef.current.getColorAsync(image);
        if (!canceled) {
          setAccentColor(color.hex);
        }
      } catch {
        if (!canceled) {
          setAccentColor("#38e8c5");
        }
      }
    };
    image.src = coverUrl;

    return () => {
      canceled = true;
    };
  }, [accentMode, coverUrl]);

  React.useEffect(() => {
    if (durationSeconds <= 0) return;
    setStartOffset((current) =>
      getEffectiveSegment({
        audioDuration: durationSeconds,
        startTime: current,
        requestedDuration: duration
      }).startTime
    );
    setDropTime((current) => clamp(current, 0, Math.max(0, durationSeconds - 0.1)));
  }, [duration, durationSeconds]);

  React.useEffect(() => {
    if (!autoDetectEnabled || durationSeconds <= 0) return;
    const suggestedStart = getEffectiveSegment({
      audioDuration: durationSeconds,
      startTime: analysis.dropAt - duration * 0.35,
      requestedDuration: duration
    }).startTime;
    setStartOffset((current) => {
      if (Math.abs(current - suggestedStart) < 0.2) return current;
      return suggestedStart;
    });
  }, [analysis.dropAt, autoDetectEnabled, duration, durationSeconds]);

  React.useEffect(() => {
    let active = true;
    const loadSubscription = async () => {
      setSubscriptionStatus("loading");
      try {
        const response = await fetch("/api/subscription", { method: "GET", cache: "no-store" });
        if (!response.ok || !active) {
          if (active) {
            setSubscriptionStatus("error");
          }
          return;
        }
        const parsed = (await response.json()) as SubscriptionStateResponse;
        if (!active) return;
        setSubscriptionPlan(parsed.subscription.currentPlan ?? parsed.subscription.plan ?? "STANDARD");
        setSubscriptionStatus("ready");
      } catch {
        if (active) {
          setSubscriptionStatus("error");
        }
      }
    };
    void loadSubscription();
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      if (coverUrlRef.current) {
        URL.revokeObjectURL(coverUrlRef.current);
      }
      if (backgroundUrlRef.current) {
        URL.revokeObjectURL(backgroundUrlRef.current);
      }
    };
  }, []);

  function syncStartOffset(nextValue: number, options?: { seek?: boolean }) {
    const safeValue = getEffectiveSegment({
      audioDuration: availableDuration,
      startTime: nextValue,
      requestedDuration: duration
    }).startTime;
    setStartOffset(safeValue);
    if (options?.seek !== false) {
      void seek(safeValue);
    }
  }

  function updateSpectrumControls(patch: Partial<SpectrumControlsState>) {
    setSpectrumControls((current) => ({ ...current, ...patch }));
  }

  function updateSpectrumOrientation(orientation: SpectrumControlsState["orientation"]) {
    const patch =
      orientation === "mirror-x"
        ? { orientation, invertHorizontal: true, invertVertical: false }
        : orientation === "mirror-y"
          ? { orientation, invertHorizontal: false, invertVertical: true }
          : orientation === "mirror-both"
            ? { orientation, invertHorizontal: true, invertVertical: true }
            : { orientation, invertHorizontal: false, invertVertical: false };
    setSpectrumControls((current) => ({ ...current, ...patch }));
  }

  function updateCoverControls(patch: Partial<CoverControlsState>) {
    setCoverControls((current) => ({ ...current, ...patch }));
  }

  function updateTextControls(patch: Partial<TextControlsState>) {
    setTextControls((current) => ({ ...current, ...patch }));
  }

  function updateBackgroundControls(patch: Partial<BackgroundControlsState>) {
    setBackgroundControls((current) => ({ ...current, ...patch }));
  }

  function updateBassReactionControls(patch: Partial<BassReactionControlsState>) {
    setBassReactionControls((current) => ({ ...current, ...patch }));
  }

  function updateFileState(file: File | null, kind: "cover" | "audio" | "background") {
    if (kind === "cover") {
      if (coverUrlRef.current) {
        URL.revokeObjectURL(coverUrlRef.current);
        coverUrlRef.current = null;
      }
      setCoverFile(file);
      if (file) {
        const objectUrl = URL.createObjectURL(file);
        coverUrlRef.current = objectUrl;
        setCoverUrl(objectUrl);
      } else {
        setCoverUrl(initialSeed?.coverUrl ?? null);
      }
      return;
    }
    if (kind === "audio") {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
      setAudioFile(file);
      setAudioBuffer(null);
      if (file) {
        const objectUrl = URL.createObjectURL(file);
        previewUrlRef.current = objectUrl;
        setAudioUrl(objectUrl);
      } else {
        setAudioBuffer(null);
        setAudioUrl(initialSeed?.audioUrl ?? null);
      }
      return;
    }
    if (kind === "background") {
      if (backgroundUrlRef.current) {
        URL.revokeObjectURL(backgroundUrlRef.current);
        backgroundUrlRef.current = null;
      }
      setBackgroundControls((current) => {
        if (!file) {
          return {
            ...current,
            customBackgroundFile: null,
            customBackgroundUrl: null,
            mode: current.mode === "custom-image" ? "auto-cover" : current.mode
          };
        }
        const objectUrl = URL.createObjectURL(file);
        backgroundUrlRef.current = objectUrl;
        return {
          ...current,
          mode: "custom-image",
          customBackgroundFile: file,
          customBackgroundUrl: objectUrl
        };
      });
    }
  }

  async function handleGenerateVideo() {
    if (!isReady || !previewCanvasRef.current) {
      return;
    }

    const safeTitle = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, "-")
      .replace(/^-+|-+$/g, "");
    const fileNameBase = safeTitle || "video-snippet";
    await startRecording({
      durationSeconds: effectiveSegment.durationSeconds,
      fileNameBase,
      onBeforeStart: async () => {
        await play({ fromTime: effectiveSegment.startTime, durationSeconds: effectiveSegment.durationSeconds });
      },
      onAfterStop: async () => {
        await stop();
      }
    });
  }

  async function handlePlay() {
    if (!audioUrl) return;
    const isInsideSelection = currentTime >= effectiveSegment.startTime && currentTime < effectiveSegment.endTime - 0.05;
    const playFrom = isInsideSelection ? currentTime : effectiveSegment.startTime;
    await play({
      fromTime: playFrom,
      durationSeconds: Math.max(0.05, effectiveSegment.endTime - playFrom)
    });
  }

  async function handlePause() {
    await pause();
  }

  async function handleStop() {
    await stop();
  }

  async function handlePreview() {
    if (!audioUrl) return;
    await play({ fromTime: effectiveSegment.startTime, durationSeconds: effectiveSegment.durationSeconds });
  }

  function nudgeStartOffset(delta: number) {
    syncStartOffset(startOffset + delta);
  }

  const onCoverDrop: React.DragEventHandler<HTMLLabelElement> = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0] ?? null;
    if (!file) return;
    if (!isAcceptedImageFile(file)) return;
    updateFileState(file, "cover");
  };

  const onAudioDrop: React.DragEventHandler<HTMLLabelElement> = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0] ?? null;
    if (!file) return;
    if (!ACCEPTED_AUDIO_TYPES.includes(file.type) && !/\.(mp3|wav|m4a|aac)$/i.test(file.name)) return;
    updateFileState(file, "audio");
  };

  const onUploadChange =
    (kind: "cover" | "audio" | "background") => (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.currentTarget.files?.[0] ?? null;
      event.currentTarget.value = "";
      if (!file) return;
      if ((kind === "cover" || kind === "background") && !isAcceptedImageFile(file)) return;
      if (kind === "audio" && !ACCEPTED_AUDIO_TYPES.includes(file.type) && !/\.(mp3|wav|m4a|aac)$/i.test(file.name)) return;
      updateFileState(file, kind);
    };

  function openProModal(message: string) {
    setProMessage(message);
    setProModalOpen(true);
  }

  function handleStyleChange(nextStyle: VideoSnippetStyle) {
    setStylePreset(normalizeVideoSnippetStyle(nextStyle));
  }

  function handleDropEffectChange(nextEffect: VideoSnippetDropEffect) {
    setDropEffect(nextEffect);
  }

  function handleRemoveWatermarkToggle(nextValue: boolean) {
    if (nextValue && subscriptionStatus === "error") {
      openProModal("Не удалось проверить подписку. Повторите попытку позже, чтобы изменить статус Remove Watermark.");
      return;
    }
    if (nextValue && !canRemoveWatermark) {
      openProModal("Удаление вотермарки доступно с подписками PRO и ENTERPRISE.");
      return;
    }
    setRemoveWatermark(nextValue);
  }

  const previewAspectClass =
    format === "story" ? "aspect-[9/16]" : "aspect-square";

  const previewPanel = (
    <Card className="preview-wrap grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-white/10 bg-[#0f1118]/92 p-0 shadow-[0_28px_90px_-56px_rgba(123,61,245,0.45)] ring-1 ring-white/[0.04]">
      <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/48">Live Preview</p>
          <p className="mt-1 text-[12px] text-white/58">{analysisStatus}</p>
          {audioMode === "element" ? (
            <p className="mt-1 text-[11px] text-white/42">Совместимый режим: проигрывание работает, анализ ограничен</p>
          ) : null}
          <p className="mt-1 text-[11px] text-white/42">
            {durationSeconds > 0
              ? `Длительность: ${formatSnippetTime(durationSeconds)} • Выбран участок: ${formatSnippetTime(effectiveSegment.startTime)} — ${formatSnippetTime(segmentEndTime)}`
              : "Загрузите аудио, чтобы построить waveform"}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <span className="inline-flex h-8 items-center rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-semibold leading-none text-white/72">
            FMT: {selectedFormatLabel}
          </span>
          <span className="inline-flex h-8 min-w-[62px] items-center justify-center rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-semibold leading-none text-white/72">
            {formatSnippetTime(currentTime)}
          </span>
        </div>
      </div>
      <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 p-3 sm:p-4">
        <div
          className={cn(
            "relative flex h-full w-full min-h-[480px] sm:min-h-[560px] xl:min-h-[640px] items-center justify-center overflow-hidden rounded-[34px] border border-white/10 bg-black/25 p-3 shadow-[0_30px_80px_-42px_rgba(0,0,0,0.8)]",
            format === "story" ? "max-h-[88vh]" : "max-h-[78vh]"
          )}
        >
          <div
            className={cn(
              "relative mx-auto h-full max-h-full",
              previewAspectClass,
              format === "story"
                ? "w-auto min-h-full max-w-[760px] xl:max-w-[820px]"
                : "w-full max-w-[820px]"
            )}
          >
            <VideoSnippetPreview
              ref={previewCanvasRef}
              analysisRef={analysisRef}
              coverUrl={snippetConfig.coverUrl}
              title={snippetConfig.title}
              artist={snippetConfig.artist}
              platformText={snippetConfig.platformText}
              showWatermark={snippetConfig.showWatermark}
              accentColor={snippetConfig.accentColor}
              format={snippetConfig.format}
              stylePreset={snippetConfig.stylePreset}
              spectrum={snippetConfig.spectrum}
              backgroundEffect={snippetConfig.backgroundEffect}
              dropEffect={snippetConfig.dropEffect}
              dropAt={snippetConfig.dropTiming}
              visualPower={snippetConfig.visualPower}
              glow={snippetConfig.glow}
              blurBackground={snippetConfig.blurBackground}
              vignette={snippetConfig.vignette}
              textOffsetY={snippetConfig.textOffsetY}
              titleWeight={snippetConfig.titleWeight}
              spectrumColor={snippetConfig.spectrumColor}
              useAccentForSpectrum={snippetConfig.useAccentForSpectrum}
              spectrumOpacity={snippetConfig.spectrumOpacity}
              spectrumGlow={snippetConfig.spectrumGlow}
              spectrumLineWidth={snippetConfig.spectrumLineWidth}
              spectrumDensity={snippetConfig.spectrumDensity}
              spectrumSmoothness={snippetConfig.spectrumSmoothness}
              spectrumSensitivity={snippetConfig.spectrumSensitivity}
              spectrumBassBoost={snippetConfig.spectrumBassBoost}
              spectrumTrebleBoost={snippetConfig.spectrumTrebleBoost}
              spectrumMinHeight={snippetConfig.spectrumMinHeight}
              spectrumMaxHeight={snippetConfig.spectrumMaxHeight}
              spectrumWidthScale={snippetConfig.spectrumWidthScale}
              spectrumHeightScale={snippetConfig.spectrumHeightScale}
              spectrumOffsetX={snippetConfig.spectrumOffsetX}
              spectrumOffsetY={snippetConfig.spectrumOffsetY}
              spectrumInvert={snippetConfig.spectrumInvert}
              spectrumDiameter={snippetConfig.spectrumDiameter}
              spectrumImageSize={snippetConfig.spectrumImageSize}
              spectrumPositionX={snippetConfig.spectrumPositionX}
              spectrumPositionY={snippetConfig.spectrumPositionY}
              spectrumWaveHeight={snippetConfig.spectrumWaveHeight}
              spectrumSeparation={snippetConfig.spectrumSeparation}
              spectrumRotation={snippetConfig.spectrumRotation}
              spectrumCenterCutout={snippetConfig.spectrumCenterCutout}
              spectrumGlowStrength={snippetConfig.spectrumGlowStrength}
              spectrumThickness={snippetConfig.spectrumThickness}
              spectrumLayers={snippetConfig.spectrumLayers}
              spectrumSensitivityBoost={snippetConfig.spectrumSensitivityBoost}
              spectrumSmoothnessBoost={snippetConfig.spectrumSmoothnessBoost}
              orbSize={snippetConfig.orbSize}
              orbRingThickness={snippetConfig.orbRingThickness}
              orbRingGlow={snippetConfig.orbRingGlow}
              orbWaveHeight={snippetConfig.orbWaveHeight}
              orbWaveLayers={snippetConfig.orbWaveLayers}
              orbParticleAmount={snippetConfig.orbParticleAmount}
              orbParticleSpeed={snippetConfig.orbParticleSpeed}
              orbBassSensitivity={snippetConfig.orbBassSensitivity}
              spectrumControls={snippetConfig.spectrumControls}
              textControls={snippetConfig.textControls}
              coverControls={snippetConfig.coverControls}
              backgroundControls={snippetConfig.backgroundControls}
              bassReactionControls={snippetConfig.bassReactionControls}
              coverScale={snippetConfig.coverScale}
              coverOffsetY={snippetConfig.coverOffsetY}
              coverRadius={snippetConfig.coverRadius}
              coverGlow={snippetConfig.coverGlow}
              coverShadow={snippetConfig.coverShadow}
              coverPulse={snippetConfig.coverPulse}
              coverZoom={snippetConfig.coverZoom}
              coverRotation={snippetConfig.coverRotation}
              backgroundBrightness={snippetConfig.backgroundBrightness}
              gradientPower={snippetConfig.gradientPower}
              glowPower={snippetConfig.glowPower}
              motionSpeed={snippetConfig.motionSpeed}
              backgroundBassPulse={snippetConfig.backgroundBassPulse}
              shouldAnimate={isPreviewAnimating}
              className="h-full w-full"
            />
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#11131a]/96 px-3 py-2 backdrop-blur-xl">
          <div className="mb-3 grid gap-2">
            <div className="flex items-center justify-between text-[12px] text-white/60">
              <span>Участок трека</span>
              <span>
                {formatSnippetTime(effectiveSegment.startTime)} — {formatSnippetTime(segmentEndTime)}
              </span>
            </div>
            <AudioRangeSelector
              audioBuffer={resolvedAudioBuffer}
              audioDuration={durationSeconds}
              audioMode={audioMode}
              durationSeconds={duration}
              startTime={effectiveSegment.startTime}
              currentTime={currentTime}
              onStartTimeChange={(nextTime) => syncStartOffset(nextTime)}
              accentColor={accentColor}
            />
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="ghost" onClick={() => nudgeStartOffset(-5)} className="h-8 px-3 text-[12px]">
                -5s
              </Button>
              <Button type="button" variant="ghost" onClick={() => syncStartOffset(0)} className="h-8 px-3 text-[12px]">
                Intro
              </Button>
              <Button type="button" variant="ghost" onClick={() => syncStartOffset(analysis.chorusStart)} className="h-8 px-3 text-[12px]">
                Chorus
              </Button>
              <Button type="button" variant="ghost" onClick={() => syncStartOffset(analysis.dropAt)} className="h-8 px-3 text-[12px]">
                Drop
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => syncStartOffset(currentTime)}
                className="h-8 px-3 text-[12px]"
              >
                Use current
              </Button>
              <Button type="button" variant="ghost" onClick={() => nudgeStartOffset(5)} className="h-8 px-3 text-[12px]">
                +5s
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handlePlay()}
              className="h-9 gap-2 px-3 text-[13px]"
              disabled={!isReady || recordState.status === "recording"}
            >
              <Play className="h-4 w-4" />
              Play
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handlePause()}
              className="h-9 gap-2 px-3 text-[13px]"
              disabled={!isReady || !isPlaying}
            >
              <Pause className="h-4 w-4" />
              Pause
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleStop()}
              className="h-9 gap-2 px-3 text-[13px]"
              disabled={!isReady}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-current" />
              Stop
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handlePreview()}
              className="h-9 gap-2 px-3 text-[13px]"
              disabled={!isReady || recordState.status === "recording"}
            >
              <Wand2 className="h-4 w-4" />
              Preview
            </Button>
            <Button
              type="button"
              onClick={() => void handleGenerateVideo()}
              className="h-9 gap-2 px-4 text-[13px] font-semibold shadow-[0_18px_40px_-20px_rgba(123,61,245,0.95)]"
              disabled={recordState.status === "recording" || !isReady}
            >
              <Sparkles className="h-4 w-4" />
              Generate Video
            </Button>
            {recordState.status === "complete" && recordState.downloadUrl ? (
              <a
                href={recordState.downloadUrl}
                download={recordState.fileName ?? "video-snippet.webm"}
                className="inline-flex h-9 items-center gap-2 rounded-xl bg-emerald-400 px-4 text-[13px] font-semibold text-slate-950 transition-colors hover:bg-emerald-300"
              >
                <Download className="h-4 w-4" />
                {recordState.mimeType?.includes("mp4") ? "Download MP4" : "Download Video"}
              </a>
            ) : null}
          </div>
          <div className="mt-2">
            <Progress value={recordState.progress} className="h-2.5" />
            <div className="mt-2 flex items-center justify-between text-[12px] text-white/55">
              <span>{recordState.message ?? "Готов к генерации"}</span>
              <span>{Math.round(recordState.progress)}%</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="sn-wrap pb-10 xl:h-[calc(100vh-var(--dashboard-header-height,88px))] xl:overflow-hidden">
      <div className="sn-grid grid gap-4 xl:h-full xl:grid-cols-[minmax(620px,1fr)_420px]">
        <div className="min-h-0 space-y-3 xl:h-full xl:overflow-y-auto xl:pr-2">
          {previewPanel}
        </div>

        <div className="space-y-2 xl:h-full xl:overflow-y-auto xl:pr-2">
          <Card className="media-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">1. Медиа</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={onCoverDrop}
                className="flex min-h-[4rem] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/14 bg-white/[0.03] px-3 py-2.5 text-center transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05]"
              >
                <Upload className="h-4 w-4 text-cyan-200" />
                <span className="mt-1 text-[12px] font-semibold text-white">Обложка</span>
                <span className="text-[10px] text-white/52">JPG, PNG, WebP</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onUploadChange("cover")}
                />
                {coverFile ? <span className="mt-1 text-[11px] text-cyan-200">{coverFile.name}</span> : null}
              </label>

              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={onAudioDrop}
                className="flex min-h-[4rem] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/14 bg-white/[0.03] px-3 py-2.5 text-center transition-colors hover:border-violet-400/30 hover:bg-white/[0.05]"
                >
                  <Music2 className="h-4 w-4 text-violet-200" />
                  <span className="mt-1 text-[12px] font-semibold text-white">Аудио трек</span>
                  <span className="text-[10px] text-white/52">MP3, WAV, M4A, AAC</span>
                <input
                  type="file"
                  accept=".mp3,.wav,.m4a,.aac,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/aac,audio/mp4,audio/x-m4a,audio/m4a"
                  className="hidden"
                  onChange={onUploadChange("audio")}
                  />
                {audioFile ? <span className="mt-1 text-[11px] text-violet-200">{audioFile.name}</span> : null}
              </label>
            </CardContent>
          </Card>

          <Card className="settings-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">2. Информация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                  <Label htmlFor="snippet-title" className="block text-[12px] leading-8">
                    Название
                  </Label>
                  <Label htmlFor="snippet-artist" className="block text-[12px] leading-8">
                    Артист
                  </Label>
                </div>
                <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                  <Input id="snippet-title" value={title} onChange={(event) => setTitle(event.target.value)} className="h-14 text-[15px]" />
                  <Input id="snippet-artist" value={artist} onChange={(event) => setArtist(event.target.value)} className="h-14 text-[15px]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="grid gap-x-5 gap-y-1 sm:grid-cols-2">
                  <Label htmlFor="snippet-format" className="block text-[12px] leading-8">
                    Формат
                  </Label>
                  <Label htmlFor="snippet-duration" className="block text-[12px] leading-8">
                    Длительность
                  </Label>
                </div>
                <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                  <Select
                    id="snippet-format"
                    value={format}
                    onChange={(event) => setFormat(event.target.value as VideoSnippetFormat)}
                    options={VIDEO_SNIPPET_FORMATS.map((entry) => ({
                      value: entry.value,
                      label: entry.value === "story" ? "9:16 (Stories)" : entry.value === "square" ? "1:1 (Square)" : "16:9 (YouTube)"
                    }))}
                    className="h-14 text-[14px]"
                  />
                  <Select
                    id="snippet-duration"
                    value={duration}
                    onChange={(event) => setDuration(Number(event.target.value) as VideoSnippetDuration)}
                    options={VIDEO_SNIPPET_DURATIONS.map((entry) => ({
                      value: String(entry.value),
                      label: entry.label
                    }))}
                    className="h-14 text-[14px]"
                  />
                </div>
              </div>
              <div className="min-w-0 space-y-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snippet-accent" className="text-[12px]">Акцент</Label>
                  <button
                    type="button"
                    onClick={() => setAccentMode(accentMode === "auto" ? "manual" : "auto")}
                    className="w-[96px] shrink-0 truncate text-right text-[11px] font-semibold text-cyan-200 transition-colors hover:text-cyan-100"
                  >
                    {accentMode === "auto" ? "Auto" : "Manual"}
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,4fr)_minmax(72px,1fr)] gap-2">
                  <Input
                    id="snippet-accent"
                    value={accentColor}
                    onChange={(event) => {
                      setAccentMode("manual");
                      setAccentColor(event.target.value);
                    }}
                    placeholder="#38e8c5"
                    className="h-[52px]"
                  />
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(event) => {
                      setAccentMode("manual");
                      setAccentColor(event.target.value);
                    }}
                    className="h-[52px] w-full cursor-pointer rounded-xl border border-white/12 bg-black/25 p-1"
                  />
                </div>
              </div>
              <div className="min-w-0 space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snippet-text-font" className="text-[12px]">Текст</Label>
                  <span className="text-[11px] text-white/42">Font + animation</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="snippet-text-font" className="text-[12px]">Шрифт</Label>
                    <Select
                      id="snippet-text-font"
                      value={textControls.fontFamily}
                      onChange={(event) => updateTextControls({ fontFamily: event.target.value as TextControlsState["fontFamily"] })}
                      options={VIDEO_SNIPPET_TEXT_FONTS.map((entry) => ({ value: entry.value, label: entry.label }))}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="snippet-text-animation" className="text-[12px]">Анимация</Label>
                    <Select
                      id="snippet-text-animation"
                      value={textControls.animation}
                      onChange={(event) => updateTextControls({ animation: event.target.value as TextControlsState["animation"] })}
                      options={TEXT_ANIMATION_OPTIONS}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="snippet-text-source" className="text-[12px]">Источник</Label>
                    <Select
                      id="snippet-text-source"
                      value={textControls.animationSource}
                      onChange={(event) => updateTextControls({ animationSource: event.target.value as TextControlsState["animationSource"] })}
                      options={[
                        { value: "kick", label: "Kick" },
                        { value: "bass", label: "Bass" }
                      ]}
                      className="h-8 text-[13px]"
                    />
                  </div>
                  <SliderControl id="snippet-text-speed" label="Скорость анимации" valueLabel={textControls.animationSpeed.toFixed(1)} min={0.1} max={5} step={0.1} value={textControls.animationSpeed} onChange={(value) => updateTextControls({ animationSpeed: value })} />
                  <SliderControl id="snippet-text-pulse" label="Сила пульсации" valueLabel={`${Math.round(textControls.pulseStrength)}%`} min={0} max={100} step={1} value={textControls.pulseStrength} onChange={(value) => updateTextControls({ pulseStrength: value })} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="settings-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">3. Визуализация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="grid grid-cols-2 gap-1.5">
                {VIDEO_SNIPPET_STYLES.map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => handleStyleChange(entry.value)}
                    className={cn(
                      "min-h-[48px] rounded-xl border px-3 py-2 text-left text-[12px] font-semibold leading-[1.2] transition-all",
                      stylePreset === entry.value
                        ? "border-cyan-400/40 bg-cyan-500/12 text-cyan-100"
                        : "border-white/10 bg-black/20 text-white/72 hover:border-white/18 hover:bg-white/[0.05]"
                    )}
                  >
                    <span>{entry.label}</span>
                  </button>
                ))}
              </div>

              <div className="space-y-1">
                <Label htmlFor="snippet-platform" className="text-[12px]">Площадки</Label>
                <Select
                  id="snippet-platform"
                  value={platformPreset}
                  onChange={(event) => setPlatformPreset(event.target.value as VideoSnippetPlatformPreset)}
                  options={VIDEO_SNIPPET_PLATFORM_PRESETS.map((entry) => ({ value: entry.value, label: entry.label }))}
                  className="h-8 text-[13px]"
                />
              </div>

              {platformPreset === "custom" ? (
                <Textarea
                  value={customPlatformText}
                  onChange={(event) => setCustomPlatformText(event.target.value)}
                  placeholder="Пользовательский текст площадок"
                  className="min-h-[3.5rem]"
                />
              ) : null}
            </CardContent>
          </Card>

          <Card className="settings-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">4. Дроп и FX</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="snippet-drop-mode" className="text-[12px]">Режим дропа</Label>
                <Select
                  id="snippet-drop-mode"
                  value={dropEffect}
                  onChange={(event) => handleDropEffectChange(event.target.value as VideoSnippetDropEffect)}
                  options={VIDEO_SNIPPET_DROP_EFFECTS.map((entry) => ({ value: entry.value, label: entry.label }))}
                  className="h-8 text-[13px]"
                />
                <button
                  type="button"
                  className="text-left text-[11px] font-medium text-cyan-200 transition-colors hover:text-cyan-100"
                  onClick={() => {
                    setAutoDetectEnabled((value) => !value);
                    if (!autoDetectEnabled && dropEffect === "auto") {
                      setDropTime(Number(analysis.dropAt.toFixed(2)));
                    }
                  }}
                >
                  {autoDetectEnabled ? "Auto Detect включён" : "Auto Detect выключен"}
                </button>
              </div>
              <div className="space-y-1">
                <Label htmlFor="snippet-drop-time" className="text-[12px]">Тайминг (сек)</Label>
                <Input
                  id="snippet-drop-time"
                  type="number"
                  min={0}
                  step={0.1}
                  value={dropEffect === "auto" && autoDetectEnabled ? analysis.dropAt.toFixed(1) : dropTime}
                  disabled={dropEffect === "auto" && autoDetectEnabled}
                  onChange={(event) => setDropTime(Number(event.target.value))}
                  className="h-8"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="snippet-offset" className="text-[12px]">Старт участка</Label>
                <Input
                  id="snippet-offset"
                  type="number"
                  min={0}
                  step={0.1}
                  value={startOffset}
                  onChange={(event) => syncStartOffset(Number(event.target.value))}
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snippet-visual-power" className="text-[12px]">Сила визуализации</Label>
                  <span className="text-[12px] font-semibold text-white/55">{Math.round(visualPower * 100)}%</span>
                </div>
                <input
                  id="snippet-visual-power"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={visualPower}
                  onChange={(event) => setVisualPower(Number(event.target.value))}
                  className="icm-audio-slider h-6 w-full"
                  style={{ ["--slider-progress" as never]: `${visualPower * 100}%` }}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snippet-glow" className="text-[12px]">Glow</Label>
                  <span className="text-[12px] font-semibold text-white/55">{Math.round(glow * 100)}%</span>
                </div>
                <input
                  id="snippet-glow"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={glow}
                  onChange={(event) => setGlow(Number(event.target.value))}
                  className="icm-audio-slider h-6 w-full"
                  style={{ ["--slider-progress" as never]: `${glow * 100}%` }}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snippet-vignette" className="text-[12px]">Vignette</Label>
                  <span className="text-[12px] font-semibold text-white/55">{Math.round(vignette * 100)}%</span>
                </div>
                <input
                  id="snippet-vignette"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={vignette}
                  onChange={(event) => setVignette(Number(event.target.value))}
                  className="icm-audio-slider h-6 w-full"
                  style={{ ["--slider-progress" as never]: `${vignette * 100}%` }}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snippet-blur" className="text-[12px]">Blur BG</Label>
                  <span className="text-[12px] font-semibold text-white/55">{Math.round(blurBackground * 100)}%</span>
                </div>
                <input
                  id="snippet-blur"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={blurBackground}
                  onChange={(event) => setBlurBackground(Number(event.target.value))}
                  className="icm-audio-slider h-6 w-full"
                  style={{ ["--slider-progress" as never]: `${blurBackground * 100}%` }}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snippet-font-weight" className="text-[12px]">Шрифт (Вес)</Label>
                  <span className="text-[12px] font-semibold text-white/55">{titleWeight}</span>
                </div>
                <input
                  id="snippet-font-weight"
                  type="range"
                  min={500}
                  max={900}
                  step={10}
                  value={titleWeight}
                  onChange={(event) => setTitleWeight(Number(event.target.value))}
                  className="icm-audio-slider h-6 w-full"
                  style={{ ["--slider-progress" as never]: `${((titleWeight - 500) / 400) * 100}%` }}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="snippet-text-y" className="text-[12px]">Позиция (Y)</Label>
                  <span className="text-[12px] font-semibold text-white/55">{textOffsetY}px</span>
                </div>
                <input
                  id="snippet-text-y"
                  type="range"
                  min={-120}
                  max={120}
                  step={4}
                  value={textOffsetY}
                  onChange={(event) => setTextOffsetY(Number(event.target.value))}
                  className="icm-audio-slider h-6 w-full"
                  style={{ ["--slider-progress" as never]: `${((textOffsetY + 120) / 240) * 100}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="settings-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">5. Bass Reaction</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <SliderControl id="bass-sensitivity" label="Bass Sensitivity" valueLabel={`${Math.round(bassReactionControls.bassSensitivity)}%`} min={0} max={200} step={1} value={bassReactionControls.bassSensitivity} onChange={(value) => updateBassReactionControls({ bassSensitivity: value })} />
              <SliderControl id="bass-smoothness" label="Bass Smoothness" valueLabel={`${Math.round(bassReactionControls.bassSmoothness)}%`} min={0} max={100} step={1} value={bassReactionControls.bassSmoothness} onChange={(value) => updateBassReactionControls({ bassSmoothness: value })} />
              <SliderControl id="bass-cover-pulse" label="Cover Pulse" valueLabel={`${Math.round(bassReactionControls.coverPulse)}%`} min={0} max={100} step={1} value={bassReactionControls.coverPulse} onChange={(value) => updateBassReactionControls({ coverPulse: value })} />
              <SliderControl id="bass-bg-pulse" label="Background Pulse" valueLabel={`${Math.round(bassReactionControls.backgroundPulse)}%`} min={0} max={100} step={1} value={bassReactionControls.backgroundPulse} onChange={(value) => updateBassReactionControls({ backgroundPulse: value })} />
              <SliderControl id="bass-spectrum-pulse" label="Spectrum Pulse" valueLabel={`${Math.round(bassReactionControls.spectrumPulse)}%`} min={0} max={100} step={1} value={bassReactionControls.spectrumPulse} onChange={(value) => updateBassReactionControls({ spectrumPulse: value })} />
              <SliderControl id="bass-glow-burst" label="Glow Burst" valueLabel={`${Math.round(bassReactionControls.glowBurst)}%`} min={0} max={100} step={1} value={bassReactionControls.glowBurst} onChange={(value) => updateBassReactionControls({ glowBurst: value })} />
              <SliderControl id="bass-shake" label="Shake Amount" valueLabel={`${Math.round(bassReactionControls.shakeAmount)}px`} min={0} max={50} step={1} value={bassReactionControls.shakeAmount} onChange={(value) => updateBassReactionControls({ shakeAmount: value })} />
              <SliderControl id="bass-drop-impact" label="Drop Impact" valueLabel={`${Math.round(bassReactionControls.dropImpact)}%`} min={0} max={100} step={1} value={bassReactionControls.dropImpact} onChange={(value) => updateBassReactionControls({ dropImpact: value })} />
            </CardContent>
          </Card>

          <Card className="settings-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">6. Spectrum Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="snippet-spectrum-mode" className="text-[12px]">Режим спектра</Label>
                  <Select
                    id="snippet-spectrum-mode"
                    value={spectrumControls.mode}
                    onChange={(event) => updateSpectrumControls({ mode: event.target.value as SpectrumControlsState["mode"] })}
                    options={VIDEO_SNIPPET_SPECTRUMS.map((entry) => ({ value: entry.value, label: entry.label }))}
                    className="h-8 text-[13px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snippet-spectrum-color" className="text-[12px]">Цвет</Label>
                  <input
                    id="snippet-spectrum-color"
                    type="color"
                    value={spectrumControls.color}
                    onChange={(event) => updateSpectrumControls({ color: event.target.value })}
                    className="h-8 w-full cursor-pointer rounded-xl border border-white/12 bg-black/25 p-1"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="snippet-spectrum-orientation" className="text-[12px]">Разворот Spectrum</Label>
                  <Select
                    id="snippet-spectrum-orientation"
                    value={spectrumControls.orientation}
                    onChange={(event) => updateSpectrumOrientation(event.target.value as SpectrumControlsState["orientation"])}
                    options={[
                      { value: "normal", label: "Normal" },
                      { value: "mirror-x", label: "Mirror X" },
                      { value: "mirror-y", label: "Flip Y" },
                      { value: "mirror-both", label: "Mirror X + Y" }
                    ]}
                    className="h-8 text-[13px]"
                  />
                </div>
                <ToggleControl id="viz-invert" label="Инверсия спектра" checked={spectrumInvert} onChange={setSpectrumInvert} />
                <ToggleControl id="viz-follow-cover" label="Neon Orb следует за обложкой" checked={spectrumControls.followCover} onChange={(value) => updateSpectrumControls({ followCover: value })} />
                <SliderControl id="viz-bars" label="barsToDraw" valueLabel={String(spectrumControls.barsToDraw)} min={8} max={256} step={1} value={spectrumControls.barsToDraw} onChange={(value) => updateSpectrumControls({ barsToDraw: value })} />
                <SliderControl id="viz-size" label="spectrumSize" valueLabel={String(spectrumControls.spectrumSize)} min={1} max={200} step={1} value={spectrumControls.spectrumSize} onChange={(value) => updateSpectrumControls({ spectrumSize: value })} />
                <SliderControl id="viz-animation-time" label="Animation time" valueLabel={spectrumControls.animationTime.toFixed(1)} min={0} max={5} step={0.1} value={spectrumControls.animationTime} onChange={(value) => updateSpectrumControls({ animationTime: value })} />
                <SliderControl id="viz-bar-width" label="barWidth" valueLabel={String(spectrumControls.barWidth)} min={1} max={40} step={1} value={spectrumControls.barWidth} onChange={(value) => updateSpectrumControls({ barWidth: value })} />
                <SliderControl id="viz-pos-x" label="positionX" valueLabel={spectrumControls.positionX.toFixed(2)} min={0} max={1} step={0.01} value={spectrumControls.positionX} onChange={(value) => updateSpectrumControls({ positionX: value })} />
                <SliderControl id="viz-pos-y" label="positionY" valueLabel={spectrumControls.positionY.toFixed(2)} min={0} max={1} step={0.01} value={spectrumControls.positionY} onChange={(value) => updateSpectrumControls({ positionY: value })} />
                <SliderControl id="viz-spacing" label="spectrumSpacing" valueLabel={String(spectrumControls.spectrumSpacing)} min={0} max={50} step={1} value={spectrumControls.spectrumSpacing} onChange={(value) => updateSpectrumControls({ spectrumSpacing: value })} />
                <SliderControl id="viz-shadow-blur" label="shadowBlur" valueLabel={String(spectrumControls.shadowBlur)} min={0} max={100} step={1} value={spectrumControls.shadowBlur} onChange={(value) => updateSpectrumControls({ shadowBlur: value })} />
                <SliderControl id="viz-shadow-alpha" label="shadowAlpha" valueLabel={spectrumControls.shadowAlpha.toFixed(3)} min={0} max={1} step={0.001} value={spectrumControls.shadowAlpha} onChange={(value) => updateSpectrumControls({ shadowAlpha: value })} />
                <SliderControl id="viz-height-mult" label="barHeightMultiplier" valueLabel={spectrumControls.barHeightMultiplier.toFixed(1)} min={0} max={10} step={0.1} value={spectrumControls.barHeightMultiplier} onChange={(value) => updateSpectrumControls({ barHeightMultiplier: value })} />
                <SliderControl id="viz-shadow-x" label="shadowOffsetX" valueLabel={String(spectrumControls.shadowOffsetX)} min={-500} max={500} step={1} value={spectrumControls.shadowOffsetX} onChange={(value) => updateSpectrumControls({ shadowOffsetX: value })} />
                <SliderControl id="viz-shadow-y" label="shadowOffsetY" valueLabel={String(spectrumControls.shadowOffsetY)} min={-500} max={500} step={1} value={spectrumControls.shadowOffsetY} onChange={(value) => updateSpectrumControls({ shadowOffsetY: value })} />
                <SliderControl id="viz-time-smooth" label="Time Smoothing" valueLabel={spectrumControls.timeSmoothing.toFixed(2)} min={0} max={0.99} step={0.01} value={spectrumControls.timeSmoothing} onChange={(value) => updateSpectrumControls({ timeSmoothing: value })} />
                <SliderControl id="viz-smooth-points" label="smoothingPoints" valueLabel={String(spectrumControls.smoothingPoints)} min={0} max={20} step={1} value={spectrumControls.smoothingPoints} onChange={(value) => updateSpectrumControls({ smoothingPoints: value })} />
                <SliderControl id="viz-smooth-passes" label="smoothingPasses" valueLabel={String(spectrumControls.smoothingPasses)} min={0} max={10} step={1} value={spectrumControls.smoothingPasses} onChange={(value) => updateSpectrumControls({ smoothingPasses: value })} />
              </div>
            </CardContent>
          </Card>

          <Card className="settings-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">6. Cover Controls</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              <SliderControl id="cover-size" label="Cover Size" valueLabel={`${Math.round(coverScale * 100)}%`} min={0.65} max={1.4} step={0.01} value={coverScale} onChange={setCoverScale} />
              <SliderControl id="cover-pos-y" label="Cover Position Y" valueLabel={`${Math.round(coverOffsetY)}px`} min={-260} max={260} step={2} value={coverOffsetY} onChange={setCoverOffsetY} />
              <SliderControl id="cover-radius" label="Cover Radius" valueLabel={`${Math.round(coverRadius * 100)}%`} min={0} max={1.4} step={0.01} value={coverRadius} onChange={setCoverRadius} />
              <SliderControl id="cover-glow" label="Cover Glow" valueLabel={`${Math.round(coverGlow * 100)}%`} min={0} max={1.5} step={0.01} value={coverGlow} onChange={setCoverGlow} />
              <SliderControl id="cover-shadow" label="Cover Shadow" valueLabel={`${Math.round(coverShadow * 100)}%`} min={0} max={1.5} step={0.01} value={coverShadow} onChange={setCoverShadow} />
              <SliderControl id="cover-pulse" label="Cover Pulse" valueLabel={`${Math.round(coverPulse * 100)}%`} min={0} max={1.5} step={0.01} value={coverPulse} onChange={setCoverPulse} />
              <SliderControl id="cover-zoom" label="Cover Zoom" valueLabel={`${Math.round(coverZoom * 100)}%`} min={0} max={0.45} step={0.01} value={coverZoom} onChange={setCoverZoom} />
              <SliderControl id="cover-rotation" label="Rotation" valueLabel={`${coverControls.rotation.toFixed(1)}°`} min={-31} max={31} step={0.1} value={coverControls.rotation} onChange={(value) => updateCoverControls({ rotation: value })} />
              <ToggleControl id="cover-auto-rotation" label="Auto Rotation" checked={coverControls.autoRotation} onChange={(value) => updateCoverControls({ autoRotation: value })} />
              <SliderControl id="cover-rotation-speed" label="Rotation Speed" valueLabel={coverControls.rotationSpeed.toFixed(1)} min={0.1} max={5} step={0.1} value={coverControls.rotationSpeed} onChange={(value) => updateCoverControls({ rotationSpeed: value })} disabled={!coverControls.autoRotation} />
            </CardContent>
          </Card>

          <Card className="settings-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">7. Background Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0] ?? null;
                  if (!file) return;
                  if (!isAcceptedImageFile(file)) return;
                  updateFileState(file, "background");
                }}
                className="flex min-h-[5rem] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/14 bg-white/[0.03] px-3 py-2.5 text-center transition-colors hover:border-cyan-400/30 hover:bg-white/[0.05]"
              >
                <Upload className="h-4 w-4 text-cyan-200" />
                <span className="mt-1 text-[12px] font-semibold text-white">Пользовательский фон</span>
                <span className="text-[10px] text-white/52">JPG, PNG, WebP</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onUploadChange("background")}
                />
                {backgroundControls.customBackgroundFile ? (
                  <span className="mt-1 text-[11px] text-cyan-200">{backgroundControls.customBackgroundFile.name}</span>
                ) : null}
              </label>

              {backgroundControls.customBackgroundUrl ? (
                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-2">
                  <div
                    className="h-14 w-20 rounded-lg border border-white/10 bg-cover bg-center"
                    style={{ backgroundImage: `url(${backgroundControls.customBackgroundUrl})` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-white/80">Превью</p>
                    <p className="truncate text-[11px] text-white/42">{backgroundControls.customBackgroundFile?.name ?? "Пользовательское изображение"}</p>
                  </div>
                  <Button type="button" variant="ghost" className="h-8 px-3 text-[12px]" onClick={() => updateFileState(null, "background")}>
                    Убрать
                  </Button>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="bg-mode" className="text-[12px]">Режим фона</Label>
                  <Select
                    id="bg-mode"
                    value={backgroundControls.mode}
                    onChange={(event) => updateBackgroundControls({ mode: event.target.value as BackgroundControlsState["mode"] })}
                    options={VIDEO_SNIPPET_BACKGROUNDS.map((entry) => ({ value: entry.value, label: entry.label }))}
                    className="h-8 text-[13px]"
                  />
                </div>
                <ToggleControl id="bg-motion" label="Background Motion" checked={backgroundControls.motion} onChange={(value) => updateBackgroundControls({ motion: value })} />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <SliderControl id="bg-blur" label="Background Blur" valueLabel={String(backgroundControls.blur)} min={0} max={100} step={1} value={backgroundControls.blur} onChange={(value) => updateBackgroundControls({ blur: value })} />
                <SliderControl id="bg-brightness" label="Background Brightness" valueLabel={`${backgroundControls.brightness}%`} min={0} max={200} step={1} value={backgroundControls.brightness} onChange={(value) => updateBackgroundControls({ brightness: value })} />
                <SliderControl id="bg-opacity" label="Background Opacity" valueLabel={`${backgroundControls.opacity}%`} min={0} max={100} step={1} value={backgroundControls.opacity} onChange={(value) => updateBackgroundControls({ opacity: value })} />
                <SliderControl id="bg-scale" label="Background Scale" valueLabel={`${backgroundControls.scale}%`} min={100} max={200} step={1} value={backgroundControls.scale} onChange={(value) => updateBackgroundControls({ scale: value })} />
                <SliderControl id="bg-motion-speed" label="Background Motion Speed" valueLabel={backgroundControls.motionSpeed.toFixed(1)} min={0} max={5} step={0.1} value={backgroundControls.motionSpeed} onChange={(value) => updateBackgroundControls({ motionSpeed: value })} />
              </div>
            </CardContent>
          </Card>

          <Card className="settings-card border-white/10 bg-[#13151d]/92 p-2 shadow-[0_18px_60px_-42px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.03]">
            <CardHeader className="mb-2 px-0 py-0">
              <CardTitle className="text-[14px] font-semibold tracking-[0.01em]">8. Watermark / Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-[12px] text-white/72">
                Текст вотермарки: <span className="font-semibold text-white">{WATERMARK_TEXT}</span>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveWatermarkToggle(!removeWatermark)}
                className={cn(
                  "flex min-h-[80px] w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left transition-colors",
                  removeWatermark && canRemoveWatermark
                    ? "border-violet-500/60 bg-violet-500/10 shadow-[0_0_0_1px_rgba(123,61,245,0.14)]"
                    : "border-violet-500/35 bg-[#151022] hover:border-violet-400/60 hover:bg-[#1a132b]"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
                    <Lock className="h-4.5 w-4.5" />
                  </div>
                  <div className="space-y-0.5">
                    <div className="text-[15px] font-semibold tracking-[0.01em] text-violet-200">Убрать вотермарку</div>
                    <div className="text-[11px] text-white/45">Доступно только для PRO и ENTERPRISE</div>
                  </div>
                </div>
                <div
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-lg border transition-all",
                    removeWatermark && canRemoveWatermark
                      ? "border-violet-300/60 bg-violet-100/80 shadow-[0_0_24px_rgba(167,139,250,0.25)]"
                      : "border-white/18 bg-white/55"
                  )}
                >
                  <div
                    className={cn(
                      "h-4 w-4 rounded-sm transition-transform",
                      removeWatermark && canRemoveWatermark ? "translate-x-0 bg-violet-700" : "bg-white/80"
                    )}
                  />
                </div>
              </button>
              {subscriptionStatus === "error" ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-100">
                  Не удалось проверить подписку. Доступность Remove Watermark не изменена автоматически.
                </div>
              ) : null}
              <div className="text-[11px] text-white/42">
                Preview и Export используют одну и ту же логику вотермарки.
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] text-white/62">
                Формат экспорта определяется браузером автоматически: MP4 при поддержке, иначе WebM.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {proModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md">
          <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#13151d]/96 p-5 shadow-[0_28px_90px_-40px_rgba(123,61,245,0.65)]">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#7b3df5]/18 text-[#b996ff]">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-[18px] font-semibold text-white">Удаление вотермарки</h3>
                <p className="text-[13px] text-white/58">ICECREAMMUSIC Video Snippets</p>
              </div>
            </div>
            <p className="text-[14px] leading-6 text-white/72">{proMessage}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setProModalOpen(false)} className="h-10 px-4">
                Закрыть
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setProModalOpen(false);
                  window.location.href = "/dashboard/subscription";
                }}
                className="h-10 px-4"
              >
                Перейти в PRO
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
