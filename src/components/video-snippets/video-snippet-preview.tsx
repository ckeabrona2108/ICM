"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type {
  VideoSnippetBackground,
  VideoSnippetDropEffect,
  VideoSnippetFormat,
  VideoSnippetSpectrum,
  VideoSnippetStyle
} from "@/lib/video-snippets";

import { renderFrame, type CoverImage } from "./render-snippet-frame";
import { useCanvasRenderer } from "./use-canvas-renderer";
import type {
  BassReactionControlsState,
  BackgroundControlsState,
  CoverControlsState,
  VideoSnippetPlaybackFrame,
  SpectrumControlsState,
  TextControlsState,
  VideoSnippetRenderState
} from "./video-snippet-state";

interface VideoSnippetPreviewProps {
  analysisRef: React.RefObject<VideoSnippetPlaybackFrame | null>;
  coverUrl: string | null;
  title: string;
  artist: string;
  platformText: string;
  showWatermark: boolean;
  accentColor: string;
  format: VideoSnippetFormat;
  stylePreset: VideoSnippetStyle;
  spectrum: VideoSnippetSpectrum;
  backgroundEffect: VideoSnippetBackground;
  dropEffect: VideoSnippetDropEffect;
  dropAt: number;
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
  shouldAnimate: boolean;
  className?: string;
}

