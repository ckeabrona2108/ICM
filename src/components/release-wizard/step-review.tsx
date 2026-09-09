"use client";

import * as React from "react";
import Image from "next/image";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  ImageIcon,
  Loader2,
  Pause,
  Play,
  XCircle
} from "lucide-react";

import { COUNTRIES } from "@/lib/countries";
import { buildCoverImageSrcCandidates } from "@/lib/image-src";
import { getReleasePlatformLabel } from "@/lib/release-platforms";
import { getTrackAuthorCoverage } from "@/lib/release-policy";
import { cn } from "@/lib/utils";

import { useWizard, type PersonRole, type TrackFile } from "./wizard-context";

const TYPE_LABEL = {
  single: "Single",
  ep: "EP",
  album: "Album"
} as const;

const KIND_LABEL = {
  standard: "Стандартный",
  single_maxi: "Single Maxi",
  mixtape: "Mixtape",
  audiobook: "Аудиокнига"
} as const;

type ReviewNavSection = "release_info" | "tracks" | "stores" | "pricing";
type ReviewStepIssueSection = "info" | "tracks" | "extras";
type SubmitPhase = "idle" | "saving" | "uploading" | "submitting";

const countryNameByCode = new Map(COUNTRIES.map((country) => [country.code, country.name]));

