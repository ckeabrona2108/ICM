"use client";

import * as React from "react";

import { analyzeEnergyTimeline, getEffectiveSegment } from "@/lib/video-snippets";

import { defaultSnippetAnalysis, type VideoSnippetPlaybackFrame } from "./video-snippet-state";

type AudioEngine = {
  context: AudioContext;
  analyser: AnalyserNode;
  gainNode: GainNode;
  compressor: DynamicsCompressorNode;
  destination: MediaStreamAudioDestinationNode;
  mediaElementSource: MediaElementAudioSourceNode | null;
};

type AudioMode = "buffer" | "element" | "unsupported";

type BufferSourceState = {
  kind: "buffer";
  node: AudioBufferSourceNode;
  startedAt: number;
  offset: number;
  stopAt: number;
  token: number;
};

type ElementSourceState = {
  kind: "element";
  element: HTMLAudioElement;
  offset: number;
  stopAt: number;
  token: number;
};

type SourceState = BufferSourceState | ElementSourceState;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fileKey(file: File | null) {
  return file ? `${file.name}:${file.size}:${file.lastModified}` : null;
}

function urlKey(url: string | null) {
  return url ? `url:${url}` : null;
}

function isSupportedAudioMode(mode: AudioMode) {
  return mode === "buffer" || mode === "element";
}

async function decodeArrayBuffer(buffer: ArrayBuffer, context: BaseAudioContext) {
  return context.decodeAudioData(buffer.slice(0));
}

async function decodeAudioFile(file: File, context: BaseAudioContext) {
  const buffer = await file.arrayBuffer();
  return decodeArrayBuffer(buffer, context);
}

async function readAudioBuffer(url: string, context: BaseAudioContext) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  return decodeArrayBuffer(buffer, context);
}

function createAudioElement(sourceUrl: string) {
  const audio = new Audio(sourceUrl);
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  audio.muted = false;
  audio.loop = false;
  return audio;
}

function ensureMediaElementRouting(engine: AudioEngine, audio: HTMLAudioElement, sourceRef: React.MutableRefObject<MediaElementAudioSourceNode | null>) {
  if (sourceRef.current) {
    return sourceRef.current;
  }
  const sourceNode = engine.context.createMediaElementSource(audio);
  sourceNode.connect(engine.analyser);
  sourceNode.connect(engine.gainNode);
  sourceRef.current = sourceNode;
  engine.mediaElementSource = sourceNode;
  return sourceNode;
}

async function waitForMetadata(audio: HTMLAudioElement) {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  await new Promise<void>((resolve, reject) => {
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("HTMLAudioElement metadata load failed"));
    };
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("error", handleError);
    };
    audio.addEventListener("loadedmetadata", handleLoaded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
  });
  return audio.duration;
}

