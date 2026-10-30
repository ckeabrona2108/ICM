"use client";

import {
  AudioBufferSource,
  BufferTarget,
  CanvasSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output
} from "mediabunny";

import { createSnippetFrameAnalyzer, mixToMono } from "@/lib/snippet-audio-frames";

import type { VideoSnippetPlaybackFrame } from "./video-snippet-state";

export type SnippetFrameDrawer = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  playback: VideoSnippetPlaybackFrame
) => void;

export class SnippetExportUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnippetExportUnsupportedError";
  }
}

export interface RenderSnippetVideoOptions {
  audioBuffer: AudioBuffer;
  startTime: number;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  drawFrame: SnippetFrameDrawer;
  onProgress?: (progress: { frame: number; totalFrames: number; speed: number }) => void;
  signal?: AbortSignal;
  /** Video-only file (Spotify Canvas): the audio still drives the visuals but is not encoded. */
  muted?: boolean;
}

const OUTPUT_SAMPLE_RATE = 48000;
const FADE_IN_SECONDS = 0.03;
const FADE_OUT_SECONDS = 0.4;
const ANALYSER_WARMUP_SECONDS = 0.5;

// MessageChannel is not throttled like timers in a background tab, so a hidden tab keeps rendering.
function yieldToBrowser() {
  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      resolve();
    };
    channel.port2.postMessage(null);
  });
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    throw new DOMException("Рендер отменён", "AbortError");
  }
}

/** Same gain/compressor chain the preview plays through, plus short fades so the clip never clicks. */
async function renderSegmentAudio(audioBuffer: AudioBuffer, startTime: number, durationSeconds: number) {
  const length = Math.max(1, Math.ceil(durationSeconds * OUTPUT_SAMPLE_RATE));
  const context = new OfflineAudioContext(2, length, OUTPUT_SAMPLE_RATE);

  const source = context.createBufferSource();
  source.buffer = audioBuffer;

  const fade = context.createGain();
  const fadeOutStart = Math.max(FADE_IN_SECONDS, durationSeconds - FADE_OUT_SECONDS);
  fade.gain.setValueAtTime(0, 0);
  fade.gain.linearRampToValueAtTime(1, FADE_IN_SECONDS);
  fade.gain.setValueAtTime(1, fadeOutStart);
  fade.gain.linearRampToValueAtTime(0, durationSeconds);

  const gain = context.createGain();
  gain.gain.value = 0.9;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 18;
  compressor.ratio.value = 10;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.16;

  source.connect(fade);
  fade.connect(gain);
  gain.connect(compressor);
  compressor.connect(context.destination);
  source.start(0, startTime, durationSeconds);

  return context.startRendering();
}

export async function canRenderSnippetOffline(width: number, height: number) {
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined" || typeof OfflineAudioContext === "undefined") {
    return false;
  }
  const videoCodec = await getFirstEncodableVideoCodec(["avc"], { width, height });
  const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 2, sampleRate: OUTPUT_SAMPLE_RATE });
  return Boolean(videoCodec && audioCodec);
}

/**
 * Renders the snippet frame by frame and encodes it straight to an H.264 + AAC MP4.
 * Runs faster than real time and does not depend on the tab being visible.
 */
export async function renderSnippetVideo(options: RenderSnippetVideoOptions): Promise<Blob> {
  const { audioBuffer, startTime, durationSeconds, width, height, fps, drawFrame, onProgress, signal, muted = false } = options;

  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
    throw new SnippetExportUnsupportedError("WebCodecs недоступен в этом браузере");
  }
  const videoCodec = await getFirstEncodableVideoCodec(["avc"], { width, height });
  if (!videoCodec) {
    throw new SnippetExportUnsupportedError("Браузер не умеет кодировать H.264");
  }
  const audioCodec = muted ? null : await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 2, sampleRate: OUTPUT_SAMPLE_RATE });
  if (!muted && !audioCodec) {
    throw new SnippetExportUnsupportedError("Браузер не умеет кодировать звук");
  }

  throwIfAborted(signal);
  const segmentAudio = muted ? null : await renderSegmentAudio(audioBuffer, startTime, durationSeconds);
  throwIfAborted(signal);

  const channels = Array.from({ length: audioBuffer.numberOfChannels }, (_, index) => audioBuffer.getChannelData(index));
  const analyzer = createSnippetFrameAnalyzer({ mono: mixToMono(channels), sampleRate: audioBuffer.sampleRate, fps });
  for (let time = Math.max(0, startTime - ANALYSER_WARMUP_SECONDS); time < startTime; time += 1 / fps) {
    analyzer.frameAt(time);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new SnippetExportUnsupportedError("Canvas недоступен");
  }
  context.imageSmoothingEnabled = true;

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  // ~8 Mbit/s for 1080×1920 at 30 fps — what Reels and TikTok re-encode to anyway; grain would otherwise balloon the file.
  const videoBitrate = Math.round(width * height * fps * 0.13);
  const videoSource = new CanvasSource(canvas, { codec: videoCodec, bitrate: videoBitrate, keyFrameInterval: 2 });
  const audioSource = audioCodec ? new AudioBufferSource({ codec: audioCodec, bitrate: 192_000 }) : null;
  output.addVideoTrack(videoSource, { frameRate: fps });
  if (audioSource) output.addAudioTrack(audioSource);

  try {
    await output.start();
    if (audioSource && segmentAudio) {
      await audioSource.add(segmentAudio);
      audioSource.close();
    }

    const totalFrames = Math.max(1, Math.round(durationSeconds * fps));
    const startedAt = performance.now();
    for (let frame = 0; frame < totalFrames; frame += 1) {
      throwIfAborted(signal);
      const trackTime = startTime + frame / fps;
      const { frequencyData, waveformData } = analyzer.frameAt(trackTime);
      drawFrame(context, width, height, {
        currentTime: trackTime,
        duration: audioBuffer.duration,
        frequencyData,
        waveformData,
        isPlaying: true
      });
      await videoSource.add(frame / fps, 1 / fps);

      if (frame % 6 === 5 || frame === totalFrames - 1) {
        const elapsedSeconds = (performance.now() - startedAt) / 1000;
        onProgress?.({
          frame: frame + 1,
          totalFrames,
          speed: elapsedSeconds > 0 ? (frame + 1) / fps / elapsedSeconds : 0
        });
        await yieldToBrowser();
      }
    }

    videoSource.close();
    await output.finalize();
  } catch (error) {
    if (output.state !== "finalized" && output.state !== "canceled") {
      await output.cancel().catch(() => {});
    }
    throw error;
  }

  if (!target.buffer) {
    throw new Error("Пустой результат рендера");
  }
  return new Blob([target.buffer], { type: "video/mp4" });
}
