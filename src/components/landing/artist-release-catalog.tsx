"use client";

import Image from "next/image";
import * as React from "react";
import {
  Disc3,
  Headphones,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Trophy,
  Volume2,
  X
} from "lucide-react";

import type { PublicArtistRelease } from "@/lib/artist-profile-service";
import { ReleaseSearchControl } from "@/components/landing/release-search-control";

function formatReleaseDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

const AUDIO_BOOT_TIMEOUT_MS = 2500;
const AUDIO_EXTENSION_PRIORITY = ["mp3", "m4a", "aac", "wav", "flac", "aiff"] as const;

function getAudioCandidatePriority(url: string): number {
  if (url.includes("/previews/")) return -1;
  const cleanUrl = url.split("?")[0]?.split("#")[0] ?? url;
  const extension = cleanUrl.split(".").at(-1)?.toLowerCase() ?? "";
  const index = AUDIO_EXTENSION_PRIORITY.indexOf(extension as (typeof AUDIO_EXTENSION_PRIORITY)[number]);
  return index >= 0 ? index : AUDIO_EXTENSION_PRIORITY.length;
}

function getAudioCandidates(release: PublicArtistRelease): string[] {
  return Array.from(
    new Set(
      [release.audioUrl, ...(release.audioUrlCandidates ?? [])]
        .filter((url): url is string => Boolean(url))
    )
  ).sort((left, right) => getAudioCandidatePriority(left) - getAudioCandidatePriority(right));
}

function ReleaseCover({ release, sizes }: { release: PublicArtistRelease; sizes: string }) {
  const candidates = React.useMemo(() => Array.from(new Set(
    [release.coverUrl, ...(release.coverUrlCandidates ?? [])]
      .filter((url): url is string => Boolean(url))
  )), [release.coverUrl, release.coverUrlCandidates]);
  const [failedUrls, setFailedUrls] = React.useState<string[]>([]);
  const currentUrl = candidates.find((url) => !failedUrls.includes(url)) ?? null;

  return currentUrl ? (
    <Image
      key={currentUrl}
      src={currentUrl}
      alt={`Обложка ${release.title}`}
      fill
      sizes={sizes}
      className="object-cover"
      loader={({ src }) => src}
      unoptimized
      onError={() => setFailedUrls((current) => current.includes(currentUrl)
        ? current
        : [...current, currentUrl])}
    />
  ) : (
    <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_50%_35%,rgba(123,97,255,0.22),transparent_55%)]">
      <Disc3 className="h-14 w-14 text-white/20" />
    </div>
  );
}

type ArtistReleaseCatalogProps = {
  releases: PublicArtistRelease[];
  commentCounts?: Record<string, number>;
  commentReleaseId?: string | null;
  onCommentRelease?: (releaseId: string | null) => void;
  renderCommentPanel?: (releaseId: string) => React.ReactNode;
};

