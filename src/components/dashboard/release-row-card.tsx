"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Barcode,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  Diamond,
  ExternalLink,
  Globe2,
  Link2,
  ListMusic,
  Hash,
  Music2,
  Loader2,
  Pause,
  Pencil,
  Play,
  Radio,
  Rocket,
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
import { buildStoredFileRouteUrl, normalizeStoredFileKey } from "@/lib/file-resolver";
import { getReleaseTimelineState } from "@/lib/release-timeline-state";
import { getPriorityBadgeDescriptor } from "@/lib/release-status-ui";
import {
  buildTrackQuickPreviewData,
  type TrackQuickPreviewData
} from "@/lib/track-quick-preview";
import { resolveRenderableStoredFileUrl } from "@/lib/s3";

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
  onDraftDeleted?: (releaseId: string, draftsCount?: number) => void;
  onReleaseRemoved?: (releaseId: string) => void;
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
  const storageKey = normalizeStoredFileKey(ref.storageKey ?? ref.url ?? null);
  if (storageKey) {
    return buildStoredFileRouteUrl(storageKey);
  }
  return null;
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
  allowDraftDelete = false,
  onDraftDeleted,
  onReleaseRemoved
}: ReleaseRowCardProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [quickPreviewTrackNum, setQuickPreviewTrackNum] = React.useState<number | null>(null);
  const [quickPreviewLoadingTrackNum, setQuickPreviewLoadingTrackNum] = React.useState<number | null>(null);
  const [quickPreviewCache, setQuickPreviewCache] = React.useState<
    Record<number, TrackQuickPreviewData | null>
  >({});
  const [deleting, setDeleting] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const [deleteComment, setDeleteComment] = React.useState("");
  const [paying, setPaying] = React.useState(false);
  const [payError, setPayError] = React.useState<string | null>(null);
  const [coverBroken, setCoverBroken] = React.useState(false);
  const primaryCoverCandidate =
    release.coverUrlCandidates?.find((candidate) => candidate.trim().length > 0) ?? "";
  const coverSource = release.coverUrl || primaryCoverCandidate || release.cover || "";
  const timelineState = getReleaseTimelineState(release.status, release.paid);
  const showChangesNotice =
    release.status === "changes_required" || release.status === "rejected";
  const showPendingVerificationNotice = release.status === "pending_verification";
  const editLocked = release.status === "moderation";
  const isDraftCardClickable = allowDraftDelete && release.status === "draft";
  const canRequestReleaseDeletion = release.status !== "draft";
  const activeCoverSrc = !coverBroken
    ? resolveRenderableStoredFileUrl({ url: coverSource, storageKey: null })
    : null;
  const title = release.title?.trim() || "Без названия";
  const artist = release.artist?.trim() || "Исполнитель не указан";
  const releaseDate = release.releaseDate?.trim() || "Дата не выбрана";
  const startDate = release.startDate?.trim() || "Дата не выбрана";
  const createdAt = release.createdAt?.trim() || "Дата не выбрана";
  const preorderDate = release.preorderDate?.trim() || "Дата не выбрана";
  const genre = release.genre?.trim() || "Не указан";
  const label = release.label?.trim() || "Не указан";
  const priorityBadge = getPriorityBadgeDescriptor(Boolean(release.priority));
  const isRenderableCover = Boolean(activeCoverSrc);
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

  // Smart Link создаётся только для принятых релизов с UPC — у остальных кнопка вела бы в никуда.
  const hasSmartLink =
    ["approved", "distributed", "dsp_confirmed"].includes(release.status) && Boolean(release.upc?.trim());

  const totalDurationLabel = React.useMemo(() => {
    const totalSeconds = trackServices.reduce((sum, track) => {
      const [minutes, seconds] = (track.duration ?? "").split(":").map(Number);
      return Number.isFinite(minutes) && Number.isFinite(seconds) ? sum + minutes * 60 + seconds : sum;
    }, 0);
    if (totalSeconds <= 0) return null;
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
  }, [trackServices]);

  React.useEffect(() => {
    setCoverBroken(false);
  }, [release.id]);

  const handleDeleteDraft = React.useCallback(async () => {
    if (release.status !== "draft") return;

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
        const isAlreadyDeleted =
          response.status === 404 &&
          parsed &&
          typeof parsed === "object" &&
          "error" in parsed &&
          typeof parsed.error === "string" &&
          /релиз не найден/i.test(parsed.error);

        if (isAlreadyDeleted) {
          setDeleteDialogOpen(false);
          onDraftDeleted?.(release.id);
          window.dispatchEvent(new CustomEvent("dashboard:release-counts-refresh"));
          return;
        }

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
        onDraftDeleted?.(release.id, parsed.draftsCount);
      } else {
        onDraftDeleted?.(release.id);
      }
      setDeleteDialogOpen(false);
      window.dispatchEvent(new CustomEvent("dashboard:release-counts-refresh"));
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Не удалось удалить черновик."
      );
    } finally {
      setDeleting(false);
    }
  }, [onDraftDeleted, release.id, release.status]);

  const handleRequestReleaseDeletion = React.useCallback(async () => {
    if (!canRequestReleaseDeletion) return;

    const comment = deleteComment.trim();
    if (!comment) {
      setDeleteError("Укажите причину снятия релиза с площадок.");
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/releases/${release.id}/delete-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ comment })
      });
      const parsed = (await response.json().catch(() => null)) as
        | { error?: string; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(parsed?.error ?? "Не удалось отправить запрос на удаление релиза.");
      }

      setDeleteDialogOpen(false);
      setDeleteComment("");
      onReleaseRemoved?.(release.id);
      window.dispatchEvent(new CustomEvent("dashboard:release-counts-refresh"));
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Не удалось отправить запрос на удаление релиза."
      );
    } finally {
      setDeleting(false);
    }
  }, [canRequestReleaseDeletion, deleteComment, onReleaseRemoved, release.id]);

  const openDraftForEditing = () => {
    if (!isDraftCardClickable || editing) return;
    setEditing(true);
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
        "group relative overflow-hidden rounded-[26px] border border-white/[0.07] bg-[#13141c] transition-colors hover:border-white/[0.12]",
        isDraftCardClickable && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7b3df5]/50"
      )}
    >
      <div className="pointer-events-none absolute -right-32 -top-32 h-64 w-64 rounded-full bg-[#7b3df5]/0 blur-3xl transition-all duration-500 group-hover:bg-[#7b3df5]/10" />
      {isRenderableCover ? (
        // Размытая обложка за шапкой окрашивает карточку в цвета релиза.
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[220px] overflow-hidden">
          <img
            src={activeCoverSrc ?? ""}
            alt=""
            className="h-full w-full scale-125 object-cover opacity-30 blur-[60px] saturate-150"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(19,20,28,0.2),#13141c_92%)]" />
        </div>
      ) : null}

      <div className="relative p-4">
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
              ariaLabel={editing ? "Открываем редактор" : "Редактировать копию"}
              disabled={editing}
              title={editing ? "Открываем редактор..." : "Редактировать: копия в черновиках, затем на модерацию"}
              onClick={() => setEditing(true)}
            >
              {editing ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
              ) : (
                <Pencil className="h-3 w-3" strokeWidth={2} />
              )}
            </ActionLink>
          )}
          {release.status === "draft" && allowDraftDelete ? (
            <ActionIcon
              ariaLabel="Удалить"
              danger
              disabled={deleting}
              title={deleting ? "Удаляем черновик..." : "Удалить черновик"}
              onClick={() => {
                setDeleteError(null);
                setDeleteComment("");
                setDeleteDialogOpen(true);
              }}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
              ) : (
                <Trash2 className="h-3 w-3" strokeWidth={2} />
              )}
            </ActionIcon>
          ) : null}
          {canRequestReleaseDeletion ? (
            <ActionIcon
              ariaLabel="Удалить релиз"
              danger
              disabled={deleting}
              title={deleting ? "Отправляем запрос..." : "Удалить релиз с площадок"}
              onClick={() => {
                setDeleteError(null);
                setDeleteComment("");
                setDeleteDialogOpen(true);
              }}
            >
              {deleting ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2} />
              ) : (
                <Trash2 className="h-3 w-3" strokeWidth={2} />
              )}
            </ActionIcon>
          ) : null}
        </div>
        {deleteError ? (
          <p className="mb-3 pr-32 text-[13px] font-medium text-rose-300">{deleteError}</p>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* cover + vinyl peeking out from behind it */}
          <div className="relative shrink-0 self-start sm:mr-[38px] sm:self-center">
            <div
              aria-hidden
              className="absolute left-[52px] top-[7px] hidden h-[86px] w-[86px] place-items-center rounded-full bg-[repeating-radial-gradient(circle,#111_0_2px,#1c1c21_2px_4px)] shadow-[0_20px_40px_-20px_#000] transition-transform duration-700 group-hover:translate-x-3 group-hover:rotate-45 sm:grid"
            >
              <span
                className="h-[34%] w-[34%] rounded-full border-[3px] border-[#13141c] bg-[#2a2c38] bg-cover bg-center"
                style={isRenderableCover ? { backgroundImage: `url("${activeCoverSrc}")` } : undefined}
              />
            </div>
            <div className="relative h-[88px] w-[88px] overflow-hidden rounded-[16px] border border-white/[0.1] shadow-[0_20px_40px_-20px_rgba(0,0,0,0.95)] sm:h-[100px] sm:w-[100px]">
              {isRenderableCover ? (
                // Keep release cards stable even when remote host is not configured in next/image.
                <img
                  src={activeCoverSrc ?? ""}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  loading="lazy"
                  onError={() => {
                    setCoverBroken(true);
                  }}
                />
              ) : (
                <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(123,61,245,0.35),transparent_60%),linear-gradient(135deg,#1a1b26,#101118)]">
                  <Music2 className="h-7 w-7 text-white/30" strokeWidth={1.6} />
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 sm:pr-20">
            <div className="flex flex-wrap items-center gap-2">
              <StatusFieldValue release={release} />
              {priorityBadge ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/95">
                  <Diamond className="h-3 w-3 fill-emerald-400/80 text-emerald-400" />
                  {priorityBadge.label}
                </span>
              ) : null}
            </div>
            <h3 className="mt-1.5 truncate text-[18px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[21px]">
              {showNumber ? <span className="mr-3 text-white/35">#{release.number}</span> : null}
              {title}
            </h3>
            <p className="mt-0.5 truncate text-[13px] font-semibold text-white/60">{artist}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-medium text-white/50">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" />
                {releaseDate}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Radio className="h-4 w-4" />
                {release.platformsCount ? `${release.platformsCount} площадок` : release.platforms || "Площадки не выбраны"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Globe2 className="h-4 w-4" />
                {release.territoriesCount ? `${release.territoriesCount} территорий` : release.territories || "—"}
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {hasSmartLink ? (
                <Link
                  href={`/dashboard/releases/${release.id}/smart-link`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[10px] bg-[#7b61ff] px-3.5 text-[12.5px] font-semibold text-white shadow-[0_14px_40px_-14px_rgba(123,97,255,0.9)] transition hover:bg-[#8b74ff]"
                >
                  <Link2 className="h-4 w-4" />
                  Smart Link
                </Link>
              ) : null}
              <Link
                href={release.status === "draft" ? `/dashboard/releases/${release.id}/edit` : `/dashboard/releases/${release.id}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-white/[0.14] px-3.5 text-[12.5px] font-semibold text-white/85 transition hover:border-white/25 hover:text-white"
              >
                {release.status === "draft" ? <Pencil className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}
                {release.status === "draft" ? "Продолжить" : "Подробнее"}
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <MetaField
            icon={<Barcode className="h-3.5 w-3.5" />}
            label="UPC"
            value={release.upc?.trim() ? <CopyableValue value={release.upc.trim()} /> : "Н/А"}
          />
          <MetaField icon={<Building2 className="h-3.5 w-3.5" />} label="Лейбл" value={label} />
          {variant === "compact" ? (
            <MetaField icon={<CalendarPlus className="h-3.5 w-3.5" />} label="Создан" value={createdAt} />
          ) : (
            <MetaField icon={<CalendarClock className="h-3.5 w-3.5" />} label="Предзаказ" value={preorderDate} />
          )}
          <MetaField icon={<Rocket className="h-3.5 w-3.5" />} label="Старт" value={startDate} />
          {release.releaseCatalogId ? (
            <MetaField icon={<Hash className="h-3.5 w-3.5" />} label="Номер в каталоге" value={release.releaseCatalogId} />
          ) : null}
          <MetaField icon={<Music2 className="h-3.5 w-3.5" />} label="Жанр" value={genre} />
        </div>

        {showPay && timelineState.showPayButton ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.08] px-4 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-amber-100">Релиз ждёт оплаты</p>
                <p className="text-[12.5px] text-amber-100/70">
                  Модерация начнётся сразу после оплаты. Если оплата не прошла — попробуйте ещё раз.
                </p>
                {payError ? <p className="mt-1 text-[12px] font-medium text-rose-300">{payError}</p> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                void startReleasePayment();
              }}
              disabled={paying}
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[10px] bg-amber-400 px-4 text-[13px] font-bold text-[#1a1300] transition hover:bg-amber-300 disabled:opacity-60"
            >
              {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              {paying ? "Переход к оплате..." : "Оплатить релиз"}
            </button>
          </div>
        ) : null}

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

        {/* tracklist */}
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#13151d]">
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-white/[0.02] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7b3df5]/50"
        >
          <span className="flex items-center gap-2 text-[14px] font-semibold text-white">
            <ListMusic className="h-4 w-4 text-[#a78bfa]" />
            Трек-лист
            {displayTracks.length > 0 ? (
              <span className="rounded-full bg-white/[0.08] px-2 text-[12px] font-bold text-white/70">
                {displayTracks.length}
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-3 text-[13px] font-medium text-white/45">
            {totalDurationLabel ? <span className="hidden sm:inline">Общая длительность {totalDurationLabel}</span> : null}
            <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-180")} />
          </span>
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
              <div className="border-t border-white/[0.06]">
                {displayTracks.length === 0 ? (
                  <p className="px-4 py-4 text-center text-[12.5px] text-white/40">
                    Треков пока нет
                  </p>
                ) : (
                  <>
                    {displayTracks.map((t) => {
                      const extra = trackServices.find((item) => item.trackNum === t.num);
                      return (
                        <TrackRow
                          key={t.num}
                          num={t.num}
                          title={t.title}
                          subtitle={extra?.subtitle}
                          artists={extra?.artists ?? artist}
                          isrc={t.submissionTrack?.isrc?.trim() || undefined}
                          duration={extra?.duration ?? t.duration}
                          rightsShare={extra?.rightsShare ?? "100%"}
                          audioUrl={extra?.audioUrl}
                          services={extra?.services}
                          selected={isQuickPreviewOpen && quickPreviewTrackNum === t.num}
                          onOpen={(event) => openTrackQuickPreview(t.num, event)}
                        />
                      );
                    })}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.05] px-4 py-2.5 text-[11.5px] text-white/40">
                      <span className="inline-flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" />Рингтон</span>
                      <span className="inline-flex items-center gap-1.5"><Type className="h-3.5 w-3.5" />Текст</span>
                      <span className="inline-flex items-center gap-1.5"><ScrollText className="h-3.5 w-3.5" />Синхронный текст</span>
                      <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />Видео</span>
                      <span className="ml-auto">Подсвечено — добавлено к треку</span>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        </div>
      </div>

      <ReleaseDeleteDialog
        open={deleteDialogOpen}
        title={title}
        status={release.status}
        deleting={deleting}
        error={deleteError}
        comment={deleteComment}
        onCommentChange={setDeleteComment}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeleteComment("");
        }}
        onConfirm={() => {
          if (release.status === "draft") {
            void handleDeleteDraft();
            return;
          }
          void handleRequestReleaseDeletion();
        }}
      />

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
                    {buildQuickPreviewRoleRows(quickPreviewData).map((row) => (
                      <PreviewRow key={row.label} label={row.label} value={row.value} />
                    ))}
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

function MetaField({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-1.5">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-white/40">
        {icon}
        {label}
      </p>
      <div className="min-w-0 truncate text-[12.5px] font-semibold leading-snug text-white/90">{value}</div>
    </div>
  );
}

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Скопировать"
      className="inline-flex max-w-full items-center gap-1.5 hover:text-white"
    >
      <span className="truncate tabular-nums">{value}</span>
      {copied ? (
        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
      ) : (
        <Copy className="h-3.5 w-3.5 shrink-0 text-white/40" />
      )}
    </button>
  );
}

function ActionLink({
  href,
  ariaLabel,
  disabled,
  external,
  onClick,
  title,
  children
}: {
  href: string;
  ariaLabel: string;
  disabled?: boolean;
  external?: boolean;
  onClick?: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.();
      }}
      {...(external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-lg border border-white/[0.10] bg-white/[0.02] text-white/55 transition-all hover:border-white/[0.20] hover:bg-white/[0.05] hover:text-white/95",
        disabled && "pointer-events-none cursor-not-allowed opacity-70"
      )}
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
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
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

function ReleaseDeleteDialog({
  open,
  title,
  status,
  deleting,
  error,
  comment,
  onCommentChange,
  onClose,
  onConfirm
}: {
  open: boolean;
  title: string;
  status: CabinetRelease["status"];
  deleting: boolean;
  error: string | null;
  comment: string;
  onCommentChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const commentRequired = status !== "draft";

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-[110] bg-black/65 backdrop-blur-[2px]"
            onClick={() => {
              if (deleting) return;
              onClose();
            }}
          />
          <div className="fixed inset-0 z-[120] grid place-items-center p-4">
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="w-[min(92vw,560px)] rounded-[28px] border border-white/10 bg-[#121521] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-[30px] font-semibold tracking-[-0.03em] text-white">
                    {status === "draft" ? "Удалить черновик" : "Удалить релиз с площадок?"}
                  </h3>
                  <p className="mt-5 text-[15px] leading-8 text-white/78">
                    {status === "draft"
                      ? `Вы уверены, что хотите удалить черновик альбома «${title}» навсегда? Вы не сможете отменить это действие.`
                      : `Вы уверены, что хотите удалить релиз «${title}» с площадок? Удаление может занять до 72 часов.`}
                  </p>
                  {status === "draft" ? (
                    <p className="mt-5 text-[15px] leading-8 text-white/62">
                      Не беспокойтесь, удаление черновика не исключит релиз из вашего каталога.
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onClose}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-white/55 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {commentRequired ? (
                <label className="mt-6 block">
                  <span className="text-[12px] font-semibold uppercase tracking-[0.18em] text-white/55">
                    Причина удаления
                  </span>
                  <textarea
                    value={comment}
                    disabled={deleting}
                    onChange={(event) => onCommentChange(event.target.value)}
                    maxLength={1000}
                    rows={4}
                    placeholder="Укажите причину снятия релиза с площадок."
                    className="mt-3 min-h-[112px] w-full resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[15px] leading-6 text-white outline-none transition placeholder:text-white/35 focus:border-[#8b6cff]/55 focus:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </label>
              ) : null}

              {error ? (
                <p className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/[0.08] px-4 py-3 text-[13px] font-medium text-rose-200">
                  {error}
                </p>
              ) : null}

              <div className="mt-8 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onClose}
                  className="inline-flex h-14 items-center justify-center rounded-2xl border border-[#6ce5ff]/35 px-8 text-[16px] font-semibold text-[#8deeff] transition hover:bg-[#6ce5ff]/8 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Отменить
                </button>
                <button
                  type="button"
                  disabled={deleting || (commentRequired && !comment.trim())}
                  onClick={onConfirm}
                  className="inline-flex h-14 min-w-[164px] items-center justify-center rounded-2xl bg-[#ff4d5f] px-8 text-[16px] font-semibold text-white transition hover:bg-[#ff6171] disabled:cursor-not-allowed disabled:bg-[#ff4d5f]/70"
                >
                  {deleting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : status === "draft" ? (
                    "Удалить"
                  ) : (
                    "Удалить с площадок"
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body
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

function buildQuickPreviewRoleRows(data: TrackQuickPreviewData | null): Array<{ label: string; value: string }> {
  const rows = [
    { label: "Исполнитель", value: joinPreviewValues(data?.roles.performer) },
    { label: "feat", value: joinPreviewValues(data?.roles.feat) },
    { label: "Remixer", value: joinPreviewValues(data?.roles.remixer) },
    { label: "Соисполнитель", value: joinPreviewValues(data?.roles.coPerformer) },
    { label: "Продюсер", value: joinPreviewValues(data?.roles.producer) },
    { label: "Автор музыки", value: joinPreviewValues(data?.roles.musicAuthor) },
    { label: "Автор слов", value: joinPreviewValues(data?.roles.lyricsAuthor) }
  ].filter((row) => row.value !== "Данные не указаны");

  return rows.length > 0 ? rows : [{ label: "Персоны", value: "Данные не указаны" }];
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
        "inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
        enabled
          ? "border-[#7b61ff]/35 bg-[#7b61ff]/18 text-[#c4b5fd]"
          : "border-white/[0.08] bg-white/[0.02] text-white/25"
      )}
    >
      {icon}
    </span>
  );
}

// Волна декоративная: высоты столбиков стабильно выводятся из названия трека,
// а закрашивается она по реальному прогрессу воспроизведения.
function buildWaveform(seed: string, bars: number): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: bars }, (_, index) => {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const noise = (hash % 1000) / 1000;
    const envelope = 0.55 + 0.45 * Math.sin((index / bars) * Math.PI);
    return Math.round(22 + 78 * envelope * (0.35 + 0.65 * noise));
  });
}

function TrackRow({
  num,
  title,
  subtitle,
  artists,
  isrc,
  duration,
  rightsShare,
  audioUrl,
  services,
  selected,
  onOpen
}: {
  num: number;
  title: string;
  subtitle?: string;
  artists: string;
  isrc?: string;
  duration: string;
  rightsShare: string;
  audioUrl?: string | null;
  services?: { ringtone: boolean; plainText: boolean; syncedText: boolean; video: boolean };
  selected: boolean;
  onOpen: (event: React.MouseEvent | React.KeyboardEvent) => void;
}) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const waveform = React.useMemo(() => buildWaveform(`${num}-${title}`, 64), [num, title]);
  const active = playing || progress > 0;

  const togglePlayback = (event: React.MouseEvent) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const seek = (event: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    audio.currentTime = ((event.clientX - rect.left) / rect.width) * audio.duration;
    if (audio.paused) void audio.play();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onOpen}
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-l-[3px] border-b-white/[0.05] border-l-transparent px-4 py-2 transition-colors last:border-b-0 hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#7b3df5]/50 sm:flex-nowrap",
        active && "border-l-[#7b61ff] bg-[#7b61ff]/[0.07]",
        selected && "bg-[#7b3df5]/12"
      )}
    >
      <span className="w-5 shrink-0 text-center text-[13px] tabular-nums text-white/40">{num}</span>
      {audioUrl ? (
        <button
          type="button"
          onClick={togglePlayback}
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full transition",
            playing
              ? "bg-[#7b61ff] text-white shadow-[0_10px_28px_-10px_rgba(123,97,255,1)]"
              : "border border-white/15 text-white hover:border-[#7b61ff]/60 hover:bg-[#7b61ff]/15"
          )}
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
            onEnded={() => {
              setPlaying(false);
              setProgress(0);
            }}
            onTimeUpdate={(event) => {
              const audio = event.currentTarget;
              setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
            }}
          />
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
        </button>
      ) : (
        <span
          title="Аудио не загружено"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[0.08] text-white/25"
        >
          <Play className="ml-0.5 h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1 sm:w-[220px] sm:flex-none">
        <p className="truncate text-[14px] font-semibold text-white">
          {title}
          {subtitle ? <span className="ml-1 font-medium text-white/45">{subtitle}</span> : null}
        </p>
        <p className="truncate text-[12.5px] text-white/45">
          {artists}
          {isrc ? ` · ISRC ${isrc}` : ""}
        </p>
      </div>
      <div
        onClick={audioUrl ? seek : undefined}
        className={cn("order-last flex h-7 w-full items-center gap-[2px] sm:order-none sm:w-auto sm:flex-1", audioUrl && "cursor-pointer")}
        aria-hidden
      >
        {waveform.map((height, index) => (
          <span
            key={index}
            className={cn(
              "flex-1 rounded-full transition-colors",
              index / waveform.length < progress ? "bg-[#8b7bff]" : "bg-white/[0.14]"
            )}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-white/60">{duration}</span>
      <span className="hidden shrink-0 rounded-full bg-white/[0.06] px-2.5 py-1 text-[12px] font-semibold text-white/70 md:inline">
        {rightsShare} прав
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <TrackServiceIndicator label="Рингтон" enabled={Boolean(services?.ringtone)} icon={<Smartphone className="h-3.5 w-3.5" />} />
        <TrackServiceIndicator label="Текст" enabled={Boolean(services?.plainText)} icon={<Type className="h-3.5 w-3.5" />} />
        <TrackServiceIndicator label="Синх. текст" enabled={Boolean(services?.syncedText)} icon={<ScrollText className="h-3.5 w-3.5" />} />
        <TrackServiceIndicator label="Видео" enabled={Boolean(services?.video)} icon={<Video className="h-3.5 w-3.5" />} />
      </div>
    </div>
  );
}
