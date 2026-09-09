"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Disc3, Gem, ListMusic, Music2, Pause, Play, Repeat2, Search, Sparkles, Trophy, Zap } from "lucide-react";

import {
  getDailySceneRelease,
  getNextPlayableRelease,
  searchSceneReleases,
  getSimilarMoodReleases,
  getUnderratedSceneRelease,
  getWeeklySceneLeader
} from "@/lib/scene-discovery";
import type { SceneRelease } from "@/lib/scene-service";

interface SceneShowcaseProps {
  releases: SceneRelease[];
  compact?: boolean;
  initialReleaseId?: string;
}

const ALL_GENRES = "Все";
type Reaction = "playlist" | "hit" | "cover";
type ReactionSummary = {
  counts: Record<Reaction, number>;
  active: Reaction[];
  weeklyScore: number;
  weeklyUniqueListeners: number;
  todayPlaylistCount: number;
};

const EMPTY_REACTION_SUMMARY: ReactionSummary = {
  counts: { playlist: 0, hit: 0, cover: 0 },
  active: [],
  weeklyScore: 0,
  weeklyUniqueListeners: 0,
  todayPlaylistCount: 0
};

const WAVEFORM_BARS = [32, 48, 66, 42, 74, 56, 88, 62, 46, 70, 92, 58, 78, 44, 64, 84, 54, 72, 38, 68, 86, 50, 76, 60, 90, 52, 70, 40];

function formatReleaseDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function parsePreviewStart(value: string): number {
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return 0;
}

function buildYandexMusicSearchUrl(release: SceneRelease): string {
  const query = encodeURIComponent(`${release.artist} ${release.title}`);
  return `https://music.yandex.ru/search?text=${query}`;
}

function buildVkMusicSearchUrl(release: SceneRelease): string {
  const query = encodeURIComponent(`${release.artist} ${release.title}`);
  return `https://vk.com/audio?q=${query}`;
}

function formatTodayActivity(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const noun = remainder100 >= 11 && remainder100 <= 14
    ? "слушателей поставили"
    : remainder10 === 1
      ? "слушатель поставил"
      : remainder10 >= 2 && remainder10 <= 4
        ? "слушателя поставили"
        : "слушателей поставили";
  return `${count} ${noun} на повтор сегодня`;
}

function AudioWaveform({ progress, playing }: { progress: number; playing: boolean }) {
  return (
    <div
      className="flex h-12 w-full items-center justify-between overflow-hidden rounded-xl border border-white/[0.08] bg-black/25 px-4"
      aria-hidden="true"
    >
      {WAVEFORM_BARS.map((height, index) => {
        const active = index / WAVEFORM_BARS.length <= progress;
        return (
          <span
            key={`${height}-${index}`}
            className={`w-1 min-w-1 rounded-full transition-all duration-200 ${active ? "bg-[#70e1b5]" : "bg-white/16"} ${playing && active ? "animate-pulse" : ""}`}
            style={{ height: `${height}%`, opacity: active ? 1 : 0.7 }}
          />
        );
      })}
    </div>
  );
}

