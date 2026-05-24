"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ClipboardList,
  Diamond,
  ExternalLink,
  Pause,
  Pencil,
  Play,
  ScrollText,
  Smartphone,
  Trash2,
  Type,
  Video,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { cn } from "@/lib/utils";
import type { CabinetRelease } from "@/lib/cabinet-types";
import type { ReleaseDraftDeleteResponse } from "@/lib/api/contracts";
import { getReleaseTimelineState } from "@/lib/release-timeline-state";
import { getPriorityBadgeDescriptor } from "@/lib/release-status-ui";
import {
  buildTrackQuickPreviewData,
  type TrackQuickPreviewData
} from "@/lib/track-quick-preview";
import { normalizeNextImageSrc } from "@/lib/image-src";

import { PaymentStatusBadge } from "@/components/releases/payment-status-badge";
import { StatusBadge } from "@/components/releases/status-badge";
import { ReleaseChangesNotice } from "./release-changes-notice";
import { ReleaseModerationStepper } from "./release-moderation-stepper";

interface ReleaseRowCardProps {
  release: CabinetRelease;
  index?: number;
  variant?: "default" | "compact";
  showNumber?: boolean;
  showPay?: boolean;
  allowDraftDelete?: boolean;
}

interface SubmissionTrackPersonLike {
  name?: string;
  role?: string;
}

interface SubmissionTrackLike {
  fileName?: string;
  title?: string;
  subtitle?: string;
  isrc?: string;
  audioFile?: unknown;
  durationSec?: number;
  lyrics?: string;
  syncedLyricsFile?: unknown;
  textFile?: unknown;
  ringtoneFile?: unknown;
  karaokeFile?: unknown;
  videoFile?: unknown;
  videoShotFile?: unknown;
  videoClipFile?: unknown;
  copyrightPct?: string;
  relatedRightsPct?: string;
  trackPersons?: SubmissionTrackPersonLike[];
}

interface SubmissionDataLike {
  tracks?: SubmissionTrackLike[];
}

function parseSubmissionData(value: unknown): SubmissionDataLike | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as SubmissionDataLike;
}

function readFileRef(input: unknown): { url?: string; storageKey?: string } | null {
  if (!input) return null;
  if (typeof input === "string") {
    const value = input.trim();
    return value ? { url: value } : null;
  }
  if (typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const url = typeof source.url === "string" ? source.url.trim() : "";
  const storageKey =
    typeof source.storageKey === "string"
      ? source.storageKey.trim()
      : typeof source.key === "string"
        ? source.key.trim()
        : "";
  if (!url && !storageKey) return null;
  return {
    ...(url ? { url } : {}),
    ...(storageKey ? { storageKey } : {})
  };
}

function resolveFileRefUrl(input: unknown): string | null {
  const ref = readFileRef(input);
  if (!ref) return null;
  if (ref.url) return ref.url;
  if (!ref.storageKey) return null;
  const encoded = ref.storageKey
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  if (!encoded) return null;
  return `/api/uploads/object/${encoded}`;
}

function parsePercentValue(value: string | undefined): number | null {
  const normalized = (value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, parsed));
}

