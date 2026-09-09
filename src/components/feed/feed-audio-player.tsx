"use client";

import * as React from "react";
import { ExternalLink, Pause, Play, Volume2, X } from "lucide-react";

import { accumulateQualifiedPlayback, getQualifiedPlayThresholdSeconds } from "@/lib/qualified-play";

const WAVEFORM_BARS = [32, 48, 66, 42, 74, 56, 88, 62, 46, 70, 92, 58, 78, 44, 64, 84, 54, 72, 38, 68, 86, 50, 76, 60];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export type FeedAudioPlaybackCommand = {
  releaseId: string;
  action: "play" | "pause" | "toggle";
  nonce: number;
};

function WaveformMeter({
  progressFill,
  active,
  className = "",
  inactiveClassName = "bg-white/14",
  activeClassName = "bg-white/88"
}: {
  progressFill: number;
  active: boolean;
  className?: string;
  inactiveClassName?: string;
  activeClassName?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-1 overflow-hidden ${className}`}>
      {WAVEFORM_BARS.map((height, index) => {
        const filled = index / WAVEFORM_BARS.length <= progressFill / 100;
        return (
          <span
            key={`${height}-${index}`}
            className={`w-1 min-w-1 rounded-full transition-all duration-200 ${filled ? activeClassName : inactiveClassName} ${active && filled ? "animate-pulse" : ""}`}
            style={{ height: `${height}%`, opacity: filled ? 1 : 0.62 }}
          />
        );
      })}
    </div>
  );
}

function useFeedAudioPlayback({
  src,
  onLoadError,
  releaseId,
  onPlayCountChange,
  playbackCommand,
  onPlayingChange
}: {
  src: string;
  onLoadError?: () => void;
  releaseId?: string;
  onPlayCountChange?: (count: number) => void;
  playbackCommand?: FeedAudioPlaybackCommand | null;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const onLoadErrorRef = React.useRef(onLoadError);
  const releaseIdRef = React.useRef(releaseId);
  const onPlayCountChangeRef = React.useRef(onPlayCountChange);
  const onPlayingChangeRef = React.useRef(onPlayingChange);
  const trackedPlayRef = React.useRef<string | null>(null);
  const listenedSecondsRef = React.useRef(0);
  const previousMediaTimeRef = React.useRef<number | null>(null);
  const playbackCommandNonceRef = React.useRef<number | null>(null);
  const [ready, setReady] = React.useState(false);
  const [playing, setPlaying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [playRequested, setPlayRequested] = React.useState(false);
  const [duration, setDuration] = React.useState(0);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [volume, setVolume] = React.useState(0.85);
  const [muted, setMuted] = React.useState(false);
  const lastAudibleVolumeRef = React.useRef(0.85);

  React.useEffect(() => {
    onLoadErrorRef.current = onLoadError;
  }, [onLoadError]);

  React.useEffect(() => {
    releaseIdRef.current = releaseId;
    trackedPlayRef.current = null;
  }, [releaseId, src]);

  React.useEffect(() => {
    onPlayCountChangeRef.current = onPlayCountChange;
  }, [onPlayCountChange]);

  React.useEffect(() => {
    onPlayingChangeRef.current = onPlayingChange;
  }, [onPlayingChange]);

  const registerPlay = React.useCallback(async () => {
    const currentReleaseId = releaseIdRef.current;
    if (!currentReleaseId || trackedPlayRef.current === currentReleaseId) return;
    trackedPlayRef.current = currentReleaseId;
    try {
      const response = await fetch(`/api/scene/releases/${currentReleaseId}/play`, { method: "POST" });
      const payload = await response.json().catch(() => null) as { count?: number } | null;
      if (!response.ok) {
        trackedPlayRef.current = null;
        return;
      }
      if (typeof payload?.count === "number") {
        onPlayCountChangeRef.current?.(payload.count);
      }
    } catch {
      trackedPlayRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let frameId = 0;

    setReady(false);
    setPlaying(false);
    setFailed(false);
    setPlayRequested(false);
    setDuration(0);
    setCurrentTime(0);
    listenedSecondsRef.current = 0;
    previousMediaTimeRef.current = null;

    const syncReady = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setReady(audio.readyState >= 1);
    };
    const syncTime = () => {
      const nextMediaTime = audio.currentTime || 0;
      listenedSecondsRef.current = accumulateQualifiedPlayback({
        listenedSeconds: listenedSecondsRef.current,
        previousMediaTime: previousMediaTimeRef.current,
        currentMediaTime: nextMediaTime
      });
      previousMediaTimeRef.current = nextMediaTime;
      setCurrentTime(nextMediaTime);
      const threshold = getQualifiedPlayThresholdSeconds(audio.duration);
      if (threshold !== null && listenedSecondsRef.current >= threshold) {
        void registerPlay();
      }
    };
    const syncPause = () => {
      setPlaying(false);
      onPlayingChangeRef.current?.(false);
    };
    const syncPlay = () => {
      setPlaying(true);
      onPlayingChangeRef.current?.(true);
    };
    const handleError = () => {
      setPlaying(false);
      setReady(false);
      setFailed(true);
      setDuration(0);
      setCurrentTime(0);
      onPlayingChangeRef.current?.(false);
      onLoadErrorRef.current?.();
    };

    audio.addEventListener("timeupdate", syncTime);
    audio.addEventListener("loadedmetadata", syncReady);
    audio.addEventListener("loadeddata", syncReady);
    audio.addEventListener("canplay", syncReady);
    audio.addEventListener("durationchange", syncReady);
    audio.addEventListener("pause", syncPause);
    audio.addEventListener("play", syncPlay);
    audio.addEventListener("ended", syncPause);
    audio.addEventListener("error", handleError);
    syncReady();
    audio.load();
    frameId = window.requestAnimationFrame(syncReady);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      audio.pause();
      audio.removeEventListener("timeupdate", syncTime);
      audio.removeEventListener("loadedmetadata", syncReady);
      audio.removeEventListener("loadeddata", syncReady);
      audio.removeEventListener("canplay", syncReady);
      audio.removeEventListener("durationchange", syncReady);
      audio.removeEventListener("pause", syncPause);
      audio.removeEventListener("play", syncPlay);
      audio.removeEventListener("ended", syncPause);
      audio.removeEventListener("error", handleError);
    };
  }, [registerPlay, src]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  React.useEffect(() => {
    if (volume > 0) {
      lastAudibleVolumeRef.current = volume;
      if (muted) setMuted(false);
    }
  }, [muted, volume]);

  const toggle = React.useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (audio.paused) {
      setPlayRequested(true);
      await audio.play().catch(() => undefined);
    }
    else audio.pause();
  }, [failed]);

  const play = React.useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || failed) return;
    setPlayRequested(true);
    await audio.play().catch(() => undefined);
  }, [failed]);

  const pause = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  }, []);

  React.useEffect(() => {
    if (!playbackCommand || playbackCommand.releaseId !== releaseId || playbackCommandNonceRef.current === playbackCommand.nonce) return;
    playbackCommandNonceRef.current = playbackCommand.nonce;
    if (playbackCommand.action === "pause") {
      pause();
      return;
    }
    if (playbackCommand.action === "toggle") {
      void toggle();
      return;
    }
    void play();
  }, [pause, play, playbackCommand, releaseId, toggle]);

  function toggleMute() {
    if (muted || volume <= 0) {
      const restored = lastAudibleVolumeRef.current > 0 ? lastAudibleVolumeRef.current : 0.85;
      setVolume(restored);
      setMuted(false);
      return;
    }
      setMuted(true);
  }

  return {
    audioRef,
    ready,
    playing,
    failed,
    duration,
    currentTime,
    volume,
    muted,
    toggle,
    pause,
    toggleMute,
    setVolume,
    setCurrentTime,
    effectiveVolume: muted ? 0 : volume,
    progressValue: Math.min(currentTime, duration || 0),
    progressFill: duration > 0 ? Math.max(0, Math.min(100, (Math.min(currentTime, duration || 0) / duration) * 100)) : 0,
    showPreparing: playRequested && !ready && !failed
  };
}

export function FeedAudioPlayer({
  src,
  title,
  artist,
  compact = false,
  variant = "default",
  onLoadError,
  releaseId,
  onPlayCountChange
}: {
  src: string;
  title: string;
  artist?: string;
  compact?: boolean;
  variant?: "default" | "waveform";
  onLoadError?: () => void;
  releaseId?: string;
  onPlayCountChange?: (count: number) => void;
}) {
  const {
    audioRef,
    playing,
    failed,
    duration,
    currentTime,
    muted,
    volume,
    toggle,
    toggleMute,
    setCurrentTime,
    setVolume,
    effectiveVolume,
    progressValue,
    progressFill,
    showPreparing
  } = useFeedAudioPlayback({ src, onLoadError, releaseId, onPlayCountChange });
  const shellClass = compact
    ? "min-h-[84px] rounded-[22px] border border-white/[0.08] bg-[#161a29] px-4.5 py-3.5"
    : "rounded-[20px] border border-white/[0.08] bg-white/[0.035] p-3.5";
  const buttonClass = compact
    ? "h-[56px] w-[56px]"
    : "h-11 w-11";
  const volumeFill = Math.max(0, Math.min(100, effectiveVolume * 100));

  if (variant === "waveform") {
    return (
      <div
        className={`rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(23,27,42,0.96),rgba(17,20,33,0.94))] p-4 shadow-[0_20px_54px_-34px_rgba(7,11,25,0.92)] ${compact ? "min-h-[108px]" : ""}`}
        data-feed-audio-player={releaseId ?? title}
      >
        <audio ref={audioRef} preload="metadata" playsInline src={src} />
        <div className="grid gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              data-feed-audio-play="true"
              onClick={() => void toggle()}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(180deg,#8c6dff,#6f4cff)] text-white shadow-[0_18px_34px_-22px_rgba(123,97,255,0.9)] transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8adff]/60"
            >
              {playing ? <Pause className="h-4.5 w-4.5" /> : <Play className="ml-0.5 h-4.5 w-4.5" />}
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-white/94">{title}</p>
              {artist ? <p className="mt-0.5 truncate text-[12px] text-white/50">{artist}</p> : null}
            </div>
            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/56 transition hover:bg-white/[0.06] hover:text-white/82 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8adff]/40"
              aria-label={muted || volume <= 0 ? "Включить звук" : "Выключить звук"}
            >
              <Volume2 className="h-4 w-4" />
            </button>
          </div>

          <div className="relative overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/52">{formatTime(currentTime)}</span>
              <WaveformMeter progressFill={progressFill} active={playing} className="h-8 flex-1" />
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-white/52">{formatTime(duration)}</span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={progressValue}
            style={{ ["--feed-fill" as never]: `${progressFill}%` }}
            onChange={(event) => {
              const audio = audioRef.current;
              if (!audio) return;
              const value = Number(event.target.value);
              audio.currentTime = value;
              setCurrentTime(value);
            }}
            className="feed-audio-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/12"
            aria-label="Перемотка"
            data-feed-audio-progress="true"
          />

          {showPreparing ? <p className="text-[11px] text-white/42">Подготавливаем аудио…</p> : null}
          {failed ? <p className="text-[11px] text-rose-200/75">Аудио недоступно</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={shellClass} data-feed-audio-player={releaseId ?? title}>
      <audio ref={audioRef} preload="metadata" playsInline src={src} />
      <div className="grid min-w-0 items-center gap-3.5 [grid-template-columns:auto_132px_minmax(0,1fr)_auto_92px]">
        <button type="button" data-feed-audio-play="true" onClick={() => void toggle()} className={`flex shrink-0 items-center justify-center rounded-full bg-[#7b61ff] text-white transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8adff]/60 ${buttonClass}`}>
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>

        <div className="min-w-0">
          <p className={`truncate font-semibold tracking-[-0.01em] text-white/92 ${compact ? "text-[14px]" : "text-sm"}`}>{title}</p>
          <p className={`mt-1 font-medium tabular-nums text-white/60 ${compact ? "text-[11px]" : "text-[12px]"}`}>{formatTime(currentTime)} / {formatTime(duration)}</p>
        </div>

        <div className="min-w-0 flex-1">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={0.1}
            value={progressValue}
            style={{ ["--feed-fill" as never]: `${progressFill}%` }}
            onChange={(event) => {
              const audio = audioRef.current;
              if (!audio) return;
              const value = Number(event.target.value);
              audio.currentTime = value;
              setCurrentTime(value);
            }}
            className={`feed-audio-range w-full cursor-pointer appearance-none rounded-full bg-white/12 ${compact ? "h-1.5" : "h-1.5"}`}
            aria-label="Перемотка"
            data-feed-audio-progress="true"
          />
        </div>

        <button
          type="button"
          onClick={toggleMute}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center justify-self-center rounded-full text-white/58 transition hover:bg-white/[0.06] hover:text-white/86 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b8adff]/40"
          aria-label={muted || volume <= 0 ? "Включить звук" : "Выключить звук"}
          data-feed-audio-mute="true"
        >
          <Volume2 className="h-[15px] w-[15px]" />
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effectiveVolume}
          style={{ ["--feed-fill" as never]: `${volumeFill}%` }}
          onChange={(event) => setVolume(Number(event.target.value))}
          className="feed-audio-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/12"
          aria-label="Громкость"
          data-feed-audio-volume="true"
        />
      </div>
      {showPreparing && !compact ? <p className={`text-white/42 ${compact ? "mt-1 text-[10px]" : "mt-2 text-xs"}`}>Подготавливаем аудио…</p> : null}
      {failed ? <p className={`text-rose-200/75 ${compact ? "mt-1.5 text-[11px]" : "mt-2 text-xs"}`}>Аудио недоступно</p> : null}
    </div>
  );
}