function drawPreviewFallback(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  params: {
    accentColor: string;
    title: string;
    artist: string;
    showWatermark: boolean;
  }
) {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#07090d";
  context.fillRect(0, 0, width, height);

  const glow = context.createRadialGradient(width / 2, height * 0.28, 0, width / 2, height * 0.28, Math.max(width, height) * 0.72);
  glow.addColorStop(0, `${params.accentColor}55`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(255,255,255,0.08)";
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(width * 0.17, height * 0.16, width * 0.66, width * 0.66, 36);
  context.stroke();

  context.fillStyle = "rgba(255,255,255,0.94)";
  context.textAlign = "center";
  context.font = `700 ${Math.round(width * 0.032)}px Inter, system-ui, sans-serif`;
  context.fillText(params.title || "New Track", width / 2, height * 0.63, width * 0.76);

  context.fillStyle = params.accentColor;
  context.font = `500 ${Math.round(width * 0.022)}px Inter, system-ui, sans-serif`;
  context.fillText(params.artist || "Artist Name", width / 2, height * 0.67, width * 0.7);

  if (params.showWatermark) {
    context.fillStyle = "rgba(255,255,255,0.42)";
    context.font = `500 ${Math.round(width * 0.016)}px Inter, system-ui, sans-serif`;
    context.fillText("video by ICECREAMMUSIC", width / 2, height - Math.max(32, height * 0.04));
  }
}

const VideoSnippetPreviewBase = React.forwardRef<HTMLCanvasElement, VideoSnippetPreviewProps>(
  function VideoSnippetPreview(
    {
      analysisRef,
      coverUrl,
      title,
      artist,
      platformText,
      showWatermark,
      accentColor,
      format,
      stylePreset,
      spectrum,
      backgroundEffect,
      dropEffect,
      dropAt,
      visualPower,
      glow,
      blurBackground,
      vignette,
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
      spectrumControls,
      textControls,
      coverControls,
      backgroundControls,
      bassReactionControls,
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
      shouldAnimate,
      className
    }: VideoSnippetPreviewProps,
    forwardedRef
  ) {
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const coverRef = React.useRef<CoverImage | null>(null);
    const backgroundRef = React.useRef<CoverImage | null>(null);
    const [coverVersion, setCoverVersion] = React.useState(0);
    const [backgroundVersion, setBackgroundVersion] = React.useState(0);

    React.useImperativeHandle(forwardedRef, () => canvasRef.current as HTMLCanvasElement, []);

    React.useEffect(() => {
      if (!coverUrl) {
        coverRef.current = null;
        setCoverVersion((value) => value + 1);
        return;
      }

      let active = true;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      const commitImage = () => {
        if (!active) return;
        coverRef.current = {
          image,
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
          loadedAt: performance.now()
        };
        setCoverVersion((value) => value + 1);
      };
      image.onload = () => {
        if ("decode" in image) {
          image.decode().catch(() => {}).finally(commitImage);
          return;
        }
        commitImage();
      };
      image.onerror = () => {
        if (!active) return;
        coverRef.current = null;
        setCoverVersion((value) => value + 1);
      };
      image.src = coverUrl;

      if (image.complete && image.naturalWidth > 0) {
        commitImage();
      }

      return () => {
        active = false;
      };
    }, [coverUrl]);

    React.useEffect(() => {
      const backgroundUrl = backgroundControls.customBackgroundUrl;
      if (!backgroundUrl) {
        backgroundRef.current = null;
        setBackgroundVersion((value) => value + 1);
        return;
      }

      let active = true;
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      const commitImage = () => {
        if (!active) return;
        backgroundRef.current = {
          image,
          width: image.naturalWidth || image.width,
          height: image.naturalHeight || image.height,
          loadedAt: performance.now()
        };
        setBackgroundVersion((value) => value + 1);
      };
      image.onload = () => {
        if ("decode" in image) {
          image.decode().catch(() => {}).finally(commitImage);
          return;
        }
        commitImage();
      };
      image.onerror = () => {
        if (!active) return;
        backgroundRef.current = null;
        setBackgroundVersion((value) => value + 1);
      };
      image.src = backgroundUrl;

      if (image.complete && image.naturalWidth > 0) {
        commitImage();
      }

      return () => {
        active = false;
      };
    }, [backgroundControls.customBackgroundUrl]);

    const draw = React.useCallback(
      (context: CanvasRenderingContext2D, width: number, height: number) => {
        const state: VideoSnippetRenderState = {
          width,
          height,
          config: {
            coverUrl,
            title,
            artist,
            platformText,
            showWatermark,
            accentColor,
            format,
            duration: 15,
            stylePreset,
            spectrum,
            backgroundEffect,
            dropEffect,
            dropTiming: dropAt,
            visualPower,
            glow,
            blurBackground,
            vignette,
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
            spectrumControls,
            textControls,
            coverControls,
            backgroundControls,
            bassReactionControls,
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
            backgroundBassPulse
          },
          playback: analysisRef.current,
          cover: coverRef.current,
          background: backgroundRef.current
        };
        try {
          renderFrame(context, state);
        } catch (error) {
          console.error("[VideoSnippets] preview render failed", error);
          drawPreviewFallback(context, width, height, {
            accentColor,
            title,
            artist,
            showWatermark
          });
        }
      },
      [
        accentColor,
        analysisRef,
        artist,
        backgroundEffect,
        blurBackground,
        coverUrl,
        dropAt,
        dropEffect,
        format,
        glow,
        platformText,
        spectrum,
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
        orbSize,
        orbRingThickness,
        orbRingGlow,
        orbWaveHeight,
        orbWaveLayers,
        orbParticleAmount,
        orbParticleSpeed,
        orbBassSensitivity,
        spectrumControls,
        textControls,
        coverControls,
        backgroundControls,
        bassReactionControls,
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
        vignette,
        visualPower,
        backgroundVersion,
        coverVersion
      ]
    );

    useCanvasRenderer({
      canvasRef,
      containerRef,
      format,
      shouldAnimate,
      draw
    });

    return (
      <div ref={containerRef} className={cn("relative flex h-full w-full items-center justify-center overflow-hidden rounded-[30px]", className)}>
        <canvas ref={canvasRef} className="block max-h-full max-w-full" aria-label="Live video preview" />
      </div>
    );
  }
);

VideoSnippetPreviewBase.displayName = "VideoSnippetPreview";

export const VideoSnippetPreview = React.memo(VideoSnippetPreviewBase);