function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60)
    .toString()
    .padStart(2, "0");
  const s = String(safe % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function formatDate(value: string) {
  if (!value.trim()) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}.${month}.${year}`;
}

function resolveTrackAudioUrl(track: TrackFile): string | undefined {
  const directUrl = track.audioUrl?.trim();
  if (directUrl) return directUrl;
  const uploadedUrl = track.audioUpload?.url?.trim();
  if (uploadedUrl) return uploadedUrl;
  const key = track.audioUpload?.storageKey?.trim();
  if (!key) return undefined;
  const encoded = key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return encoded ? `/api/uploads/object/${encoded}` : undefined;
}

function TrackAudioPlayer({
  src,
  fallbackDurationSec
}: {
  src: string;
  fallbackDurationSec?: number;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [durationSec, setDurationSec] = React.useState(Math.max(0, fallbackDurationSec ?? 0));
  const [currentSec, setCurrentSec] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);

  const syncDuration = React.useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDurationSec(audio.duration);
    }
  }, []);

  const seekMax = Math.max(durationSec, currentSec, 0.01);
  const progress = seekMax > 0 ? Math.min(100, Math.max(0, (currentSec / seekMax) * 100)) : 0;

  return (
    <div className="rounded-[20px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,26,42,0.88),rgba(14,17,31,0.84))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-4">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onLoadedMetadata={syncDuration}
        onDurationChange={syncDuration}
        onTimeUpdate={() => setCurrentSec(audioRef.current?.currentTime ?? 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <div className="flex items-center gap-3.5">
        <button
          type="button"
          onClick={async () => {
            const audio = audioRef.current;
            if (!audio) return;
            if (audio.paused) {
              try {
                await audio.play();
              } catch {
                return;
              }
              return;
            }
            audio.pause();
          }}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--ux-accent)]/30 bg-[var(--ux-accent)]/15 text-[#ddceff] transition-colors hover:bg-[var(--ux-accent)]/25"
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <input
            type="range"
            min={0}
            max={seekMax}
            step={0.01}
            value={currentSec}
            onChange={(event) => {
              const next = Number(event.target.value);
              const audio = audioRef.current;
              if (!audio || !Number.isFinite(next)) return;
              audio.currentTime = next;
              setCurrentSec(next);
            }}
            className="icm-audio-slider h-5 w-full"
            style={
              {
                "--slider-progress": `${progress}%`
              } as React.CSSProperties
            }
            aria-label="Позиция воспроизведения"
          />
          <div className="flex items-center justify-between px-0.5 text-[11px] leading-none tabular-nums text-white/42">
            <span>{formatDuration(currentSec)}</span>
            <span>{formatDuration(seekMax)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StepReview({
  onSubmit,
  errors,
  blockingErrors,
  stepIssues,
  isSubmitting,
  submitPhase = "idle"
}: {
  onSubmit: () => void | Promise<void>;
  errors: string[];
  errorsBySection: Record<ReviewNavSection, string[]>;
  onJumpToSection: (section: ReviewNavSection) => void;
  blockingErrors: string[];
  stepIssues: Record<ReviewStepIssueSection, string[]>;
  isSubmitting: boolean;
  submitPhase?: SubmitPhase;
}) {
  const { data, set, setStep } = useWizard();
  const [coverCandidateIndex, setCoverCandidateIndex] = React.useState(0);
  const [openTrackId, setOpenTrackId] = React.useState<string | null>(data.tracks[0]?.id ?? null);
  const [showPlatforms, setShowPlatforms] = React.useState(false);
  const [showCountries, setShowCountries] = React.useState(false);
  const releaseSummaryRef = React.useRef<HTMLDivElement | null>(null);
  const trackListRef = React.useRef<HTMLDivElement | null>(null);
  const storesRef = React.useRef<HTMLDivElement | null>(null);
  const moderatorRef = React.useRef<HTMLDivElement | null>(null);

  const coverCandidates = React.useMemo(
    () => buildCoverImageSrcCandidates(data.cover),
    [data.cover]
  );
  const localCoverPreview =
    typeof data.cover === "string" &&
    (data.cover.startsWith("data:image/") || data.cover.startsWith("blob:"))
      ? data.cover
      : null;
  const safeCoverSrc = localCoverPreview ?? coverCandidates[coverCandidateIndex] ?? null;
  const showCoverLoadingState = Boolean(data.cover) && !safeCoverSrc;

  React.useEffect(() => {
    setCoverCandidateIndex(0);
  }, [data.cover, coverCandidates.length]);

  const reviewErrors = React.useMemo(
    () =>
      blockingErrors.length > 0
        ? [...new Set([...blockingErrors, ...errors])]
        : [...new Set(errors)],
    [blockingErrors, errors]
  );

  const selectedPlatformLabels = React.useMemo(
    () => data.platforms.map((code) => getReleasePlatformLabel(code)),
    [data.platforms]
  );
  const selectedCountryLabels = React.useMemo(
    () =>
      data.territoryCountries.map((code) => countryNameByCode.get(code) ?? code),
    [data.territoryCountries]
  );

  const territoriesSummary =
    data.territoryMode === "all"
      ? "Все страны"
      : data.territoryMode === "cis"
        ? "В СНГ"
        : data.territoryMode === "exclude"
          ? `Все страны кроме ${selectedCountryLabels.length}`
          : `${selectedCountryLabels.length} стран`;

  const platformsSummary =
    data.platformMode === "all" ? "Все площадки" : `${selectedPlatformLabels.length} площадок`;

  const peopleByRole = React.useMemo(() => groupPeopleByRole(data.persons), [data.persons]);
  const hasBlockingErrors = reviewErrors.length > 0;

  return (
    <div className="space-y-6">
      {reviewErrors.length > 0 ? (
        <div className="rounded-[22px] border border-rose-500/25 bg-rose-500/[0.08] p-4">
          <p className="text-[13px] font-semibold text-rose-200">
            Перед отправкой нужно исправить обязательные поля.
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] text-rose-100/90">
            {reviewErrors.map((error, index) => (
              <li key={`${error}-${index}`}>• {error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-6">
          <section ref={releaseSummaryRef} className="rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,21,34,0.96),rgba(11,14,25,0.98))] p-5 sm:p-6">
            <div className="grid gap-5 md:grid-cols-[160px_1fr]">
              <div className="relative aspect-square w-full max-w-[160px] overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#121521]">
                {safeCoverSrc ? (
                  <Image
                    src={safeCoverSrc}
                    alt="Обложка релиза"
                    fill
                    sizes="160px"
                    className="object-cover"
                    onError={() =>
                      setCoverCandidateIndex((prev) =>
                        prev + 1 < coverCandidates.length ? prev + 1 : coverCandidates.length
                      )
                    }
                  />
                ) : showCoverLoadingState ? (
                  <div className="grid h-full w-full place-items-center text-center text-white/52">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-[12px]">Подготавливаем превью…</span>
                    </div>
                  </div>
                ) : (
                  <div className="grid h-full w-full place-items-center text-center text-white/36">
                    <div className="flex flex-col items-center gap-2">
                      <ImageIcon className="h-6 w-6" />
                      <span className="text-[12px]">Обложка недоступна</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className={cn("text-[24px] font-semibold tracking-[-0.03em]", data.title ? "text-white" : "text-rose-300")}>
                      {data.title || "Не заполнено"}
                    </h3>
                    <p className="mt-2 text-[14px] text-white/58">
                      {data.subtitle.trim() || "Подзаголовок не указан"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Pill>{data.type ? TYPE_LABEL[data.type] : "Тип не выбран"}</Pill>
                      <Pill>{data.releaseKind ? KIND_LABEL[data.releaseKind] : "Вид не выбран"}</Pill>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <ReviewValue label="Тип релиза" value={data.type ? TYPE_LABEL[data.type] : ""} required onFix={() => setStep("intro")} />
                  <ReviewValue label="Вид релиза" value={data.releaseKind ? KIND_LABEL[data.releaseKind] : ""} required onFix={() => setStep("intro")} />
                  <ReviewValue label="Жанр" value={data.genre} required onFix={() => setStep("info")} />
                  <ReviewValue label="Поджанр" value={data.subgenre} optional />
                  <ReviewValue label="Язык метаданных" value={data.language} required onFix={() => setStep("info")} />
                  <ReviewValue label="Лейбл" value={data.label} required onFix={() => setStep("info")} />
                  <ReviewValue label="UPC" value={data.upc} optional />
                  <ReviewValue label="Код партнёра" value={data.partnerCode} optional />
                  <ReviewValue label="Год получения прав" value={data.rightsYear} required onFix={() => setStep("codes")} />
                  <ReviewValue label="Дата предзаказа" value={formatDate(data.preorderDate)} required onFix={() => setStep("codes")} />
                  <ReviewValue label="Дата старта" value={formatDate(data.startDate)} required onFix={() => setStep("codes")} />
                  <ReviewValue label="Дата релиза" value={formatDate(data.releaseDate)} required onFix={() => setStep("codes")} />
                  <ReviewValue label="Территории" value={territoriesSummary} required onFix={() => setStep("stores")} />
                  <ReviewValue label="Площадки" value={platformsSummary} required onFix={() => setStep("stores")} />
                </div>

                <div className="mt-6 border-t border-white/[0.08] pt-5">
                  <SectionTitle title="Персоны и роли" />
                  {data.persons.length === 0 ? (
                    <MissingInline onFix={() => setStep("persons")}>Персоны и роли не заполнены</MissingInline>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {peopleByRole.map((person) => (
                        <div key={person.id} className="rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                          <p className="text-[12.5px] font-medium text-white">{person.name || "—"}</p>
                          <p className="mt-0.5 text-[11px] text-white/48">{person.role || "Роль не указана"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section ref={trackListRef} className="rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,21,34,0.96),rgba(11,14,25,0.98))] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle title={`Трек-лист (${data.tracks.length})`} />
              <button
                type="button"
                onClick={() => setStep("tracks")}
                className="text-[12px] font-medium text-[#b8a8ff] transition hover:text-white"
              >
                Исправить
              </button>
            </div>

            {data.tracks.length === 0 ? (
              <MissingInline onFix={() => setStep("tracks")}>Треки не добавлены</MissingInline>
            ) : (
              <div className="mt-4 space-y-3">
                {data.tracks.map((track, index) => {
                  const title = track.meta.title.trim() || track.name;
                  const isOpen = openTrackId === track.id;
                  const audioUrl = track.hasAudio ? resolveTrackAudioUrl(track) : undefined;
                  const authorCoverage = getTrackAuthorCoverage(track.meta.trackPersons);
                  const authorsOk = authorCoverage.hasMusicAuthor && authorCoverage.hasLyricsAuthor;
                  const trackOk =
                    Boolean(track.meta.title.trim()) &&
                    Boolean(track.meta.metadataLanguage.trim()) &&
                    track.meta.trackPersons.length > 0 &&
                    authorsOk;

                  return (
                    <div key={track.id} className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-white/[0.03]">
                      <button
                        type="button"
                        onClick={() => setOpenTrackId((current) => (current === track.id ? null : track.id))}
                        className="flex w-full items-center gap-4 px-4 py-4 text-left"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[12px] font-semibold tabular-nums text-white/58">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-white">{title}</p>
                          <p className="truncate text-[12px] text-white/42">{track.name}</p>
                        </div>
                        <span className="shrink-0 text-[12px] tabular-nums text-white/42">
                          {track.durationSec ? formatDuration(track.durationSec) : track.durationLabel ?? "—"}
                        </span>
                        <span
                          className={cn(
                            "hidden rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex",
                            trackOk
                              ? "border-emerald-400/18 bg-emerald-500/[0.08] text-emerald-100"
                              : "border-amber-400/18 bg-amber-500/[0.08] text-amber-100"
                          )}
                        >
                          {trackOk ? "Метаданные заполнены" : "Проверить трек"}
                        </span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-white/40 transition-transform", isOpen && "rotate-180")} />
                      </button>

                      {isOpen ? (
                        <div className="border-t border-white/[0.08] px-4 py-4">
                          {audioUrl ? (
                            <div className="mb-4">
                              <TrackAudioPlayer src={audioUrl} fallbackDurationSec={track.durationSec} />
                            </div>
                          ) : (
                            <div className="mb-4 rounded-[18px] border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[12.5px] text-white/48">
                              Для этого трека аудио не прикреплено.
                            </div>
                          )}

                          <div className="grid gap-4 xl:grid-cols-2">
                            <ReviewGroup title="Идентификация">
                              <ReviewValue label="Название трека" value={track.meta.title} required onFix={() => setStep("tracks")} />
                              <ReviewValue label="Подзаголовок" value={track.meta.subtitle} optional />
                              <ReviewValue label="ISRC" value={track.meta.isrc} optional />
                              <ReviewValue label="Код партнёра" value={track.meta.partnerCode} optional />
                              <ReviewValue label="Язык трека" value={track.meta.metadataLanguage} required onFix={() => setStep("tracks")} />
                            </ReviewGroup>

                            <ReviewGroup title="Персоны и роли">
                              {track.meta.trackPersons.length === 0 ? (
                                <MissingInline onFix={() => setStep("tracks")}>Не заполнены участники трека</MissingInline>
                              ) : (
                                <div className="space-y-2">
                                  {track.meta.trackPersons.map((person) => (
                                    <PersonRow key={person.id} person={person} />
                                  ))}
                                </div>
                              )}
                            </ReviewGroup>

                            <ReviewGroup title="Права">
                              <ReviewValue label="Авторские права" value={track.meta.copyrightPct ? `${track.meta.copyrightPct}%` : ""} required onFix={() => setStep("tracks")} />
                              <ReviewValue label="Смежные права" value={track.meta.relatedRightsPct ? `${track.meta.relatedRightsPct}%` : ""} required onFix={() => setStep("tracks")} />
                            </ReviewGroup>

                            <ReviewGroup title="Версия трека">
                              <BooleanPills
                                values={[
                                  ["Explicit Content", track.meta.versionExplicit],
                                  ["Instrumental", track.meta.versionInstrumental],
                                  ["Remix", track.meta.versionRemix],
                                  ["Cover", track.meta.versionCover],
                                  ["Live", track.meta.versionLive],
                                  ["Упоминание веществ", track.meta.versionDrugReference]
                                ]}
                              />
                            </ReviewGroup>

                            <ReviewGroup title="Дополнительные параметры">
                              <BooleanPills
                                values={[
                                  ["Focus track", track.meta.focusTrack],
                                  ["Instant Gratification", track.meta.instantGratification],
                                  ["ИИ использовался", track.meta.aiAssistanceUsed],
                                  ["ИИ полностью сгенерировал трек", track.meta.aiGeneratedFullTrack],
                                  ["ИИ сгенерировал музыку", track.meta.aiGeneratedMusicOnly],
                                  ["ИИ сгенерировал текст", track.meta.aiGeneratedLyricsOnly],
                                  ["ИИ обработал трек", track.meta.aiProcessedTrackOnly]
                                ]}
                              />
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <ReviewValue label="Старт предпрослушивания" value={track.meta.previewStart} optional />
                                <ReviewValue label="Рингтон, сек" value={track.meta.ringtoneDurationSec} optional />
                              </div>
                            </ReviewGroup>

                            <ReviewGroup title="Тексты и файлы">
                              <ReviewValue label="Текст трека" value={track.meta.lyrics.trim()} optional multiline />
                              <ReviewValue
                                label="Синхронизированный текст"
                                value={track.meta.syncedLyrics.length > 0 ? `${track.meta.syncedLyrics.length} строк` : track.meta.syncedLyricsFile?.fileName ?? ""}
                                optional
                              />
                              <ReviewValue label="Рингтон" value={track.meta.ringtoneFile?.fileName ?? ""} optional />
                              <ReviewValue label="Видео" value={track.meta.videoFile?.fileName ?? ""} optional />
                            </ReviewGroup>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section ref={storesRef} className="rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,21,34,0.96),rgba(11,14,25,0.98))] p-5 sm:p-6">
            <SectionTitle title="Площадки и территории" />

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ReviewGroup title="Территории">
                <ReviewValue label="Режим" value={territoriesSummary} required onFix={() => setStep("stores")} />
                {data.territoryMode !== "all" && data.territoryCountries.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowCountries((current) => !current)}
                      className="mt-3 text-[12px] font-medium text-[#b8a8ff] transition hover:text-white"
                    >
                      {showCountries ? "Скрыть страны" : "Показать страны"}
                    </button>
                    {showCountries ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedCountryLabels.map((name) => (
                          <Pill key={name}>{name}</Pill>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </ReviewGroup>

              <ReviewGroup title="Площадки">
                <ReviewValue label="Режим" value={platformsSummary} required onFix={() => setStep("stores")} />
                {data.platformMode === "selected" && selectedPlatformLabels.length > 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowPlatforms((current) => !current)}
                      className="mt-3 text-[12px] font-medium text-[#b8a8ff] transition hover:text-white"
                    >
                      {showPlatforms ? "Скрыть площадки" : "Показать площадки"}
                    </button>
                    {showPlatforms ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedPlatformLabels.map((name) => (
                          <Pill key={name}>{name}</Pill>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </ReviewGroup>
            </div>
          </section>

          <section className="rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,21,34,0.96),rgba(11,14,25,0.98))] p-5 sm:p-6">
            <SectionTitle title="Дополнительные параметры" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <ReviewValue label="Ранний старт в России" value={data.earlyRussiaStart ? "Включено" : "Выключено"} optional />
              <ReviewValue label="Доставка в реальном времени" value={data.realTimeDelivery ? "Включено" : "Выключено"} optional />
              <ReviewValue label="Приоритетный релиз" value={data.priorityRelease ? "Включено" : "Выключено"} optional />
              <ReviewValue label="Яндекс pre-save" value={formatDate(data.yandexPreReleaseDate)} optional />
            </div>
          </section>

          <section ref={moderatorRef} className="rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,21,34,0.96),rgba(11,14,25,0.98))] p-5 sm:p-6">
            <SectionTitle title="Сообщение для модератора" />
            <p className="mt-2 max-w-3xl text-[13px] leading-6 text-white/52">
              Укажите информацию, которая поможет модераторам проверить релиз: ссылки на профиль артиста, особенности отгрузки видео, написания названий, исполнителей и т.д.
            </p>
            <textarea
              value={data.moderatorComment}
              onChange={(event) => set("moderatorComment", event.target.value)}
              placeholder="Оставьте полезный комментарий для модератора"
              className="mt-4 min-h-[132px] w-full rounded-[20px] border border-white/[0.10] bg-black/20 px-4 py-3 text-[14px] text-white outline-none transition-colors placeholder:text-white/32 focus:border-[var(--ux-accent)]/50"
            />
          </section>

          <section className="rounded-[26px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(18,21,34,0.96),rgba(11,14,25,0.98))] p-5 sm:p-6">
            <SectionTitle title="Финальная отправка" />
            <p className="mt-2 text-[13px] leading-6 text-white/52">
              Проверьте все разделы выше. После отправки релиз уйдёт на модерацию с текущими данными формы.
            </p>

            {hasBlockingErrors ? (
              <div className="mt-4 rounded-[18px] border border-rose-400/22 bg-rose-500/[0.06] px-4 py-3 text-[12.5px] text-rose-100/90">
                Кнопка отправки заблокирована, пока обязательные поля не заполнены.
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep("extras")}
                className="inline-flex items-center gap-2 rounded-[18px] border border-white/[0.08] bg-white/[0.03] px-5 py-3 text-[13px] font-medium text-white/82 transition-colors hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white"
              >
                Назад
              </button>

              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitting || hasBlockingErrors}
                className={cn(
                  "inline-flex items-center gap-2 rounded-[18px] bg-[var(--ux-accent)] px-5 py-3 text-[13px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[var(--ux-accent-strong)]",
                  (isSubmitting || hasBlockingErrors) && "cursor-not-allowed opacity-60 hover:translate-y-0"
                )}
              >
                {submitPhase === "saving"
                  ? "Сохраняем изменения..."
                  : submitPhase === "uploading"
                    ? "Загружаем файлы..."
                    : submitPhase === "submitting" || isSubmitting
                      ? "Отправляем на модерацию..."
                      : "Отправить релиз на модерацию"}
              </button>
            </div>
          </section>
      </div>
    </div>
  );
}

function detailItemsComplete(data: ReturnType<typeof useWizard>["data"]) {
  return Boolean(
    data.title.trim() &&
      data.type &&
      data.releaseKind &&
      data.genre.trim() &&
      data.language.trim() &&
      data.label.trim() &&
      data.rightsYear.trim() &&
      data.preorderDate.trim() &&
      data.startDate.trim() &&
      data.releaseDate.trim() &&
      data.persons.length > 0
  );
}

function tracksComplete(tracks: TrackFile[]) {
  if (tracks.length === 0) return false;
  return tracks.every((track) => {
    const authorCoverage = getTrackAuthorCoverage(track.meta.trackPersons);
    return Boolean(
      track.meta.title.trim() &&
        track.meta.metadataLanguage.trim() &&
        track.meta.trackPersons.length > 0 &&
        authorCoverage.hasMusicAuthor &&
        authorCoverage.hasLyricsAuthor
    );
  });
}

function groupPeopleByRole(persons: PersonRole[]) {
  return persons.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.role
  }));
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-white">{title}</h3>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11.5px] font-medium text-white/82">
      {children}
    </span>
  );
}

function ReviewGroup({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-white/[0.08] bg-black/16 p-4">
      <h4 className="text-[13px] font-semibold text-white/88">{title}</h4>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

function ReviewValue({
  label,
  value,
  required,
  optional,
  onFix,
  multiline
}: {
  label: string;
  value: React.ReactNode;
  required?: boolean;
  optional?: boolean;
  onFix?: () => void;
  multiline?: boolean;
}) {
  const empty = !value || (typeof value === "string" && value.trim() === "");
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/38">{label}</p>
      {empty ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className={cn("text-[13px]", required && !optional ? "text-rose-300" : "text-white/72")}>
            {required && !optional ? "Не заполнено" : "—"}
          </span>
          {required && onFix ? (
            <button
              type="button"
              onClick={onFix}
              className="text-[11px] font-medium text-[#b8a8ff] transition hover:text-white"
            >
              Исправить
            </button>
          ) : null}
        </div>
      ) : (
        <div className={cn("mt-1.5 text-[13px] text-white", multiline ? "whitespace-pre-wrap leading-6" : "")}>
          {value}
        </div>
      )}
    </div>
  );
}

function MissingInline({
  children,
  onFix
}: {
  children: React.ReactNode;
  onFix?: () => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[16px] border border-rose-400/18 bg-rose-500/[0.05] px-3 py-2.5">
      <span className="text-[12.5px] text-rose-100/92">{children}</span>
      {onFix ? (
        <button
          type="button"
          onClick={onFix}
          className="text-[11px] font-medium text-[#f2d0ff] transition hover:text-white"
        >
          Исправить
        </button>
      ) : null}
    </div>
  );
}

function PersonRow({ person }: { person: PersonRole }) {
  return (
    <div className="rounded-[14px] border border-white/[0.08] bg-white/[0.03] px-3 py-2">
      <p className="text-[12.5px] font-medium text-white">{person.name || "—"}</p>
      <p className="mt-0.5 text-[11px] text-white/48">{person.role || "Роль не указана"}</p>
    </div>
  );
}

function BooleanPills({
  values
}: {
  values: Array<[string, boolean]>;
}) {
  const active = values.filter(([, enabled]) => enabled);
  if (active.length === 0) {
    return <p className="text-[12.5px] text-white/48">Не отмечено</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {active.map(([label]) => (
        <Pill key={label}>{label}</Pill>
      ))}
    </div>
  );
}