function formatPercent(value: number): string {
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2
  })}%`;
}

function formatRightsShareCombined(params: {
  copyrightPct?: string;
  relatedRightsPct?: string;
}): string {
  const copyright = parsePercentValue(params.copyrightPct);
  const related = parsePercentValue(params.relatedRightsPct);

  if (copyright == null && related == null) return "100%";
  if (copyright != null && related == null) return formatPercent(copyright);
  if (copyright == null && related != null) return formatPercent(related);
  if (copyright != null && related != null && copyright === related) {
    return formatPercent(copyright);
  }

  if (copyright != null && related != null) {
    return `${formatPercent(copyright)} / ${formatPercent(related)}`;
  }

  return "100%";
}

function formatDurationFromSeconds(value: number | undefined): string | null {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) return null;
  const total = Math.max(0, Math.floor(value ?? 0));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function resolveTrackDuration(params: {
  fallback: string;
  durationSec?: number;
}): string {
  const fromSeconds = formatDurationFromSeconds(params.durationSec);
  if (fromSeconds) return fromSeconds;
  const normalized = params.fallback.trim();
  return normalized || "00:00";
}

function resolveTrackArtists(
  persons: SubmissionTrackPersonLike[] | undefined,
  fallback: string
): string {
  const list =
    persons
      ?.filter((person) => {
        const role = person.role?.toLowerCase() ?? "";
        return role.includes("исполн") || role.includes("artist") || role.includes("feat");
      })
      .map((person) => person.name?.trim() ?? "")
      .filter(Boolean) ?? [];
  return list.length > 0 ? Array.from(new Set(list)).join(", ") : fallback;
}

function hasTrackFile(input: unknown): boolean {
  return Boolean(readFileRef(input));
}

function ReleaseRowCardBase({
  release,
  index = 0,
  variant = "default",
  showNumber = false,
  showPay = true,
  allowDraftDelete = false
}: ReleaseRowCardProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [quickPreviewTrackNum, setQuickPreviewTrackNum] = React.useState<number | null>(null);
  const [quickPreviewLoadingTrackNum, setQuickPreviewLoadingTrackNum] = React.useState<number | null>(null);
  const [quickPreviewCache, setQuickPreviewCache] = React.useState<
    Record<number, TrackQuickPreviewData | null>
  >({});
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [paying, setPaying] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [coverCandidateIndex, setCoverCandidateIndex] = React.useState(0);
  const timelineState = getReleaseTimelineState(release.status, release.paid);
  const showChangesNotice =
    release.status === "changes_required" || release.status === "rejected";
  const showPendingVerificationNotice = release.status === "pending_verification";
  const editLocked = release.status === "moderation";
  const showHistoryIcon = release.status !== "draft";
  const isDraftCardClickable = allowDraftDelete && release.status === "draft";
  const coverCandidates = React.useMemo(
    () =>
      Array.from(
        new Set(
          [release.coverUrl, ...(release.coverUrlCandidates ?? []), release.cover]
            .map((item) => normalizeNextImageSrc(item ?? ""))
            .filter((item): item is string => Boolean(item))
        )
      ),
    [release.cover, release.coverUrl, release.coverUrlCandidates]
  );
  const safeCoverSrc = coverCandidates[coverCandidateIndex] ?? null;
  const title = release.title?.trim() || "Без названия";
  const artist = release.artist?.trim() || "Исполнитель не указан";
  const releaseDate = release.releaseDate?.trim() || "Дата не выбрана";
  const startDate = release.startDate?.trim() || "Дата не выбрана";
  const createdAt = release.createdAt?.trim() || "Дата не выбрана";
  const preorderDate = release.preorderDate?.trim() || "Дата не выбрана";
  const genre = release.genre?.trim() || "Не указан";
  const label = release.label?.trim() || "Не указан";
  const priorityBadge = getPriorityBadgeDescriptor(Boolean(release.priority));
  const isRenderableCover = Boolean(safeCoverSrc);
  const quickPreviewData =
    quickPreviewTrackNum == null ? null : (quickPreviewCache[quickPreviewTrackNum] ?? null);
  const isQuickPreviewOpen = quickPreviewTrackNum != null;
  const isQuickPreviewLoading =
    quickPreviewTrackNum != null && quickPreviewLoadingTrackNum === quickPreviewTrackNum;
  const parsedSubmissionData = React.useMemo(
    () => parseSubmissionData(release.submissionData),
    [release.submissionData]
  );
  const submissionTracks = React.useMemo(
    () => (Array.isArray(parsedSubmissionData?.tracks) ? parsedSubmissionData.tracks : []),
    [parsedSubmissionData]
  );
  const displayTracks = React.useMemo(() => {
    if (release.tracks.length > 0) {
      return release.tracks.map((track) => ({
        num: track.num,
        title: track.title,
        duration: track.duration,
        submissionTrack: submissionTracks[Math.max(0, track.num - 1)]
      }));
    }

    return submissionTracks.map((track, index) => ({
      num: index + 1,
      title: track.title?.trim() || track.fileName?.trim() || `Трек ${index + 1}`,
      duration: resolveTrackDuration({
        fallback: "00:00",
        durationSec: track.durationSec
      }),
      submissionTrack: track
    }));
  }, [release.tracks, submissionTracks]);
  const trackServices = React.useMemo(
    () =>
      displayTracks.map((track) => {
        const submissionTrack = track.submissionTrack;
        const hasSyncedText =
          hasTrackFile(submissionTrack?.syncedLyricsFile) ||
          hasTrackFile(submissionTrack?.textFile);
        const hasPlainText = Boolean(submissionTrack?.lyrics?.trim());
        const hasRingtone =
          hasTrackFile(submissionTrack?.ringtoneFile) ||
          hasTrackFile(submissionTrack?.karaokeFile);
        const hasVideo =
          hasTrackFile(submissionTrack?.videoFile) ||
          hasTrackFile(submissionTrack?.videoShotFile) ||
          hasTrackFile(submissionTrack?.videoClipFile);
        const audioUrl = resolveFileRefUrl(submissionTrack?.audioFile);

        return {
          trackNum: track.num,
          subtitle: submissionTrack?.subtitle?.trim() || "",
          artists: resolveTrackArtists(submissionTrack?.trackPersons, artist),
          duration: resolveTrackDuration({
            fallback: track.duration,
            durationSec: submissionTrack?.durationSec
          }),
          rightsShare: formatRightsShareCombined({
            copyrightPct: submissionTrack?.copyrightPct,
            relatedRightsPct: submissionTrack?.relatedRightsPct
          }),
          audioUrl,
          services: {
            ringtone: hasRingtone,
            plainText: hasPlainText,
            syncedText: hasSyncedText,
            video: hasVideo
          }
        };
      }),
    [artist, displayTracks]
  );

  React.useEffect(() => {
    setCoverCandidateIndex(0);
  }, [release.id, coverCandidates.length]);

  const handleDeleteDraft = React.useCallback(async () => {
    if (release.status !== "draft") return;
    const confirmDelete = window.confirm("Удалить этот черновик без возможности восстановления?");
    if (!confirmDelete) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/releases/draft/${release.id}`, {
        method: "DELETE"
      });
      const parsed = (await response.json().catch(() => null)) as
        | ReleaseDraftDeleteResponse
        | { error?: string; errors?: Array<{ message?: string }> }
        | null;

      if (!response.ok) {
        const errors =
          parsed &&
          typeof parsed === "object" &&
          "errors" in parsed &&
          Array.isArray(parsed.errors)
            ? parsed.errors
            : undefined;
        const errorText =
          parsed &&
          typeof parsed === "object" &&
          "error" in parsed &&
          typeof parsed.error === "string"
            ? parsed.error
            : undefined;
        const message =
          errors?.[0]?.message ??
          errorText ??
          "Не удалось удалить черновик.";
        throw new Error(message);
      }

      if (parsed && "draftsCount" in parsed && typeof parsed.draftsCount === "number") {
        window.dispatchEvent(
          new CustomEvent("dashboard:drafts-count", {
            detail: { draftsCount: parsed.draftsCount }
          })
        );
      }
      window.dispatchEvent(new CustomEvent("dashboard:release-counts-refresh"));
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Не удалось удалить черновик."
      );
    } finally {
      setDeleting(false);
    }
  }, [release.id, release.status, router]);

  const openDraftForEditing = () => {
    if (!isDraftCardClickable) return;
    router.push(`/dashboard/releases/${release.id}/edit`);
  };

  const closeQuickPreview = React.useCallback(() => {
    setQuickPreviewTrackNum(null);
    setQuickPreviewLoadingTrackNum(null);
  }, []);

  React.useEffect(() => {
    if (!isQuickPreviewOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeQuickPreview();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeQuickPreview, isQuickPreviewOpen]);

  const openTrackQuickPreview = React.useCallback(
    (trackNum: number, event: React.MouseEvent | React.KeyboardEvent) => {
      event.stopPropagation();
      if (event.type === "keydown") {
        const keyEvent = event as React.KeyboardEvent;
        if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
        keyEvent.preventDefault();
      }

      setQuickPreviewTrackNum(trackNum);
      if (quickPreviewCache[trackNum] !== undefined) {
        return;
      }
      if (quickPreviewLoadingTrackNum === trackNum) {
        return;
      }

      setQuickPreviewLoadingTrackNum(trackNum);
      window.setTimeout(() => {
        const details = buildTrackQuickPreviewData(release, trackNum);
        setQuickPreviewCache((prev) => {
          if (prev[trackNum] !== undefined) return prev;
          return {
            ...prev,
            [trackNum]: details
          };
        });
        setQuickPreviewLoadingTrackNum((prev) => (prev === trackNum ? null : prev));
      }, 140);
    },
    [quickPreviewCache, quickPreviewLoadingTrackNum, release]
  );

  const startReleasePayment = React.useCallback(async () => {
    if (paying) return;

    setPayError(null);
    setPaying(true);
    try {
      const response = await fetch(`/api/releases/${release.id}/pay`, {
        method: "POST"
      });

      const parsed = (await response.json().catch(() => null)) as
        | { error?: string; confirmationUrl?: string }
        | null;

      if (!response.ok) {
        setPayError(parsed?.error ?? "Не удалось создать платёж.");
        return;
      }

      const confirmationUrl = parsed?.confirmationUrl?.trim();
      if (!confirmationUrl) {
        setPayError("Платёжный шлюз не вернул ссылку на оплату.");
        return;
      }

      window.location.href = confirmationUrl;
    } catch {
      setPayError("Сервис оплаты временно недоступен. Повторите позже.");
    } finally {
      setPaying(false);
    }
  }, [paying, release.id]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      role={isDraftCardClickable ? "button" : undefined}
      tabIndex={isDraftCardClickable ? 0 : undefined}
      onClick={(event) => {
        if (!isDraftCardClickable) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        if (target.closest("button, a")) return;
        openDraftForEditing();
      }}
      onKeyDown={(event) => {
        if (!isDraftCardClickable) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openDraftForEditing();
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-white/[0.05] bg-[#13141a]/80 transition-colors hover:border-white/[0.10]",
        isDraftCardClickable && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/50"
      )}
    >
      <div className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full bg-[#7b3df5]/0 blur-3xl transition-all duration-500 group-hover:bg-[#7b3df5]/10" />

      <div className="relative p-5 sm:p-6">
        {/* action icons */}
        <div className="absolute right-5 top-5 flex items-center gap-1 sm:right-6 sm:top-6">
          {editLocked ? (
            <ActionIcon
              ariaLabel="Редактирование недоступно"
              title="Редактирование релиза на модерации недоступно."
            >
              <Pencil className="h-3 w-3" strokeWidth={2} />
            </ActionIcon>
          ) : (
            <ActionLink
              href={`/dashboard/releases/${release.id}/edit`}
              ariaLabel="Редактировать копию"
              title="Редактировать: копия в черновиках, затем на модерацию"
            >
              <Pencil className="h-3 w-3" strokeWidth={2} />
            </ActionLink>
          )}
          {showHistoryIcon ? (
            <ActionIcon ariaLabel="История модерации">
              <ClipboardList className="h-3 w-3" strokeWidth={2} />
            </ActionIcon>
          ) : null}
          {release.status === "draft" && allowDraftDelete ? (
            <ActionIcon
              ariaLabel="Удалить"
              danger
              disabled={deleting}
              title={deleting ? "Удаляем черновик..." : "Удалить черновик"}
              onClick={() => {
                void handleDeleteDraft();
              }}
            >
              <Trash2 className="h-3 w-3" strokeWidth={2} />
            </ActionIcon>
          ) : null}
        </div>
        {deleteError ? (
          <p className="mb-3 pr-32 text-[13px] font-medium text-rose-300">{deleteError}</p>
        ) : null}

        <div className="flex flex-col gap-5 sm:flex-row">
          {/* cover */}
          <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl border border-white/[0.06] sm:h-[100px] sm:w-[100px]">
            {isRenderableCover ? (
              // Keep release cards stable even when remote host is not configured in next/image.
              <img
                src={safeCoverSrc ?? ""}
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                loading="lazy"
                onError={() =>
                  setCoverCandidateIndex((prev) =>
                    prev + 1 <= coverCandidates.length ? prev + 1 : prev
                  )
                }
              />
            ) : (
              <div className="grid h-full w-full place-items-center bg-white/[0.02] px-2 text-center text-[12px] font-medium text-white/45">
                Обложка недоступна
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-baseline gap-3 pr-32">
              {showNumber ? (
                <span className="text-[34px] font-bold leading-none text-white sm:text-[40px]">
                  {release.number}
                </span>
              ) : (
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-[18px] font-semibold uppercase tracking-wide text-white">
                      {title}
                    </h3>
                    {priorityBadge ? (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300/95">
                        <Diamond className="h-2.5 w-2.5 fill-emerald-400/80 text-emerald-400" />
                        {priorityBadge.label}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[14px] font-medium text-white/70">
                    {artist}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[14px] font-medium">
              <Field label="UPC" value={release.upc?.trim() ? release.upc : "Н/А"} />
              <Field label="Название лейбла" value={label} valueClass="text-white" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-white/[0.05] pt-4 sm:grid-cols-2 lg:grid-cols-4">
              {release.releaseCatalogId ? (
                <MetaField label="ID" value={release.releaseCatalogId} />
              ) : null}
              {variant === "compact" ? (
                <MetaField label="Дата создания" value={createdAt} />
              ) : (
                <MetaField label="Дата предзаказа" value={preorderDate} />
              )}
              <MetaField label="Дата релиза" value={releaseDate} />
              <MetaField label="Дата старта" value={startDate} />
              <MetaField
                label="Территории"
                value={
                  <span className="inline-flex items-center gap-1 text-white/85">
                    {release.territoriesCount ? `${release.territoriesCount}` : release.territories}
                    <ExternalLink className="h-3 w-3 text-white/40" />
                  </span>
                }
              />
              <MetaField
                label="Площадки"
                value={
                  <span className="inline-flex items-center gap-1 text-white/85">
                    {release.platformsCount ? `${release.platformsCount}` : release.platforms}
                    <ExternalLink className="h-3 w-3 text-white/40" />
                  </span>
                }
              />
              <MetaField label="Жанр" value={genre} />
              <MetaField label="Статус" value={<StatusFieldValue release={release} />} />
            </div>

            {showPay ? (
              <div className="mt-4 flex items-center justify-end border-t border-white/[0.05] pt-4">
                {timelineState.showPayButton ? (
                  <button
                    type="button"
                    onClick={() => {
                      void startReleasePayment();
                    }}
                    disabled={paying}
                    className="rounded-lg bg-[#7b3df5] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#8b4ff7]"
                  >
                    {paying ? "Переход к оплате..." : "Оплатить"}
                  </button>
                ) : null}
              </div>
            ) : null}
            {payError ? (
              <p className="mt-2 text-right text-[12px] font-medium text-rose-300">
                {payError}
              </p>
            ) : null}
          </div>
        </div>

        <ReleaseModerationStepper
          steps={timelineState.steps}
          activeIndex={timelineState.activeIndex}
        />
        {showPendingVerificationNotice ? (
          <div className="mt-4 rounded-2xl border border-cyan-300/18 bg-cyan-500/8 p-4 text-[13px] text-cyan-100/88">
            После подтверждения верификации релиз будет отправлен на модерацию.
          </div>
        ) : null}
        {showChangesNotice ? (
          <ReleaseChangesNotice
            status={release.status === "rejected" ? "rejected" : "changes_required"}
            reason={release.rejectionReason}
            remarks={release.moderationRemarks}
            returnedAt={release.moderationReturnedAt}
          />
        ) : null}

        {/* tracklist toggle */}
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] text-white/55 transition-colors hover:text-white"
        >
          Трек-лист
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-300",
              open && "rotate-180"
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 overflow-x-auto rounded-xl border border-white/[0.05] bg-black/20">
                {displayTracks.length === 0 ? (
                  <p className="px-4 py-4 text-center text-[12.5px] text-white/40">
                    Треков пока нет
                  </p>
                ) : (
                  <div className="min-w-[900px]">
                    <div className="grid grid-cols-[44px_52px_1.8fr_1.2fr_120px_120px_220px] items-center gap-2 border-b border-white/[0.07] px-4 py-2 text-[12px] font-semibold text-white/48">
                      <span>#</span>
                      <span className="text-center">▶</span>
                      <span>Название</span>
                      <span className="text-center">Исполнитель</span>
                      <span className="text-center">Длительность</span>
                      <span className="text-center">Доля прав</span>
                      <span className="text-center">Сервисы</span>
                    </div>
                    {displayTracks.map((t) => {
                      const extra = trackServices.find((item) => item.trackNum === t.num);
                      return (
                        <div
                          key={t.num}
                          role="button"
                          tabIndex={0}
                          onClick={(event) => openTrackQuickPreview(t.num, event)}
                          onKeyDown={(event) => openTrackQuickPreview(t.num, event)}
                          className={cn(
                            "grid grid-cols-[44px_52px_1.8fr_1.2fr_120px_120px_220px] items-center gap-2 border-b border-white/[0.04] px-4 py-2.5 text-[13px] transition-colors last:border-b-0 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/50",
                            isQuickPreviewOpen &&
                              quickPreviewTrackNum === t.num &&
                              "bg-[#7b3df5]/12 ring-1 ring-inset ring-[#7b3df5]/40"
                          )}
                        >
                          <span className="tabular-nums text-white/42">{t.num}</span>
                          <div className="flex justify-center">
                            <TrackAudioButton audioUrl={extra?.audioUrl} />
                          </div>
                          <div className="min-w-0 truncate font-medium text-white/88">
                            <span>{t.title}</span>
                            {extra?.subtitle ? (
                              <span className="ml-1 text-white/45">{extra.subtitle}</span>
                            ) : null}
                          </div>
                          <span className="justify-self-stretch truncate text-center text-white/72">
                            {extra?.artists ?? artist}
                          </span>
                          <span className="justify-self-stretch text-center tabular-nums text-white/62">
                            {extra?.duration ?? t.duration}
                          </span>
                          <span className="justify-self-stretch text-center tabular-nums text-white/62">
                            {extra?.rightsShare ?? "100%"}
                          </span>
                          <div className="flex items-center justify-center gap-2">
                            <TrackServiceIndicator
                              label="Рингтон"
                              enabled={Boolean(extra?.services.ringtone)}
                              icon={<Smartphone className="h-4 w-4" />}
                            />
                            <TrackServiceIndicator
                              label="Текст"
                              enabled={Boolean(extra?.services.plainText)}
                              icon={<Type className="h-4 w-4" />}
                            />
                            <TrackServiceIndicator
                              label="Синх. текст"
                              enabled={Boolean(extra?.services.syncedText)}
                              icon={<ScrollText className="h-4 w-4" />}
                            />
                            <TrackServiceIndicator
                              label="Видео"
                              enabled={Boolean(extra?.services.video)}
                              icon={<Video className="h-4 w-4" />}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isQuickPreviewOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="fixed inset-0 z-[90] bg-black/55"
              onClick={closeQuickPreview}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="fixed right-0 top-0 z-[100] h-full w-full max-w-[560px] overflow-y-auto border-l border-white/10 bg-[#0e111a] shadow-2xl"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#0e111a]/95 px-5 py-4 backdrop-blur">
                <div>
                  <p className="text-[12px] uppercase tracking-[0.14em] text-white/55">Быстрый просмотр трека</p>
                  <h3 className="mt-1 text-[20px] font-semibold text-white">
                    {quickPreviewData?.title || "Данные не указаны"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeQuickPreview}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isQuickPreviewLoading ? (
                <div className="space-y-4 p-5">
                  <SkeletonBlock />
                  <SkeletonBlock />
                  <SkeletonBlock />
                </div>
              ) : (
                <div className="space-y-4 p-5">
                  <PreviewSection title="Идентификация">
                    <PreviewRow label="ISRC" value={quickPreviewData?.identification.isrc} />
                    <PreviewRow label="Код партнёра" value={quickPreviewData?.identification.partnerCode} />
                  </PreviewSection>

                  <PreviewSection title="Персоны и роли">
                    <PreviewRow
                      label="Исполнитель"
                      value={joinPreviewValues(quickPreviewData?.roles.performer)}
                    />
                    <PreviewRow label="feat" value={joinPreviewValues(quickPreviewData?.roles.feat)} />
                    <PreviewRow
                      label="Remixer"
                      value={joinPreviewValues(quickPreviewData?.roles.remixer)}
                    />
                    <PreviewRow
                      label="Соисполнитель"
                      value={joinPreviewValues(quickPreviewData?.roles.coPerformer)}
                    />
                    <PreviewRow
                      label="Продюсер"
                      value={joinPreviewValues(quickPreviewData?.roles.producer)}
                    />
                    <PreviewRow
                      label="Автор музыки"
                      value={joinPreviewValues(quickPreviewData?.roles.musicAuthor)}
                    />
                    <PreviewRow
                      label="Автор слов"
                      value={joinPreviewValues(quickPreviewData?.roles.lyricsAuthor)}
                    />
                  </PreviewSection>

                  <PreviewSection title="Права">
                    <PreviewRow label="Авторские права (%)" value={quickPreviewData?.rights.copyrightPct} />
                    <PreviewRow
                      label="Смежные права (%)"
                      value={quickPreviewData?.rights.relatedRightsPct}
                    />
                  </PreviewSection>

                  <PreviewSection title="Дополнительные параметры">
                    <PreviewRow
                      label="Focus track"
                      value={quickPreviewData?.additional.focusTrack ? "✅" : "❌"}
                    />
                    <PreviewRow
                      label="Начало предпрослушивания"
                      value={quickPreviewData?.additional.previewStart}
                    />
                    <PreviewRow
                      label="Explicit"
                      value={quickPreviewData?.additional.explicit ? "✅" : "❌"}
                    />
                    <PreviewRow
                      label="Language"
                      value={quickPreviewData?.additional.language}
                    />
                  </PreviewSection>

                  <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] text-white/65">
                    Редактирование доступно на странице релиза
                  </p>
                </div>
              )}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export const ReleaseRowCard = React.memo(ReleaseRowCardBase);
ReleaseRowCard.displayName = "ReleaseRowCard";

function StatusFieldValue({ release }: { release: CabinetRelease }) {
  const showPaymentBadge =
    release.paymentKind === "paid" ||
    release.paymentKind === "subscription" ||
    release.paymentKind === "unpaid" ||
    !release.paid;
  const statusPaymentLabel =
    release.paymentKind === "subscription" && release.paymentLabel
      ? release.paymentLabel.replace(/\s+\d+\/(?:\d+|∞)$/u, "")
      : release.paymentLabel;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <StatusBadge status={release.status} />
      {showPaymentBadge ? (
        <PaymentStatusBadge
          paid={release.paid}
          label={statusPaymentLabel}
          kind={release.paymentKind}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  valueClass
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[13px] font-medium text-white/50">{label}</span>
      <span className={cn("text-[14px] font-medium text-white/78", valueClass)}>{value}</span>
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium text-white/48">{label}</p>
      <div className="mt-1 min-w-0 text-[14px] font-medium leading-snug text-white/88">{value}</div>
    </div>
  );
}

function ActionLink({
  href,
  ariaLabel,
  external,
  title,
  children
}: {
  href: string;
  ariaLabel: string;
  external?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      title={title}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.10] bg-white/[0.02] text-white/55 transition-all hover:border-white/[0.20] hover:bg-white/[0.05] hover:text-white/95"
    >
      {children}
    </Link>
  );
}

function ActionIcon({
  children,
  ariaLabel,
  danger,
  title,
  disabled,
  onClick
}: {
  children: React.ReactNode;
  ariaLabel: string;
  danger?: boolean;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg border border-white/[0.10] bg-white/[0.02] text-white/55 transition-all",
        disabled && "cursor-not-allowed opacity-50",
        danger
          ? "hover:border-[#ff5d6d]/40 hover:bg-[#ff5d6d]/[0.08] hover:text-[#ff5d6d]"
          : "hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white/90"
      )}
    >
      {children}
    </button>
  );
}

function PreviewSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h4 className="text-[14px] font-semibold text-white">{title}</h4>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function PreviewRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[13px] text-white/55">{label}</span>
      <span className="max-w-[65%] text-right text-[13px] font-medium text-white">
        {value?.trim() ? value : "Данные не указаны"}
      </span>
    </div>
  );
}

function joinPreviewValues(values: string[] | undefined): string {
  if (!values || values.length === 0) return "Данные не указаны";
  return values.join(", ");
}

function SkeletonBlock() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full animate-pulse rounded bg-white/10" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-white/10" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-white/10" />
      </div>
    </div>
  );
}

function TrackServiceIndicator({
  label,
  enabled,
  icon
}: {
  label: string;
  enabled: boolean;
  icon: React.ReactNode;
}) {
  return (
    <span
      title={enabled ? `${label}: добавлен` : `${label}: не добавлен`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
        enabled
          ? "border-cyan-300/35 bg-cyan-500/12 text-cyan-200"
          : "border-white/[0.12] bg-white/[0.03] text-white/35"
      )}
    >
      {icon}
    </span>
  );
}

function TrackAudioButton({ audioUrl }: { audioUrl?: string | null }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);

  if (!audioUrl) {
    return (
      <span
        title="Аудио не загружено"
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.12] bg-white/[0.03] text-white/30"
      >
        <Play className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) {
          void audio.play();
        } else {
          audio.pause();
        }
      }}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-500/10 text-cyan-200 transition-colors hover:bg-cyan-500/20"
      title={playing ? "Пауза" : "Воспроизвести"}
      aria-label={playing ? "Пауза" : "Воспроизвести"}
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="none"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 fill-current" />}
    </button>
  );
}