export function ArtistReleaseCatalog({ releases }: ArtistReleaseCatalogProps) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const audioCandidatesRef = React.useRef<string[]>([]);
  const audioCandidateIndexRef = React.useRef(0);
  const audioLoadTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldPlayRef = React.useRef(false);
  const registeredReleaseIds = React.useRef(new Set<string>());
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [activeAudioUrl, setActiveAudioUrl] = React.useState<string | null>(null);
  const [detailsId, setDetailsId] = React.useState<string | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolume] = React.useState(0.85);
  const [playCounts, setPlayCounts] = React.useState(() =>
    Object.fromEntries(releases.map((release) => [release.id, release.playCount]))
  );

  const activeRelease = releases.find((release) => release.id === activeId) ?? null;
  const detailsRelease = releases.find((release) => release.id === detailsId) ?? null;
  const activeIndex = activeRelease ? releases.findIndex((release) => release.id === activeRelease.id) : -1;
  const progress = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  React.useEffect(() => {
    if (!detailsId) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailsId(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [detailsId]);

  React.useEffect(() => () => {
    if (audioLoadTimeoutRef.current) clearTimeout(audioLoadTimeoutRef.current);
  }, []);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
  }, [volume]);

  async function registerPlay(releaseId: string) {
    if (registeredReleaseIds.current.has(releaseId)) return;
    registeredReleaseIds.current.add(releaseId);
    const response = await fetch(`/api/scene/releases/${releaseId}/play`, { method: "POST" });
    const payload = await response.json().catch(() => null) as { count?: number } | null;
    if (response.ok && typeof payload?.count === "number") {
      setPlayCounts((current) => ({ ...current, [releaseId]: payload.count! }));
    }
  }

  function clearAudioLoadTimeout() {
    if (!audioLoadTimeoutRef.current) return;
    clearTimeout(audioLoadTimeoutRef.current);
    audioLoadTimeoutRef.current = null;
  }

  function resetAudioPlayer() {
    const audio = audioRef.current;
    clearAudioLoadTimeout();
    shouldPlayRef.current = false;
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setActiveId(null);
    setActiveAudioUrl(null);
    audioCandidatesRef.current = [];
    audioCandidateIndexRef.current = 0;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  }

  function failCurrentAudioCandidate() {
    clearAudioLoadTimeout();
    if (audioCandidatesRef.current.length === 0) return;
    const nextIndex = audioCandidateIndexRef.current + 1;
    if (nextIndex < audioCandidatesRef.current.length) {
      loadAudioCandidate(nextIndex, shouldPlayRef.current);
      return;
    }
    resetAudioPlayer();
  }

  function loadAudioCandidate(index: number, autoplay: boolean) {
    const audio = audioRef.current;
    const url = audioCandidatesRef.current[index];
    if (!audio || !url) return false;

    clearAudioLoadTimeout();
    audioCandidateIndexRef.current = index;
    setPlaying(false);
    setActiveAudioUrl(url);
    audio.src = url;
    audio.load();
    audioLoadTimeoutRef.current = setTimeout(() => {
      if (
        audioCandidateIndexRef.current === index &&
        audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
      ) {
        failCurrentAudioCandidate();
      }
    }, AUDIO_BOOT_TIMEOUT_MS);
    if (autoplay) {
      void audio.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        failCurrentAudioCandidate();
      });
    }
    return true;
  }

  function playRelease(release: PublicArtistRelease) {
    const candidates = getAudioCandidates(release);
    if (candidates.length === 0) {
      setDetailsId(release.id);
      return;
    }
    const audio = audioRef.current;
    if (activeId === release.id && audio) {
      if (audio.paused) {
        shouldPlayRef.current = true;
        void audio.play().catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          failCurrentAudioCandidate();
        });
      } else {
        shouldPlayRef.current = false;
        audio.pause();
      }
      return;
    }

    if (!audio) return;
    setActiveId(release.id);
    setCurrentTime(0);
    setDuration(0);
    audioCandidatesRef.current = candidates;
    shouldPlayRef.current = true;
    loadAudioCandidate(0, true);
  }

  function playRelative(offset: number) {
    if (releases.length === 0) return;
    const start = activeIndex >= 0 ? activeIndex : 0;
    for (let step = 1; step <= releases.length; step += 1) {
      const index = (start + offset * step + releases.length) % releases.length;
      if (releases[index] && getAudioCandidates(releases[index]!).length > 0) {
        playRelease(releases[index]!);
        return;
      }
    }
  }

  function seek(event: React.MouseEvent<HTMLButtonElement>) {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * duration;
  }

  return (
    <>
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {releases.map((release) => {
          const hasAudio = getAudioCandidates(release).length > 0;
          const isActive = activeId === release.id;
          return (
            <article
              key={release.id}
              className="ux-surface-soft group overflow-hidden rounded-[20px] transition duration-300 hover:-translate-y-1 hover:border-[#7b61ff]/45 hover:bg-white/[0.055]"
            >
              <div className="relative aspect-square overflow-hidden bg-white/[0.03]">
                <div className="absolute inset-0 transition duration-500 group-hover:scale-[1.03]">
                  <ReleaseCover release={release} sizes="(max-width: 768px) 90vw, 360px" />
                </div>
                {hasAudio ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/40">
                    <button
                      type="button"
                      onClick={() => playRelease(release)}
                      className="ux-button-primary flex h-12 w-12 scale-90 items-center justify-center rounded-full text-white opacity-0 shadow-[0_18px_50px_-16px_rgba(123,97,255,0.72)] transition duration-200 hover:scale-100 group-hover:scale-100 group-hover:opacity-100 focus-visible:scale-100 focus-visible:opacity-100"
                      aria-label={`${isActive && playing ? "Поставить на паузу" : "Слушать"} ${release.title}`}
                    >
                      {isActive && playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
                    </button>
                  </div>
                ) : null}
                {release.isTopRelease ? <span className="ux-pill absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-amber-200"><Trophy className="h-3 w-3" /> Топ-релиз</span> : null}
              </div>
              <div className="p-4">
                <button type="button" onClick={() => setDetailsId(release.id)} className="block w-full text-left focus-visible:outline-none">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-white/38"><span className="truncate">{release.genre}</span><span className="shrink-0">{formatReleaseDate(release.releaseDate)}</span></div>
                  <h3 className="mt-2 line-clamp-2 text-base font-bold text-white">{release.title}</h3>
                  <p className="mt-1.5 line-clamp-1 text-xs text-white/52">{release.artistNames.join(", ")}</p>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ReleaseSearchControl title={release.title} artist={release.artistNames.join(" ")} compact />
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onLoadedData={clearAudioLoadTimeout}
        onCanPlay={clearAudioLoadTimeout}
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlaying={() => {
          clearAudioLoadTimeout();
          setPlaying(true);
          if (activeRelease) void registerPlay(activeRelease.id);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setPlaying(false)}
        onStalled={failCurrentAudioCandidate}
        onEnded={() => {
          clearAudioLoadTimeout();
          setPlaying(false);
          shouldPlayRef.current = false;
          playRelative(1);
        }}
        onError={failCurrentAudioCandidate}
      />

      {detailsRelease ? (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/72 p-0 backdrop-blur-md sm:items-center sm:p-6" onMouseDown={() => setDetailsId(null)}>
          <article
            role="dialog"
            aria-modal="true"
            aria-label={`Релиз ${detailsRelease.title}`}
            className="ux-floating relative grid max-h-[92vh] w-full max-w-4xl overflow-auto rounded-t-[32px] sm:grid-cols-[0.88fr_1.12fr] sm:rounded-[36px]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" onClick={() => setDetailsId(null)} className="ux-control-compact absolute right-4 top-4 z-10 rounded-full p-2.5 text-white/75 transition hover:text-white" aria-label="Закрыть">
              <X className="h-5 w-5" />
            </button>
            <div className="relative aspect-square min-h-0 bg-white/[0.03] sm:aspect-auto sm:min-h-[520px]">
              <ReleaseCover release={detailsRelease} sizes="(max-width: 640px) 100vw, 420px" />
            </div>
            <div className="flex min-h-[420px] flex-col justify-between p-7 sm:p-10">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a99bff]">{detailsRelease.genre}</p>
                <h2 className="mt-5 text-balance text-4xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-5xl">{detailsRelease.title}</h2>
                <p className="mt-4 text-lg text-white/65">{detailsRelease.artistNames.join(", ")}</p>
                <p className="mt-5 text-sm text-white/46">Дата выхода: {formatReleaseDate(detailsRelease.releaseDate)}</p>
              </div>
              <div className="mt-10">
                {getAudioCandidates(detailsRelease).length > 0 ? (
                  <button type="button" onClick={() => playRelease(detailsRelease)} className="ux-button-primary inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold text-white">
                    {activeId === detailsRelease.id && playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {activeId === detailsRelease.id && playing ? "Пауза" : detailsRelease.audioSource === "track" ? "Слушать релиз" : "Слушать фрагмент"}
                  </button>
                ) : (
                  <p className="inline-flex items-center gap-2 text-sm text-white/42"><Headphones className="h-4 w-4" /> Фрагмент пока не добавлен</p>
                )}
                <p className="mt-4 text-xs text-white/38">{(playCounts[detailsRelease.id] ?? 0).toLocaleString("ru-RU")} прослушиваний</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <ReleaseSearchControl title={detailsRelease.title} artist={detailsRelease.artistNames.join(" ")} />
                </div>
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {activeRelease && activeAudioUrl ? (
        <div className="fixed inset-x-0 bottom-0 z-[110] border-t border-white/10 bg-[#090909]/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 text-white shadow-[0_-24px_70px_-36px_rgba(0,0,0,0.82)] backdrop-blur-2xl sm:px-6">
          <div className="mx-auto max-w-[1600px]">
            <div className="relative hidden h-10 overflow-hidden rounded-full border border-white/[0.06] bg-white/[0.03] px-4 sm:flex sm:items-center sm:justify-between">
              <span className="text-sm font-semibold tabular-nums text-white/76">{formatTime(currentTime)}</span>
              <span className="text-sm font-semibold tabular-nums text-white/76">{formatTime(duration)}</span>
            </div>

            <div className="mt-3 grid items-center gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)_auto_auto]">
              <button type="button" onClick={() => setDetailsId(activeRelease.id)} className="flex min-w-0 items-center gap-3 text-left">
                <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[18px] border border-white/[0.08] bg-[#151515]">
                <ReleaseCover release={activeRelease} sizes="44px" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-semibold tracking-[-0.02em] text-white">{activeRelease.title}</span>
                  <span className="mt-1 block truncate text-sm text-white/58">{activeRelease.artistNames.join(", ")}</span>
                </span>
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => playRelease(activeRelease)}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white transition hover:bg-white/[0.05]"
                    aria-label={playing ? "Пауза" : "Воспроизвести"}
                  >
                    {playing ? <Pause className="h-7 w-7" /> : <Play className="ml-1 h-7 w-7" />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(duration, 1)}
                    step={0.1}
                    value={Math.min(currentTime, duration || 0)}
                    style={{ ["--feed-fill" as never]: `${progress * 100}%` }}
                    onChange={(event) => {
                      const audio = audioRef.current;
                      if (!audio) return;
                      audio.currentTime = Number(event.target.value);
                    }}
                    className="feed-audio-range h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/12"
                    aria-label="Перемотка"
                  />
                </div>
                <button type="button" onClick={seek} className="sr-only" aria-label="Перемотать фрагмент" />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => playRelative(-1)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/68 transition hover:bg-white/[0.06] hover:text-white" aria-label="Предыдущий релиз"><SkipBack className="h-5 w-5" /></button>
                <button type="button" onClick={() => playRelative(1)} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/68 transition hover:bg-white/[0.06] hover:text-white" aria-label="Следующий релиз"><SkipForward className="h-5 w-5" /></button>
                <button type="button" onClick={resetAudioPlayer} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/68 transition hover:bg-white/[0.06] hover:text-white" aria-label="Закрыть плеер"><X className="h-5 w-5" /></button>
              </div>

              <div className="flex items-center justify-end gap-3">
                <Volume2 className="h-[18px] w-[18px] shrink-0 text-white/68" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  style={{ ["--feed-fill" as never]: `${volume * 100}%` }}
                  onChange={(event) => setVolume(Number(event.target.value))}
                  className="feed-audio-range hidden h-1.5 w-[120px] cursor-pointer appearance-none rounded-full bg-white/12 sm:block"
                  aria-label="Громкость"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
