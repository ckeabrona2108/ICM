"use client";

import * as React from "react";

import { renderSnippetVideo, SnippetExportUnsupportedError, type RenderSnippetVideoOptions } from "./render-snippet-video";
import { defaultRecordState, type VideoRecordState } from "./video-snippet-state";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function resolveRecordingMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];
  for (const candidate of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

export function extensionFromMime(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return "webm";
}

export function useVideoRecorder(params: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  getAudioStream: () => Promise<MediaStream | null>;
}) {
  const { canvasRef, getAudioStream } = params;
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const progressTimerRef = React.useRef<number | null>(null);
  const stopTimerRef = React.useRef<number | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const [recordState, setRecordState] = React.useState<VideoRecordState>(defaultRecordState);

  const clearTimers = React.useCallback(() => {
    if (progressTimerRef.current) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (stopTimerRef.current) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const reset = React.useCallback(() => {
    setRecordState((current) => {
      if (current.downloadUrl) {
        URL.revokeObjectURL(current.downloadUrl);
      }
      return defaultRecordState;
    });
  }, []);

  const start = React.useCallback(
    async (options: {
      durationSeconds: number;
      fileNameBase: string;
      onBeforeStart?: () => Promise<void> | void;
      onAfterStop?: () => Promise<void> | void;
    }) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        setRecordState({ ...defaultRecordState, status: "error", message: "Превью недоступно" });
        return;
      }

      const mimeType = resolveRecordingMimeType();
      if (!mimeType || typeof MediaRecorder === "undefined") {
        setRecordState({ ...defaultRecordState, status: "error", message: "MediaRecorder недоступен" });
        return;
      }

      clearTimers();
      reset();

      const previewStream = canvas.captureStream(60);
      const audioStream = await getAudioStream();
      const combinedStream = new MediaStream([
        ...previewStream.getVideoTracks(),
        ...(audioStream ? audioStream.getAudioTracks() : [])
      ]);

      chunksRef.current = [];
      setRecordState({
        status: "recording",
        progress: 0,
        downloadUrl: null,
        mimeType,
        fileName: `${options.fileNameBase}.${extensionFromMime(mimeType)}`,
        message: "Сборка видео..."
      });

      try {
        if (options.onBeforeStart) {
          await options.onBeforeStart();
        }

        const recorder = new MediaRecorder(combinedStream, { mimeType });
        recorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data);
          }
        };

        recorder.onerror = () => {
          setRecordState({ ...defaultRecordState, status: "error", message: "Не удалось записать видео" });
        };

        recorder.onstop = () => {
          clearTimers();
          setRecordState((current) => ({
            ...current,
            status: "finalizing",
            message: "Сборка файла..."
          }));
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const downloadUrl = URL.createObjectURL(blob);
          setRecordState({
            status: "complete",
            progress: 100,
            downloadUrl,
            mimeType,
            fileName: `${options.fileNameBase}.${extensionFromMime(mimeType)}`,
            message: "Видео готово"
          });
          combinedStream.getTracks().forEach((track) => track.stop());
          void options.onAfterStop?.();
        };

        const startedAt = performance.now();
        const updateProgress = () => {
          const elapsed = (performance.now() - startedAt) / 1000;
          const progress = clamp((elapsed / Math.max(1, options.durationSeconds)) * 100, 0, 100);
          setRecordState((current) => ({ ...current, progress, message: `Рендер ${Math.round(progress)}%` }));
          if (elapsed >= options.durationSeconds) {
            if (recorderRef.current?.state === "recording") {
              recorderRef.current.stop();
            }
            return;
          }
          progressTimerRef.current = window.setTimeout(updateProgress, 140);
        };

        recorder.start(100);
        updateProgress();
        stopTimerRef.current = window.setTimeout(() => {
          if (recorderRef.current?.state === "recording") {
            recorderRef.current.stop();
          }
        }, options.durationSeconds * 1000);
      } catch {
        clearTimers();
        combinedStream.getTracks().forEach((track) => track.stop());
        setRecordState({ ...defaultRecordState, status: "error", message: "Не удалось запустить запись" });
      }
    },
    [canvasRef, clearTimers, getAudioStream, reset]
  );

  /**
   * Frame-by-frame MP4 export. Resolves `false` when the browser cannot encode
   * offline, so the caller can fall back to real-time recording.
   */
  const renderOffline = React.useCallback(
    async (options: Omit<RenderSnippetVideoOptions, "onProgress" | "signal"> & { fileNameBase: string }) => {
      const { fileNameBase, ...renderOptions } = options;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      reset();
      const fileName = `${fileNameBase}.mp4`;
      setRecordState({
        status: "recording",
        progress: 0,
        downloadUrl: null,
        mimeType: "video/mp4",
        fileName,
        message: "Подготовка звука..."
      });

      try {
        const blob = await renderSnippetVideo({
          ...renderOptions,
          signal: controller.signal,
          onProgress: ({ frame, totalFrames, speed }) => {
            const speedLabel = speed >= 1 ? ` · в ${speed.toFixed(1).replace(".", ",")}× быстрее реального времени` : "";
            setRecordState((current) => ({
              ...current,
              progress: (frame / totalFrames) * 100,
              message: `Кадр ${frame} / ${totalFrames}${speedLabel}`
            }));
          }
        });
        setRecordState({
          status: "complete",
          progress: 100,
          downloadUrl: URL.createObjectURL(blob),
          mimeType: "video/mp4",
          fileName,
          message: `Видео готово · MP4 · ${(blob.size / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`
        });
        return true;
      } catch (error) {
        if (error instanceof SnippetExportUnsupportedError) {
          setRecordState(defaultRecordState);
          return false;
        }
        if (error instanceof DOMException && error.name === "AbortError") {
          setRecordState({ ...defaultRecordState, message: "Рендер отменён" });
          return true;
        }
        console.error("[VideoSnippets] offline render failed", error);
        setRecordState({ ...defaultRecordState, status: "error", message: "Не удалось собрать видео" });
        return true;
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [reset]
  );

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  React.useEffect(() => {
    return () => {
      clearTimers();
      abortRef.current?.abort();
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    };
  }, [clearTimers]);

  return {
    recordState,
    start,
    renderOffline,
    cancel,
    reset
  };
}