function describeAudioError(error: unknown) {
  if (error instanceof DOMException) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }
  if (error instanceof Error) {
    return error.message ? `${error.name}: ${error.message}` : error.name;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function useAudioAnalyzer(params: {
  audioUrl: string | null;
  audioFile: File | null;
  audioBuffer: AudioBuffer | null;
  autoDetectEnabled: boolean;
  startOffset: number;
}) {
  const { audioUrl, audioFile, audioBuffer, autoDetectEnabled, startOffset } = params;
  const analysisRef = React.useRef<VideoSnippetPlaybackFrame | null>(null);
  const engineRef = React.useRef<AudioEngine | null>(null);
  const sourceRef = React.useRef<SourceState | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const stopTimerRef = React.useRef<number | null>(null);
  const loadPromiseRef = React.useRef<Promise<AudioBuffer | null> | null>(null);
  const loadSignatureRef = React.useRef<string | null>(null);
  const loadRequestIdRef = React.useRef(0);
  const loadedUrlRef = React.useRef<string | null>(null);
  const loadedFileKeyRef = React.useRef<string | null>(null);
  const loadedModeRef = React.useRef<AudioMode>("unsupported");
  const sourceTokenRef = React.useRef(0);
  const currentTimeRef = React.useRef(0);
  const lastUiSyncRef = React.useRef(0);
  const activeSegmentDurationRef = React.useRef<number | null>(null);
  const audioElementRef = React.useRef<HTMLAudioElement | null>(null);
  const mediaElementSourceRef = React.useRef<MediaElementAudioSourceNode | null>(null);
  const resolvedBufferRef = React.useRef<AudioBuffer | null>(audioBuffer);
  const playbackActiveRef = React.useRef(false);

  const [isReady, setIsReady] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [durationSeconds, setDurationSeconds] = React.useState(0);
  const [analysis, setAnalysis] = React.useState(defaultSnippetAnalysis);
  const [audioMode, setAudioMode] = React.useState<AudioMode>("unsupported");
  const [analysisStatus, setAnalysisStatus] = React.useState<string>("Аудио не загружено");
  const [resolvedAudioBuffer, setResolvedAudioBuffer] = React.useState<AudioBuffer | null>(audioBuffer);

  const getLoadedDuration = React.useCallback(() => {
    return resolvedBufferRef.current?.duration ?? durationSeconds ?? audioBuffer?.duration ?? 0;
  }, [audioBuffer, durationSeconds]);

  const applyCurrentTime = React.useCallback((nextTime: number) => {
    currentTimeRef.current = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const updatePlaybackState = React.useCallback((nextPlaying: boolean) => {
    playbackActiveRef.current = nextPlaying;
    setIsPlaying(nextPlaying);
  }, []);

  const getPlaybackTime = React.useCallback(() => {
    const source = sourceRef.current;
    if (!source) return currentTimeRef.current;
    if (source.kind === "buffer") {
      const elapsed = source.node.context.currentTime - source.startedAt;
      return clamp(source.offset + elapsed, source.offset, source.stopAt);
    }
    return clamp(source.element.currentTime, source.offset, source.stopAt);
  }, []);

  const clearPlaybackTimers = React.useCallback(() => {
    if (stopTimerRef.current !== null) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }, []);

  const stopCurrentPlayback = React.useCallback(() => {
    const source = sourceRef.current;
    sourceTokenRef.current += 1;
    clearPlaybackTimers();
    if (!source) {
      activeSegmentDurationRef.current = null;
      return;
    }

    if (source.kind === "buffer") {
      source.node.onended = null;
      try {
        source.node.stop();
      } catch {}
      source.node.disconnect();
    } else {
      source.element.onended = null;
      source.element.pause();
    }

    sourceRef.current = null;
    activeSegmentDurationRef.current = null;
    playbackActiveRef.current = false;
  }, [clearPlaybackTimers]);

  const clearSource = React.useCallback((nextTime: number, nextStatus: string, nextPlaying = false, options?: { seekElementTo?: number }) => {
    const source = sourceRef.current;
    sourceTokenRef.current += 1;
    clearPlaybackTimers();
    if (source) {
      if (source.kind === "buffer") {
        source.node.onended = null;
        try {
          source.node.stop();
        } catch {}
        source.node.disconnect();
      } else {
        source.element.onended = null;
        source.element.pause();
        if (typeof options?.seekElementTo === "number" && Number.isFinite(options.seekElementTo)) {
          try {
            source.element.currentTime = options.seekElementTo;
          } catch {}
        }
      }
      sourceRef.current = null;
    }
    activeSegmentDurationRef.current = null;
    applyCurrentTime(nextTime);
    updatePlaybackState(nextPlaying);
    setAnalysisStatus(nextStatus);
  }, [applyCurrentTime, clearPlaybackTimers, updatePlaybackState]);

  const disposeEngine = React.useCallback(() => {
    stopCurrentPlayback();
    const audioElement = audioElementRef.current;
    if (audioElement) {
      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load();
      audioElementRef.current = null;
    }
    if (mediaElementSourceRef.current) {
      mediaElementSourceRef.current.disconnect();
      mediaElementSourceRef.current = null;
    }
    const engine = engineRef.current;
    if (engine) {
      engine.analyser.disconnect();
      engine.gainNode.disconnect();
      engine.compressor.disconnect();
      engine.destination.disconnect();
      void engine.context.close().catch(() => {});
      engineRef.current = null;
    }
    loadedUrlRef.current = null;
    loadedFileKeyRef.current = null;
      resolvedBufferRef.current = null;
      analysisRef.current = null;
      playbackActiveRef.current = false;
  }, [stopCurrentPlayback]);

  const ensureEngine = React.useCallback(async () => {
    if (!audioUrl && !audioBuffer && !audioFile) return null;

    const existing = engineRef.current;
    if (existing) return existing;

    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("AudioContext unavailable");

      const context = new AudioContextClass();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;

      const gainNode = context.createGain();
      gainNode.gain.value = 0.9;

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 18;
      compressor.ratio.value = 10;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.16;

      const destination = context.createMediaStreamDestination();
      gainNode.connect(compressor);
      compressor.connect(context.destination);
      compressor.connect(destination);

      const engine = { context, analyser, gainNode, compressor, destination, mediaElementSource: null } satisfies AudioEngine;
      engineRef.current = engine;
      return engine;
    } catch (error) {
      console.error("Failed to initialize audio engine:", error);
      const errorText = describeAudioError(error);
      setIsReady(false);
      setAnalysisStatus(`Не удалось прочитать аудио. ${errorText}`);
      return null;
    }
  }, [audioBuffer, audioFile, audioUrl]);

  const analyzeBuffer = React.useCallback((buffer: AudioBuffer) => {
    const channelData = buffer.getChannelData(0);
    const windowSize = Math.max(1024, Math.floor(channelData.length / 220));
    const energies: number[] = [];

    for (let start = 0; start < channelData.length; start += windowSize) {
      const end = Math.min(channelData.length, start + windowSize);
      let sumSquares = 0;
      let peak = 0;
      for (let index = start; index < end; index += 1) {
        const value = channelData[index] ?? 0;
        sumSquares += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      const rms = Math.sqrt(sumSquares / Math.max(1, end - start));
      energies.push(clamp(rms * 1.6 + peak * 0.35, 0, 1));
    }

    return analyzeEnergyTimeline(energies, buffer.duration || 1);
  }, []);

  const loadAudio = React.useCallback(async () => {
    const nextSignature = audioBuffer
      ? `buffer:${audioBuffer.duration}:${audioBuffer.length}:${audioBuffer.numberOfChannels}`
      : audioFile
        ? fileKey(audioFile)
        : audioUrl
          ? urlKey(audioUrl)
          : "empty";

    if (loadPromiseRef.current && loadSignatureRef.current === nextSignature) {
      return loadPromiseRef.current;
    }

    const requestId = ++loadRequestIdRef.current;
    loadSignatureRef.current = nextSignature;
    const run = async () => {
      if (!audioUrl && !audioFile && !audioBuffer) {
      setResolvedAudioBuffer(null);
      resolvedBufferRef.current = null;
      setDurationSeconds(0);
      setIsReady(false);
      setAudioMode("unsupported");
      setAnalysis(defaultSnippetAnalysis);
      setAnalysisStatus("Аудио не загружено");
      return null;
    }

      if (audioBuffer) {
      if (loadRequestIdRef.current !== requestId) return null;
      const nextKey = urlKey(audioUrl);
      if (resolvedBufferRef.current === audioBuffer && loadedUrlRef.current === nextKey && loadedModeRef.current === "buffer") {
        return audioBuffer;
      }
      clearPlaybackTimers();
      if (sourceRef.current) {
        clearSource(currentTimeRef.current, "Аудио загружено", false);
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause();
        audioElementRef.current.removeAttribute("src");
        audioElementRef.current.load();
        audioElementRef.current = null;
      }
      if (mediaElementSourceRef.current) {
        mediaElementSourceRef.current.disconnect();
        mediaElementSourceRef.current = null;
      }
      resolvedBufferRef.current = audioBuffer;
      setResolvedAudioBuffer(audioBuffer);
      loadedUrlRef.current = nextKey;
      loadedFileKeyRef.current = null;
      loadedModeRef.current = "buffer";
      setAudioMode("buffer");
      setDurationSeconds(audioBuffer.duration || 0);
      setIsReady(true);
      const nextAnalysis = analyzeBuffer(audioBuffer);
      setAnalysis(nextAnalysis);
      setAnalysisStatus("Аудио загружено");
      console.info("[VideoSnippets] audio load mode:", "buffer");
      return audioBuffer;
    }

      const engine = await ensureEngine();
      if (!engine) return null;
      if (loadRequestIdRef.current !== requestId) return null;

      try {
        setIsReady(false);
        setAnalysisStatus("Загружаем аудио...");

        let nextBuffer: AudioBuffer | null = null;
        if (audioFile) {
          const nextFileKey = fileKey(audioFile);
          if (resolvedBufferRef.current && loadedFileKeyRef.current === nextFileKey && loadedModeRef.current === "buffer") {
            nextBuffer = resolvedBufferRef.current;
          } else {
            nextBuffer = await decodeAudioFile(audioFile, engine.context);
            if (loadRequestIdRef.current !== requestId) return null;
            loadedFileKeyRef.current = nextFileKey;
            loadedUrlRef.current = null;
          }
        } else if (audioUrl) {
          const nextUrlKey = urlKey(audioUrl);
          if (resolvedBufferRef.current && loadedUrlRef.current === nextUrlKey && loadedModeRef.current === "buffer") {
            nextBuffer = resolvedBufferRef.current;
          } else {
            nextBuffer = await readAudioBuffer(audioUrl, engine.context);
            if (loadRequestIdRef.current !== requestId) return null;
            loadedUrlRef.current = nextUrlKey;
            loadedFileKeyRef.current = null;
          }
        }

        if (!nextBuffer) return null;
        if (loadRequestIdRef.current !== requestId) return null;

        resolvedBufferRef.current = nextBuffer;
        setResolvedAudioBuffer(nextBuffer);
        setDurationSeconds(nextBuffer.duration || 0);
        loadedModeRef.current = "buffer";
        setAudioMode("buffer");
        setIsReady(true);
        setAnalysis(analyzeBuffer(nextBuffer));
        setAnalysisStatus("Аудио загружено");
        console.info("[VideoSnippets] audio load mode:", "buffer");
        return nextBuffer;
      } catch (error) {
        if (loadRequestIdRef.current !== requestId) return null;
        console.warn("[VideoSnippets] decodeAudioData failed:", error);

        const fallbackSourceUrl = audioFile ? URL.createObjectURL(audioFile) : audioUrl;
        if (!fallbackSourceUrl) {
          resolvedBufferRef.current = null;
          setResolvedAudioBuffer(null);
          setDurationSeconds(0);
          setIsReady(false);
          loadedModeRef.current = "unsupported";
          setAudioMode("unsupported");
          setAnalysis(defaultSnippetAnalysis);
          setAnalysisStatus("Файл не поддерживается браузером");
          return null;
        }

        try {
          clearPlaybackTimers();
          if (audioElementRef.current) {
            audioElementRef.current.pause();
            audioElementRef.current.removeAttribute("src");
            audioElementRef.current.load();
            audioElementRef.current = null;
          }
          if (mediaElementSourceRef.current) {
            mediaElementSourceRef.current.disconnect();
            mediaElementSourceRef.current = null;
          }

          const audio = createAudioElement(fallbackSourceUrl);
          audioElementRef.current = audio;
          const metadataDuration = await waitForMetadata(audio);
          if (loadRequestIdRef.current !== requestId) return null;
          ensureMediaElementRouting(engine, audio, mediaElementSourceRef);

          resolvedBufferRef.current = null;
          setResolvedAudioBuffer(null);
          setDurationSeconds(Number.isFinite(metadataDuration) ? metadataDuration || 0 : audio.duration || 0);
          loadedModeRef.current = "element";
          setAudioMode("element");
          setIsReady(true);
          setAnalysis(defaultSnippetAnalysis);
          setAnalysisStatus("Совместимый режим: проигрывание работает, анализ ограничен");
          console.info("[VideoSnippets] audio load mode:", "element");
          console.info("[VideoSnippets] fallback HTMLAudioElement loaded:", audio.duration || metadataDuration || 0);
          return null;
        } catch (fallbackError) {
          if (loadRequestIdRef.current !== requestId) return null;
          console.warn("[VideoSnippets] fallback HTMLAudioElement failed:", fallbackError);
          resolvedBufferRef.current = null;
          setResolvedAudioBuffer(null);
          setDurationSeconds(0);
          setIsReady(false);
          loadedModeRef.current = "unsupported";
          setAudioMode("unsupported");
          setAnalysis(defaultSnippetAnalysis);
          setAnalysisStatus("Файл не поддерживается браузером");
          return null;
        }
      }
    };

    const promise = run().finally(() => {
      if (loadRequestIdRef.current === requestId) {
        loadPromiseRef.current = null;
        loadSignatureRef.current = null;
      }
    });
    loadPromiseRef.current = promise;
    return promise;
  }, [analyzeBuffer, audioBuffer, audioFile, audioUrl, clearPlaybackTimers, clearSource, ensureEngine]);

  const play = React.useCallback(async (options?: { fromTime?: number; durationSeconds?: number }) => {
    const engine = await ensureEngine();
    if (!engine) return;

    const loadResult = resolvedBufferRef.current ?? (await loadAudio());
    const playbackMode = loadedModeRef.current;
    if (!isSupportedAudioMode(playbackMode)) return;

    if (engine.context.state === "suspended") {
      await engine.context.resume();
    }

    const loadedDuration = getLoadedDuration();
    const effectiveSegment = getEffectiveSegment({
      audioDuration: loadedDuration,
      startTime: options?.fromTime ?? currentTimeRef.current,
      requestedDuration: options?.durationSeconds && options.durationSeconds > 0
        ? options.durationSeconds
        : Math.max(0.01, loadedDuration)
    });
    const target = effectiveSegment.startTime;
    const stopAt = effectiveSegment.endTime;

    stopCurrentPlayback();

    const token = sourceTokenRef.current;
    activeSegmentDurationRef.current = effectiveSegment.durationSeconds;

    if (playbackMode === "buffer") {
      const buffer = loadResult;
      if (!(buffer instanceof AudioBuffer)) return;
      const source = engine.context.createBufferSource();
      source.buffer = buffer;
      source.connect(engine.analyser);
      source.connect(engine.gainNode);
      source.onended = () => {
        const live = sourceRef.current;
        if (!live || live.token !== token || live.kind !== "buffer") return;
        sourceRef.current = null;
        activeSegmentDurationRef.current = null;
        applyCurrentTime(stopAt);
        updatePlaybackState(false);
        setAnalysisStatus("Предпросмотр завершён");
      };
      source.start(0, target, Math.max(0.01, effectiveSegment.durationSeconds));
      sourceRef.current = {
        kind: "buffer",
        node: source,
        startedAt: engine.context.currentTime,
        offset: target,
        stopAt,
        token
      };
      applyCurrentTime(target);
      updatePlaybackState(true);
      setAnalysisStatus("Предпросмотр запущен");
      return;
    }

    const audio = audioElementRef.current;
    if (!audio) return;
    audio.muted = false;
    try {
      audio.currentTime = target;
    } catch {}
    const handleEnd = () => {
      const live = sourceRef.current;
      if (!live || live.token !== token || live.kind !== "element") return;
      sourceRef.current = null;
      activeSegmentDurationRef.current = null;
      clearPlaybackTimers();
      applyCurrentTime(stopAt);
      updatePlaybackState(false);
      setAnalysisStatus("Предпросмотр завершён");
    };
    audio.onended = handleEnd;
    const nextSource: ElementSourceState = {
      kind: "element",
      element: audio,
      offset: target,
      stopAt,
      token
    };
    sourceRef.current = nextSource;
    stopTimerRef.current = window.setTimeout(() => {
      const live = sourceRef.current;
      if (!live || live.token !== token || live.kind !== "element") return;
      audio.pause();
      sourceRef.current = null;
      activeSegmentDurationRef.current = null;
      applyCurrentTime(stopAt);
      updatePlaybackState(false);
      setAnalysisStatus("Предпросмотр завершён");
    }, Math.max(0.01, effectiveSegment.durationSeconds) * 1000);
    try {
      await audio.play();
      applyCurrentTime(target);
      updatePlaybackState(true);
      setAnalysisStatus("Предпросмотр запущен");
      return;
    } catch (error) {
      console.warn("[VideoSnippets] HTMLAudioElement play failed:", error);
      audio.onended = null;
      clearPlaybackTimers();
      activeSegmentDurationRef.current = null;
      sourceRef.current = null;
      updatePlaybackState(false);
      setAnalysisStatus("Не удалось запустить воспроизведение");
    }
  }, [applyCurrentTime, clearPlaybackTimers, ensureEngine, getLoadedDuration, loadAudio, stopCurrentPlayback, updatePlaybackState]);

  const pause = React.useCallback(async () => {
    if (!sourceRef.current) return;
    clearSource(getPlaybackTime(), "Предпросмотр на паузе", false);
  }, [clearSource, getPlaybackTime]);

  const stop = React.useCallback(async () => {
    const totalDuration = getLoadedDuration();
    clearSource(clamp(startOffset, 0, Math.max(0, totalDuration - 0.01)), "Предпросмотр остановлен", false, {
      seekElementTo: clamp(startOffset, 0, Math.max(0, totalDuration - 0.01))
    });
  }, [clearSource, getLoadedDuration, startOffset]);

  const seek = React.useCallback(async (seconds: number) => {
    const totalDuration = getLoadedDuration();
    const target = clamp(seconds, 0, Math.max(0, totalDuration - 0.01));
    if (sourceRef.current && activeSegmentDurationRef.current) {
      await play({ fromTime: target, durationSeconds: activeSegmentDurationRef.current });
      return;
    }
    applyCurrentTime(target);
    if (analysisRef.current) {
      analysisRef.current = { ...analysisRef.current, currentTime: target };
    }
  }, [applyCurrentTime, getLoadedDuration, play]);

  const getAudioStream = React.useCallback(async () => {
    const engine = await ensureEngine();
    return engine?.destination.stream ?? null;
  }, [ensureEngine]);

  React.useEffect(() => {
    void loadAudio();
  }, [loadAudio]);

  React.useEffect(() => {
    if (!audioUrl && !audioFile && !audioBuffer) {
      disposeEngine();
      applyCurrentTime(0);
      setIsPlaying(false);
      setResolvedAudioBuffer(null);
      setAnalysis(defaultSnippetAnalysis);
      setAnalysisStatus("Аудио не загружено");
      setAudioMode("unsupported");
      setIsReady(false);
    }
  }, [applyCurrentTime, audioBuffer, audioFile, audioUrl, disposeEngine]);

  React.useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    let active = true;

    const frame = async () => {
      const engine = await ensureEngine();
      if (!active || !engine || !playbackActiveRef.current) return;

      const analyser = engine.analyser;
      const frequencyData = analysisRef.current?.frequencyData ?? new Uint8Array(analyser.frequencyBinCount);
      const waveformData = analysisRef.current?.waveformData ?? new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencyData);
      analyser.getByteTimeDomainData(waveformData);

      const duration = getLoadedDuration();
      const time = clamp(getPlaybackTime(), 0, duration || Number.MAX_SAFE_INTEGER);

      analysisRef.current = {
        currentTime: time,
        duration,
        frequencyData,
        waveformData,
        isPlaying: playbackActiveRef.current
      };

      if (Math.abs(time - currentTimeRef.current) > 0.03 && performance.now() - lastUiSyncRef.current > 48) {
        lastUiSyncRef.current = performance.now();
        applyCurrentTime(time);
      }

      rafRef.current = window.requestAnimationFrame(() => {
        void frame();
      });
    };

    rafRef.current = window.requestAnimationFrame(() => {
      void frame();
    });

    return () => {
      active = false;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [applyCurrentTime, ensureEngine, getLoadedDuration, getPlaybackTime, isPlaying]);

  React.useEffect(() => {
    if (!autoDetectEnabled) return;
    if (currentTime > durationSeconds && durationSeconds > 0) {
      applyCurrentTime(0);
    }
  }, [applyCurrentTime, autoDetectEnabled, currentTime, durationSeconds]);

  React.useEffect(() => {
    return () => {
      disposeEngine();
    };
  }, [disposeEngine]);

  return {
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
    getAudioStream,
    refreshAnalysis: loadAudio
  };
}