function ReleaseSearchControl({
  release,
  open,
  onOpen
}: {
  release: SceneRelease;
  open: boolean;
  onOpen: () => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={false}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#7b61ff] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_12px_30px_-16px_rgba(123,97,255,0.8)] transition-all hover:-translate-y-0.5 hover:bg-[#6a4ff0] sm:w-[178px]"
      >
        <Search className="h-4 w-4" />
        Найти релиз
      </button>
    );
  }

  return (
    <div className="grid w-full max-w-sm gap-2 rounded-2xl border border-white/10 bg-black/25 p-2 sm:grid-cols-2">
      <a
        href={release.yandexMusicUrl ?? buildYandexMusicSearchUrl(release)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
      >
        <Image
          src="/landing/platforms/yandex-music.png"
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 rounded-md object-cover"
        />
        Яндекс Музыка
      </a>
      <a
        href={release.vkMusicUrl ?? buildVkMusicSearchUrl(release)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/[0.08]"
      >
        <Image
          src="/landing/platforms/vk-music.png"
          alt=""
          width={24}
          height={24}
          className="h-6 w-6 rounded-md object-cover"
        />
        VK Музыка
      </a>
    </div>
  );
}

function Cover({ release, priority = false }: { release: SceneRelease; priority?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_30%_20%,rgba(83,223,174,0.24),transparent_35%),linear-gradient(145deg,#19182b,#0c0d15)]">
      {release.coverUrl ? (
        <Image
          src={release.coverUrl}
          alt={`Обложка релиза ${release.title}`}
          fill
          priority={priority}
          sizes="(max-width: 768px) 88vw, 480px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Disc3 className="h-16 w-16 text-white/28" strokeWidth={1.2} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
    </div>
  );
}

export function SceneShowcase({ releases, compact = false, initialReleaseId }: SceneShowcaseProps) {
  const [genre, setGenre] = React.useState(ALL_GENRES);
  const [searchQuery, setSearchQuery] = React.useState("");
  const deferredSearchQuery = React.useDeferredValue(searchQuery);
  const [featuredId, setFeaturedId] = React.useState(
    releases.some((release) => release.id === initialReleaseId)
      ? initialReleaseId!
      : releases[0]?.id ?? ""
  );
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [audioFailed, setAudioFailed] = React.useState(false);
  const [isSearchChoiceOpen, setIsSearchChoiceOpen] = React.useState(false);
  const [previewProgress, setPreviewProgress] = React.useState(0);
  const [autoPlayReleaseId, setAutoPlayReleaseId] = React.useState<string | null>(null);
  const [reactionSummaries, setReactionSummaries] = React.useState<Record<string, ReactionSummary>>({});
  const [reacting, setReacting] = React.useState<Reaction | null>(null);
  const [listenedReleaseIds, setListenedReleaseIds] = React.useState<Set<string>>(() => new Set());
  const [reactionMessage, setReactionMessage] = React.useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const advancingRef = React.useRef(false);

  React.useEffect(() => {
    if (releases.length === 0) return;
    const controller = new AbortController();
    const ids = releases.map((release) => release.id).join(",");
    void fetch(`/api/scene/reactions?releaseIds=${encodeURIComponent(ids)}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<{ summaries?: Record<string, ReactionSummary> }>;
      })
      .then((payload) => {
        if (payload?.summaries) setReactionSummaries(payload.summaries);
      })
      .catch(() => null);
    return () => controller.abort();
  }, [releases]);

  const genres = [
    ALL_GENRES,
    ...Array.from(new Set(releases.map((release) => release.genre))).slice(0, 8)
  ];
  const genreReleases = genre === ALL_GENRES
    ? releases
    : releases.filter((release) => release.genre === genre);
  const filtered = searchSceneReleases(genreReleases, deferredSearchQuery);
  const hasSearchQuery = deferredSearchQuery.trim().length > 0;
  const featured = filtered.find((release) => release.id === featuredId) ?? filtered[0] ?? null;
  const visibleCards = filtered.filter((release) => release.id !== featured?.id).slice(0, compact ? 5 : 11);
  const weeklyLeader = getWeeklySceneLeader(releases, reactionSummaries);
  const weeklyLeaderId = weeklyLeader?.id ?? null;
  const weeklyLeaderSummary = weeklyLeader
    ? reactionSummaries[weeklyLeader.id] ?? EMPTY_REACTION_SUMMARY
    : EMPTY_REACTION_SUMMARY;
  const featuredSummary = featured ? reactionSummaries[featured.id] ?? EMPTY_REACTION_SUMMARY : EMPTY_REACTION_SUMMARY;
  const openingOfTheDay = getDailySceneRelease(releases);
  const underratedRelease = getUnderratedSceneRelease(
    releases,
    reactionSummaries,
    [openingOfTheDay?.id ?? "", weeklyLeaderId ?? ""]
  );
  const similarReleases = featured
    ? getSimilarMoodReleases(releases, featured.id, 3)
    : [];
  const nextInQueue = featured ? getNextPlayableRelease(filtered, featured.id) : null;

  React.useEffect(() => {
    if (!featured || autoPlayReleaseId !== featured.id) return;
    const timeout = window.setTimeout(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const previewStart = parsePreviewStart(featured.previewStart);
      audio.currentTime = previewStart;
      void audio.play()
        .then(() => {
          setIsPlaying(true);
          setListenedReleaseIds((current) => new Set(current).add(featured.id));
        })
        .catch(() => setAudioFailed(true))
        .finally(() => {
          setAutoPlayReleaseId(null);
          advancingRef.current = false;
        });
    }, 80);
    return () => window.clearTimeout(timeout);
  }, [autoPlayReleaseId, featured]);

  function selectRelease(releaseId: string, autoPlay = false) {
    audioRef.current?.pause();
    setIsPlaying(false);
    setAudioFailed(false);
    setPreviewProgress(0);
    setIsSearchChoiceOpen(false);
    setReactionMessage(null);
    setAutoPlayReleaseId(autoPlay ? releaseId : null);
    advancingRef.current = autoPlay;
    setFeaturedId(releaseId);
  }

  function selectGenre(nextGenre: string) {
    audioRef.current?.pause();
    setIsPlaying(false);
    setAudioFailed(false);
    setPreviewProgress(0);
    setAutoPlayReleaseId(null);
    setIsSearchChoiceOpen(false);
    setReactionMessage(null);
    setGenre(nextGenre);
  }

  function updateSearchQuery(nextQuery: string) {
    audioRef.current?.pause();
    setIsPlaying(false);
    setAudioFailed(false);
    setPreviewProgress(0);
    setAutoPlayReleaseId(null);
    setIsSearchChoiceOpen(false);
    setReactionMessage(null);
    if (nextQuery.trim()) setGenre(ALL_GENRES);
    setSearchQuery(nextQuery);
  }

  function advanceQueue() {
    if (!featured || advancingRef.current) return;
    const nextRelease = getNextPlayableRelease(filtered, featured.id);
    setIsPlaying(false);
    setPreviewProgress(0);
    if (!nextRelease) return;
    advancingRef.current = true;
    selectRelease(nextRelease.id, true);
  }

  async function togglePreview() {
    const audio = audioRef.current;
    if (!audio || !featured?.audioUrl) return;

    if (!audio.paused) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    const previewStart = parsePreviewStart(featured.previewStart);
    if (audio.currentTime < previewStart || audio.currentTime >= previewStart + 30) {
      audio.currentTime = previewStart;
    }

    try {
      await audio.play();
      setIsPlaying(true);
      setListenedReleaseIds((current) => new Set(current).add(featured.id));
    } catch {
      setIsPlaying(false);
      setAudioFailed(true);
    }
  }

  async function toggleReaction(reaction: Reaction) {
    if (!featured || reacting) return;
    setReacting(reaction);
    setReactionMessage(null);
    try {
      const response = await fetch(`/api/scene/releases/${featured.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reaction })
      });
      const payload = await response.json().catch(() => null) as {
        active?: boolean;
        summary?: ReactionSummary;
        error?: string;
      } | null;
      if (!response.ok || !payload?.summary) throw new Error(payload?.error || "Не удалось сохранить реакцию.");
      setReactionSummaries((current) => ({ ...current, [featured.id]: payload.summary! }));
      if (payload.active) setReactionMessage("Голос учтён. Релиз участвует в выборе слушателей недели.");
    } catch (reactionError) {
      setReactionMessage(reactionError instanceof Error ? reactionError.message : "Не удалось сохранить реакцию.");
    } finally {
      setReacting(null);
    }
  }

  if (releases.length === 0) {
    return (
      <div className="rounded-[32px] border border-white/[0.08] bg-white/[0.025] px-6 py-16 text-center">
        <Music2 className="mx-auto h-9 w-9 text-[#70e1b5]" strokeWidth={1.5} />
        <p className="mt-5 text-lg font-semibold text-white">Витрина готовится к первому релизу</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/50">
          Здесь появятся одобренные релизы артистов ICECREAMMUSIC.
        </p>
      </div>
    );
  }

  return (
    <div>
      {!hasSearchQuery && weeklyLeader && weeklyLeaderSummary.weeklyScore > 0 ? (
        <button
          type="button"
          onClick={() => {
            setGenre(ALL_GENRES);
            selectRelease(weeklyLeader.id);
          }}
          className="group mb-5 grid w-full overflow-hidden rounded-[26px] border border-amber-300/20 bg-[radial-gradient(circle_at_12%_20%,rgba(251,191,36,0.13),transparent_36%),linear-gradient(120deg,rgba(26,27,38,0.98),rgba(12,14,21,0.98))] text-left shadow-[0_24px_80px_-50px_rgba(251,191,36,0.55)] transition hover:-translate-y-0.5 hover:border-amber-300/35 sm:grid-cols-[112px_1fr_auto] sm:items-center"
        >
          <div className="relative aspect-[16/9] overflow-hidden sm:aspect-square sm:h-28 sm:w-28">
            <Cover release={weeklyLeader} />
          </div>
          <div className="min-w-0 px-5 py-4 sm:py-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
              <Trophy className="h-3.5 w-3.5" /> Выбор слушателей недели
            </span>
            <p className="mt-2 truncate text-xl font-bold tracking-[-0.02em] text-white">
              {weeklyLeader.title}
            </p>
            <p className="mt-1 truncate text-sm text-white/52">{weeklyLeader.artist}</p>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-white/[0.07] px-5 py-4 sm:block sm:border-l sm:border-t-0 sm:px-6 sm:text-right">
            <div>
              <p className="text-2xl font-bold text-white">{weeklyLeaderSummary.weeklyScore}</p>
              <p className="text-[11px] text-white/42">голосов за 7 дней</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-100/80 transition group-hover:text-amber-100 sm:mt-3">
              Открыть релиз <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </button>
      ) : null}

      {!compact ? (
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#70e1b5]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => updateSearchQuery(event.target.value)}
            placeholder="Найти артиста или релиз"
            aria-label="Поиск артистов и релизов"
            className="h-[52px] w-full rounded-2xl border border-white/10 bg-white/[0.035] py-3.5 pl-12 pr-4 text-sm text-white outline-none transition placeholder:text-white/32 focus:border-[#7b61ff]/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-[#7b61ff]/10"
          />
        </div>
      ) : null}

      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {genres.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => selectGenre(item)}
            className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition-colors ${
              genre === item
                ? "border-[#62dcae]/45 bg-[#62dcae]/12 text-[#90f2cd]"
                : "border-white/10 bg-white/[0.025] text-white/55 hover:border-white/20 hover:text-white"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {!compact && !hasSearchQuery && (openingOfTheDay || underratedRelease) ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {openingOfTheDay ? (
            <button
              type="button"
              onClick={() => {
                setGenre(ALL_GENRES);
                selectRelease(openingOfTheDay.id);
              }}
              className="group flex min-w-0 items-center gap-4 overflow-hidden rounded-[22px] border border-[#7b61ff]/20 bg-[linear-gradient(120deg,rgba(123,97,255,0.12),rgba(255,255,255,0.025))] p-3 text-left transition hover:-translate-y-0.5 hover:border-[#7b61ff]/40"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                <Cover release={openingOfTheDay} />
              </div>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#a99bff]">
                  <CalendarDays className="h-3.5 w-3.5" /> Открытие дня
                </span>
                <p className="mt-2 truncate text-base font-bold text-white">{openingOfTheDay.title}</p>
                <p className="mt-1 truncate text-xs text-white/45">{openingOfTheDay.artist}</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-white/25 transition group-hover:translate-x-1 group-hover:text-white/70" />
            </button>
          ) : null}
          {underratedRelease ? (
            <button
              type="button"
              onClick={() => {
                setGenre(ALL_GENRES);
                selectRelease(underratedRelease.id);
              }}
              className="group flex min-w-0 items-center gap-4 overflow-hidden rounded-[22px] border border-cyan-300/15 bg-[linear-gradient(120deg,rgba(34,211,238,0.08),rgba(255,255,255,0.025))] p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/30"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl">
                <Cover release={underratedRelease} />
              </div>
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/80">
                  <Gem className="h-3.5 w-3.5" /> Недооценённый релиз
                </span>
                <p className="mt-2 truncate text-base font-bold text-white">{underratedRelease.title}</p>
                <p className="mt-1 truncate text-xs text-white/45">Стоит услышать раньше остальных</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-white/25 transition group-hover:translate-x-1 group-hover:text-white/70" />
            </button>
          ) : null}
        </div>
      ) : null}

      {featured ? (
        <div className="mt-6 grid overflow-hidden rounded-[34px] border border-white/[0.09] bg-[linear-gradient(135deg,rgba(24,26,37,0.96),rgba(10,12,18,0.96))] shadow-[0_34px_110px_-58px_rgba(83,223,174,0.38)] lg:min-h-[590px] lg:grid-cols-[0.82fr_1.18fr]">
          <div className="relative aspect-square min-h-[280px] lg:aspect-auto lg:min-h-[590px]">
            <Cover release={featured} priority />
          </div>
          <div className="flex flex-col justify-between p-6 sm:p-9 lg:p-12">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[#62dcae]/30 bg-[#62dcae]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#8cebc7]">
                  Новый релиз
                </span>
                <span className="text-xs text-white/38">{formatReleaseDate(featured.releaseDate)}</span>
                {weeklyLeaderId === featured.id && featuredSummary.weeklyScore > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200">
                    <Trophy className="h-3 w-3" /> Выбор слушателей недели
                  </span>
                ) : null}
              </div>
              <h3 className="mt-7 text-balance text-[36px] font-bold leading-[0.98] tracking-[-0.04em] text-white sm:text-[48px] lg:text-[62px]">
                {featured.title}
              </h3>
              {featured.artistSlug ? (
                <Link
                  href={`/artists/${featured.artistSlug}`}
                  className="mt-4 inline-flex text-lg font-medium text-white/62 transition-colors hover:text-[#a99bff] sm:text-xl"
                >
                  {featured.artist}
                </Link>
              ) : (
                <p className="mt-4 text-lg font-medium text-white/62 sm:text-xl">{featured.artist}</p>
              )}
              <div className="mt-7 flex flex-wrap gap-2 text-xs text-white/48">
                <span className="rounded-full border border-white/10 px-3 py-1.5">{featured.genre}</span>
              </div>
            </div>
            {featured.audioUrl && !audioFailed ? (
              <div className="mt-10 grid w-full max-w-[410px] gap-4 align-top">
                <div className="flex flex-wrap items-center gap-3">
                <audio
                  ref={audioRef}
                  key={featured.id}
                  src={featured.audioUrl}
                  preload="metadata"
                  onEnded={advanceQueue}
                  onPause={() => setIsPlaying(false)}
                  onError={() => {
                    setIsPlaying(false);
                    setAudioFailed(true);
                  }}
                  onTimeUpdate={(event) => {
                    const start = parsePreviewStart(featured.previewStart);
                    const elapsed = Math.max(0, event.currentTarget.currentTime - start);
                    setPreviewProgress(Math.min(elapsed / 30, 1));
                    if (event.currentTarget.currentTime >= start + 30) {
                      event.currentTarget.pause();
                      event.currentTarget.currentTime = start;
                      advanceQueue();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={togglePreview}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#7b61ff] px-6 py-3.5 text-sm font-bold text-white shadow-[0_12px_30px_-16px_rgba(123,97,255,0.8)] transition-all hover:-translate-y-0.5 hover:bg-[#6a4ff0] sm:w-[220px]"
                >
                  {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {isPlaying ? "Пауза" : "Слушать фрагмент"}
                </button>
                <ReleaseSearchControl
                  release={featured}
                  open={isSearchChoiceOpen}
                  onOpen={() => setIsSearchChoiceOpen(true)}
                />
                </div>
                <div className="flex w-full flex-col gap-2">
                  <AudioWaveform progress={previewProgress} playing={isPlaying} />
                  {nextInQueue ? (
                    <div className="hidden items-center gap-2 px-1 text-xs text-white/42 sm:flex">
                      <ListMusic className="h-4 w-4 text-[#a99bff]" />
                      <span className="truncate">Далее: {nextInQueue.title}</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!listenedReleaseIds.has(featured.id) || reacting !== null}
                    onClick={() => void toggleReaction("playlist")}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${featuredSummary.active.includes("playlist") ? "border-rose-300/35 bg-rose-300/12 text-rose-100" : "border-white/12 bg-white/[0.04] text-white/72 hover:bg-white/[0.08]"}`}
                  >
                    <Repeat2 className="h-4 w-4" /> На повтор · {featuredSummary.counts.playlist}
                  </button>
                  <button
                    type="button"
                    disabled={!listenedReleaseIds.has(featured.id) || reacting !== null}
                    onClick={() => void toggleReaction("hit")}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${featuredSummary.active.includes("hit") ? "border-amber-300/35 bg-amber-300/12 text-amber-100" : "border-white/12 bg-white/[0.04] text-white/72 hover:bg-white/[0.08]"}`}
                  >
                    <Zap className="h-4 w-4" /> Это хит · {featuredSummary.counts.hit}
                  </button>
                </div>
                {featuredSummary.todayPlaylistCount > 0 ? (
                  <p className="text-xs font-medium text-[#8cebc7]/80">
                    {formatTodayActivity(featuredSummary.todayPlaylistCount)}
                  </p>
                ) : null}
                <p
                  aria-hidden={listenedReleaseIds.has(featured.id)}
                  className={`text-xs text-white/38 ${listenedReleaseIds.has(featured.id) ? "invisible" : ""}`}
                >
                  Реакции откроются после запуска фрагмента.
                </p>
              </div>
            ) : (
              <div className="mt-10 flex flex-col items-start gap-3">
                <p className="text-sm font-medium text-white/55">Фрагмента нет</p>
                <ReleaseSearchControl
                  release={featured}
                  open={isSearchChoiceOpen}
                  onOpen={() => setIsSearchChoiceOpen(true)}
                />
                <button
                  type="button"
                  disabled={reacting !== null}
                  onClick={() => void toggleReaction("cover")}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${featuredSummary.active.includes("cover") ? "border-cyan-300/35 bg-cyan-300/12 text-cyan-100" : "border-white/12 bg-white/[0.04] text-white/68 hover:bg-white/[0.08]"}`}
                >
                  <Sparkles className="h-4 w-4" /> Зацепила обложка · {featuredSummary.counts.cover}
                </button>
              </div>
            )}
            {reactionMessage ? (
              <div className="mt-4 rounded-xl border border-[#62dcae]/20 bg-[#62dcae]/[0.07] px-4 py-3 text-sm text-white/70">
                {reactionMessage} <Link href="/register" className="font-semibold text-[#8cebc7] hover:text-white">Выпустить свою музыку</Link>
              </div>
            ) : null}
          </div>
        </div>
      ) : hasSearchQuery ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-white/10 bg-white/[0.025] px-6 py-14 text-center">
          <Search className="mx-auto h-8 w-8 text-white/25" />
          <p className="mt-4 text-base font-semibold text-white">Ничего не найдено</p>
          <p className="mt-2 text-sm text-white/45">Проверьте имя артиста или название релиза.</p>
          <button
            type="button"
            onClick={() => updateSearchQuery("")}
            className="mt-5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] hover:text-white"
          >
            Сбросить поиск
          </button>
        </div>
      ) : null}

      {!compact && featured && listenedReleaseIds.has(featured.id) && similarReleases.length > 0 ? (
        <section className="mt-7 rounded-[28px] border border-white/[0.08] bg-white/[0.022] p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8cebc7]">Продолжить открытие</p>
              <h4 className="mt-2 text-xl font-bold tracking-[-0.02em] text-white">Похожее настроение</h4>
            </div>
            <p className="hidden text-xs text-white/35 sm:block">3 релиза после прослушивания</p>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {similarReleases.map((release, index) => (
              <button
                key={release.id}
                type="button"
                onClick={() => selectRelease(release.id, Boolean(release.audioUrl))}
                className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.08] bg-black/20 p-3 text-left transition hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.04]"
              >
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                  <Cover release={release} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{release.title}</p>
                  <p className="mt-1 truncate text-xs text-white/42">{release.artist}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/28">Далее · {index + 1}</p>
                </div>
                {release.audioUrl ? <Play className="ml-auto h-4 w-4 shrink-0 text-[#70e1b5]" /> : <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-white/25" />}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {visibleCards.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          {visibleCards.map((release) => (
            <button
              key={release.id}
              type="button"
              onClick={() => selectRelease(release.id)}
              className="group overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.025] text-left transition-all hover:-translate-y-1 hover:border-white/[0.16] hover:bg-white/[0.045]"
            >
              <div className="relative aspect-square">
                <Cover release={release} />
              </div>
              <div className="p-3.5">
                <div className="truncate text-sm font-semibold text-white">{release.title}</div>
                <div className="mt-1 truncate text-xs text-white/45">{release.artist}</div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

    </div>
  );
}