export function FeedStickyReleasePlayer({
  src,
  title,
  artist,
  coverUrl,
  releaseId,
  playbackCommand,
  onClose,
  onOpenRelease,
  onOpenScene,
  onLoadError,
  onPlayCountChange,
  onPlayingChange
}: {
  src: string;
  title: string;
  artist: string;
  coverUrl?: string | null;
  releaseId: string;
  playbackCommand?: FeedAudioPlaybackCommand | null;
  onClose: () => void;
  onOpenRelease?: () => void;
  onOpenScene?: () => void;
  onLoadError?: () => void;
  onPlayCountChange?: (count: number) => void;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const {
    audioRef,
    playing,
    failed,
    duration,
    currentTime,
    toggle,
    pause,
    toggleMute,
    setVolume,
    effectiveVolume,
    progressValue,
    progressFill,
    showPreparing
  } = useFeedAudioPlayback({
    src,
    onLoadError,
    releaseId,
    onPlayCountChange,
    playbackCommand,
    onPlayingChange
  });
  const volumeFill = Math.max(0, Math.min(100, effectiveVolume * 100));

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#090909]/95 text-white shadow-[0_-24px_70px_-36px_rgba(0,0,0,0.82)] backdrop-blur-2xl">
      <audio ref={audioRef} preload="metadata" src={src} />
      <div className="relative mx-auto max-w-[1600px] px-4 pb-3 pt-2 sm:px-6">
        <div className="grid gap-3">
          <div className="relative hidden h-9 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.03] px-3 sm:flex sm:items-center sm:justify-between">
            <span className="text-sm font-semibold tabular-nums text-white/76">{formatTime(currentTime)}</span>
          <div className="absolute inset-x-[84px] top-1/2 flex -translate-y-1/2 items-center justify-between gap-1 overflow-hidden">
              <WaveformMeter progressFill={progressFill} active={playing} className="h-full w-full" />
            </div>
            <span className="text-sm font-semibold tabular-nums text-white/76">{formatTime(duration)}</span>
          </div>

          <div className="grid items-center gap-3 [grid-template-columns:auto_minmax(0,1fr)_auto] lg:[grid-template-columns:minmax(0,340px)_minmax(0,1fr)_auto_minmax(0,320px)]">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => void toggle()}
                className="relative h-[68px] w-[68px] shrink-0 overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151515]"
                aria-label={playing ? `Пауза ${title}` : `Слушать ${title}`}
              >
                {coverUrl ? <img src={coverUrl} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-white/[0.04] text-[10px] font-semibold uppercase tracking-[0.18em] text-white/38">Play</div>}
                <div className="absolute inset-0 flex items-center justify-center bg-black/28">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/48 text-white shadow-[0_12px_24px_-16px_rgba(0,0,0,0.8)]">
                    {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                  </span>
                </div>
              </button>

              <div className="min-w-0">
                <button type="button" onClick={() => void toggle()} className="block min-w-0 text-left">
                  <p className="truncate text-[17px] font-semibold tracking-[-0.02em] text-white">{title}</p>
                </button>
                <p className="mt-1 truncate text-sm text-white/58">{artist}</p>
                <div className="mt-2 sm:hidden">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(duration, 1)}
                    step={0.1}
                    value={progressValue}
                    style={{ ["--feed-fill" as never]: `${progressFill}%` }}
                    onChange={(event) => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      const value = Number(event.target.value);
                      audio.currentTime = value;
                    }}
                    className="feed-audio-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/12"
                    aria-label="Перемотка"
                  />
                </div>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-4 lg:flex">
              <button
                type="button"
                onClick={() => void toggle()}
                className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                aria-label={playing ? "Пауза" : "Слушать"}
              >
                {playing ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(duration, 1)}
                step={0.1}
                value={progressValue}
                style={{ ["--feed-fill" as never]: `${progressFill}%` }}
                onChange={(event) => {
                  const audio = audioRef.current;
                  if (!audio) return;
                  const value = Number(event.target.value);
                  audio.currentTime = value;
                }}
                className="feed-audio-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/12"
                aria-label="Перемотка"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={toggleMute}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/68 transition hover:bg-white/[0.06] hover:text-white"
                aria-label={effectiveVolume > 0 ? "Выключить звук" : "Включить звук"}
              >
                <Volume2 className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => {
                  pause();
                  onClose();
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white/68 transition hover:bg-white/[0.06] hover:text-white"
                aria-label="Закрыть плеер"
              >
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>

            <div className="hidden items-center justify-end gap-3 lg:flex">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={effectiveVolume}
                style={{ ["--feed-fill" as never]: `${volumeFill}%` }}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="feed-audio-range h-1.5 w-[96px] cursor-pointer appearance-none rounded-full bg-white/12"
                aria-label="Громкость"
              />
              {onOpenScene ? (
                <button type="button" onClick={onOpenScene} className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-4 text-sm font-medium text-white/78 transition hover:border-white/18 hover:bg-white/[0.05] hover:text-white">
                  Scene
                </button>
              ) : null}
              {onOpenRelease ? (
                <button type="button" onClick={onOpenRelease} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#1473ff] px-4 text-sm font-semibold text-white transition hover:bg-[#0f67ea]">
                  Open
                  <ExternalLink className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          {failed ? <p className="text-xs text-rose-200/78">Аудио недоступно</p> : null}
          {!failed && showPreparing ? <p className="text-xs text-white/44">Подготавливаем аудио…</p> : null}
        </div>
      </div>
    </div>
  );
}
