"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  Loader2,
  Music2,
  ScrollText,
  Trash2,
  Video,
  X,
  XCircle
} from "lucide-react";

import { ReleaseCoverUploadButton } from "@/components/admin/release-cover-upload-button";
import { ReleaseAudioUploadButton } from "@/components/admin/release-audio-upload-button";
import { StatusBadge } from "@/components/releases/status-badge";
import { resolveRenderableStoredFileUrl } from "@/lib/s3";

interface AdminReleaseDetailsResponse {
  id: string;
  status: string;
  payment_status: string;
  payment_label?: string;
  payment_usage?: string | null;
  payment_plan?: "STANDARD" | "PRO" | "ENTERPRISE" | null;
  priority: boolean;
  media_health?: {
    broken_cover: boolean;
    broken_audio_tracks: number;
  };
  cover: {
    url: string;
    storage_key?: string | null;
    download_url: string | null;
    candidate_urls: string[];
    diagnosis?: MediaDiagnosisSummary;
  };
  release: {
    metadata_language: string;
    title: string;
    subtitle: string;
    genre: string;
    release_type: string;
    label: string;
    upc: string;
    dates: {
      preorder_date: string;
      start_date: string;
      release_date: string;
    };
    territories: {
      mode: string;
      label: string;
      count: number;
      countries: string[];
    };
    platforms: {
      count: number;
      selected_codes: string[];
      names: string[];
    };
    roles: {
      performers: string[];
      feats: string[];
      remixers: string[];
      coPerformers: string[];
      producers: string[];
      musicAuthors: string[];
      lyricsAuthors: string[];
    };
    settings: {
      early_russia_start: boolean;
      real_time_delivery: boolean;
      yandex_pre_release_date: string;
    };
  };
  tracks: Array<{
    id: string;
    title: string;
    subtitle: string;
    identification: {
      isrc: string;
      partner_code: string;
    };
    track_roles: {
      performers: string[];
      feats: string[];
      remixers: string[];
      coPerformers: string[];
      producers: string[];
      musicAuthors: string[];
      lyricsAuthors: string[];
    };
    rights: {
      copyright_pct: string | number | null;
      related_rights_pct: string | number | null;
    };
    additional: {
      preview_start: string;
      instant_gratification: boolean;
      focus_track: boolean;
    };
    version: {
      explicit: boolean;
      live: boolean;
      cover: boolean;
      remix: boolean;
      instrumental: boolean;
      drug_reference: boolean;
    };
    ai_usage: {
      used: boolean;
      generated_full_track: boolean;
      generated_music_only: boolean;
      generated_lyrics_only: boolean;
      processed_track_only: boolean;
    };
    usage: {
      metadata_language: string;
    };
    duration_sec: number;
    files: {
      audio: FileItem;
      text: FileItem;
      karaoke: FileItem;
      video_shot: FileItem;
      video_clip: FileItem;
    };
    raw_commentary: {
      lyrics: string;
    };
  }>;
  comment: string;
  extras: {
    lyrics: string | null;
    karaoke: string | null;
    video_shot: Record<string, unknown> | null;
    video_clip: Record<string, unknown> | null;
    additional: Record<string, unknown> | null;
  };
}

interface FileItem {
  available: boolean;
  file_name: string | null;
  download_url: string | null;
  diagnosis?: MediaDiagnosisSummary;
}

type ActionKind = "approve" | "reject" | "delete" | "payment" | "edit";
type RepairTarget = "cover" | "track_audio";

interface MediaDiagnosisSummary {
  status: "ok" | "missing_file" | "broken_db_path" | "access_denied" | "no_preview";
  label: string;
  message: string;
  storage_key: string | null;
  resolved_url: string | null;
  suggested_storage_key: string | null;
  suggested_source: "root_filename" | "sibling_folder" | null;
  suggested_ambiguous: boolean;
}

interface AdminReleaseMediaDiagnosticsResponse {
  media_health: {
    broken_cover: boolean;
    broken_audio_tracks: number;
  };
  cover_diagnosis: MediaDiagnosisSummary | null;
  track_audio_diagnoses: Record<string, MediaDiagnosisSummary>;
}

type AdminTrackEditDraft = {
  title: string;
  subtitle: string;
  performers: string;
  feats: string;
  remixers: string;
  coPerformers: string;
  producers: string;
  musicAuthors: string;
  lyricsAuthors: string;
};

const boolView = (value: boolean) =>
  value ? (
    <span className="inline-flex items-center gap-1 text-emerald-300">
      <CheckCircle2 className="h-4 w-4" />
      Да
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-rose-300">
      <XCircle className="h-4 w-4" />
      Нет
    </span>
  );

function toDash(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim();
  return normalized || "-";
}

function toList(value: string[]): string {
  if (!value || value.length === 0) return "-";
  return value.join(", ");
}

function listToInput(value: string[]): string {
  return value.join(", ");
}

function inputToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTrackDraft(track: AdminReleaseDetailsResponse["tracks"][number]): AdminTrackEditDraft {
  return {
    title: track.title,
    subtitle: track.subtitle,
    performers: listToInput(track.track_roles.performers),
    feats: listToInput(track.track_roles.feats),
    remixers: listToInput(track.track_roles.remixers),
    coPerformers: listToInput(track.track_roles.coPerformers),
    producers: listToInput(track.track_roles.producers),
    musicAuthors: listToInput(track.track_roles.musicAuthors),
    lyricsAuthors: listToInput(track.track_roles.lyricsAuthors)
  };
}

function buildTrackDraftMap(tracks: AdminReleaseDetailsResponse["tracks"]): Record<string, AdminTrackEditDraft> {
  return Object.fromEntries(tracks.map((track) => [track.id, buildTrackDraft(track)]));
}

function fileActions(files: Array<{ label: string; file: FileItem }>) {
  return files.filter((item) => item.file.available);
}

function guessDownloadName(fallback: string, fileName: string | null | undefined) {
  const normalized = String(fileName ?? "").trim();
  return normalized || fallback;
}

function formatDuration(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  const totalSeconds = Math.round(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function AdminReleaseDetailsClient({ details }: { details: AdminReleaseDetailsResponse }) {
  const router = useRouter();
  const canApprove = ["moderation", "changes_required", "approved", "rejected"].includes(
    details.status
  );
  const canReject = details.status === "moderation";
  const [busy, setBusy] = React.useState<ActionKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [upc, setUpc] = React.useState(details.release.upc && details.release.upc !== "-" ? details.release.upc : "");
  const [reason, setReason] = React.useState("");
  const [releaseTitle, setReleaseTitle] = React.useState(details.release.title);
  const [releaseSubtitle, setReleaseSubtitle] = React.useState(
    details.release.subtitle === "-" ? "" : details.release.subtitle
  );
  const [releaseLabel, setReleaseLabel] = React.useState(
    details.release.label === "-" ? "" : details.release.label
  );
  const [preorderDate, setPreorderDate] = React.useState(
    details.release.dates.preorder_date === "-" ? "" : details.release.dates.preorder_date
  );
  const [startDate, setStartDate] = React.useState(
    details.release.dates.start_date === "-" ? "" : details.release.dates.start_date
  );
  const [releaseDate, setReleaseDate] = React.useState(
    details.release.dates.release_date === "-" ? "" : details.release.dates.release_date
  );
  const [performers, setPerformers] = React.useState(listToInput(details.release.roles.performers));
  const [feats, setFeats] = React.useState(listToInput(details.release.roles.feats));
  const [remixers, setRemixers] = React.useState(listToInput(details.release.roles.remixers));
  const [coPerformers, setCoPerformers] = React.useState(listToInput(details.release.roles.coPerformers));
  const [producers, setProducers] = React.useState(listToInput(details.release.roles.producers));
  const [musicAuthors, setMusicAuthors] = React.useState(listToInput(details.release.roles.musicAuthors));
  const [lyricsAuthors, setLyricsAuthors] = React.useState(listToInput(details.release.roles.lyricsAuthors));
  const [editingTrackId, setEditingTrackId] = React.useState<string | null>(null);
  const [trackDrafts, setTrackDrafts] = React.useState<Record<string, AdminTrackEditDraft>>(
    buildTrackDraftMap(details.tracks)
  );
  const [platformsOpen, setPlatformsOpen] = React.useState(false);
  const [lyricsModal, setLyricsModal] = React.useState<{ title: string; lyrics: string } | null>(null);
  const [coverOverrideUrl, setCoverOverrideUrl] = React.useState<string | null>(null);
  const [repairBusyKey, setRepairBusyKey] = React.useState<string | null>(null);
  const [diagnostics, setDiagnostics] = React.useState<AdminReleaseMediaDiagnosticsResponse | null>(
    null
  );
  const [diagnosticsLoading, setDiagnosticsLoading] = React.useState(false);
  const coverSourceUrl = coverOverrideUrl ?? details.cover.url;
  const coverDownloadUrl = details.cover.download_url;
  const [coverBroken, setCoverBroken] = React.useState(false);
  const activeCoverUrl = coverBroken
    ? null
    : resolveRenderableStoredFileUrl({ url: coverSourceUrl, storageKey: null });
  const coverDiagnosis = diagnostics?.cover_diagnosis ?? details.cover.diagnosis ?? null;
  const mediaHealth = diagnostics?.media_health ?? details.media_health;
  const getTrackDiagnosis = React.useCallback(
    (trackId: string, fallback?: MediaDiagnosisSummary) =>
      diagnostics?.track_audio_diagnoses?.[trackId] ?? fallback ?? null,
    [diagnostics]
  );

  React.useEffect(() => {
    setCoverBroken(false);
    setCoverOverrideUrl(null);
    setDiagnostics(null);
    setReleaseTitle(details.release.title);
    setReleaseSubtitle(details.release.subtitle === "-" ? "" : details.release.subtitle);
    setReleaseLabel(details.release.label === "-" ? "" : details.release.label);
    setPreorderDate(details.release.dates.preorder_date === "-" ? "" : details.release.dates.preorder_date);
    setStartDate(details.release.dates.start_date === "-" ? "" : details.release.dates.start_date);
    setReleaseDate(details.release.dates.release_date === "-" ? "" : details.release.dates.release_date);
    setPerformers(listToInput(details.release.roles.performers));
    setFeats(listToInput(details.release.roles.feats));
    setRemixers(listToInput(details.release.roles.remixers));
    setCoPerformers(listToInput(details.release.roles.coPerformers));
    setProducers(listToInput(details.release.roles.producers));
    setMusicAuthors(listToInput(details.release.roles.musicAuthors));
    setLyricsAuthors(listToInput(details.release.roles.lyricsAuthors));
    setTrackDrafts(buildTrackDraftMap(details.tracks));
    setEditingTrackId(null);
    setEditOpen(false);
  }, [details.id]);

  React.useEffect(() => {
    let cancelled = false;

    const loadDiagnostics = async () => {
      setDiagnosticsLoading(true);
      try {
        const response = await fetch(`/api/admin/releases/${details.id}/diagnostics`, {
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => null)) as
          | AdminReleaseMediaDiagnosticsResponse
          | { error?: string }
          | null;
        if (!response.ok || !payload || "error" in payload) return;
        if (!cancelled) {
          setDiagnostics(payload as AdminReleaseMediaDiagnosticsResponse);
        }
      } finally {
        if (!cancelled) {
          setDiagnosticsLoading(false);
        }
      }
    };

    void loadDiagnostics();

    return () => {
      cancelled = true;
    };
  }, [details.id]);

  const approve = async () => {
    const normalized = upc.trim();
    if (!/^\d{12,14}$/u.test(normalized)) {
      setError("UPC обязателен и должен содержать 12-14 цифр.");
      return;
    }
    setBusy("approve");
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${details.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upc: normalized })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось принять релиз.");
      setApproveOpen(false);
      router.push("/admin/releases");
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось принять релиз.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    const normalized = reason.trim();
    if (normalized.length < 3) {
      setError("Причина отклонения обязательна (минимум 3 символа).");
      return;
    }
    setBusy("reject");
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${details.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: normalized })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось отклонить релиз.");
      setRejectOpen(false);
      router.push("/admin/releases");
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось отклонить релиз.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${details.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось удалить релиз.");
      setDeleteOpen(false);
      router.push("/admin/releases");
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось удалить релиз.");
    } finally {
      setBusy(null);
    }
  };

  const saveReleaseMeta = async () => {
    const normalizedTitle = releaseTitle.trim();
    if (!normalizedTitle) {
      setError("Название релиза обязательно.");
      return;
    }
    setBusy("edit");
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${details.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: normalizedTitle,
          subtitle: releaseSubtitle.trim(),
          label: releaseLabel.trim(),
          dates: {
            preorder_date: preorderDate.trim(),
            start_date: startDate.trim(),
            release_date: releaseDate.trim()
          },
          roles: {
            performers: inputToList(performers),
            feats: inputToList(feats),
            remixers: inputToList(remixers),
            coPerformers: inputToList(coPerformers),
            producers: inputToList(producers),
            musicAuthors: inputToList(musicAuthors),
            lyricsAuthors: inputToList(lyricsAuthors)
          },
          tracks: details.tracks.map((track) => {
            const draft = trackDrafts[track.id] ?? buildTrackDraft(track);
            return {
              id: track.id,
              title: draft.title.trim(),
              subtitle: draft.subtitle.trim(),
              roles: {
                performers: inputToList(draft.performers),
                feats: inputToList(draft.feats),
                remixers: inputToList(draft.remixers),
                coPerformers: inputToList(draft.coPerformers),
                producers: inputToList(draft.producers),
                musicAuthors: inputToList(draft.musicAuthors),
                lyricsAuthors: inputToList(draft.lyricsAuthors)
              }
            };
          })
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось обновить релиз.");
      setEditOpen(false);
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось обновить релиз.");
    } finally {
      setBusy(null);
    }
  };

  const resetEditForm = () => {
    setReleaseTitle(details.release.title);
    setReleaseSubtitle(details.release.subtitle === "-" ? "" : details.release.subtitle);
    setReleaseLabel(details.release.label === "-" ? "" : details.release.label);
    setPreorderDate(details.release.dates.preorder_date === "-" ? "" : details.release.dates.preorder_date);
    setStartDate(details.release.dates.start_date === "-" ? "" : details.release.dates.start_date);
    setReleaseDate(details.release.dates.release_date === "-" ? "" : details.release.dates.release_date);
    setPerformers(listToInput(details.release.roles.performers));
    setFeats(listToInput(details.release.roles.feats));
    setRemixers(listToInput(details.release.roles.remixers));
    setCoPerformers(listToInput(details.release.roles.coPerformers));
    setProducers(listToInput(details.release.roles.producers));
    setMusicAuthors(listToInput(details.release.roles.musicAuthors));
    setLyricsAuthors(listToInput(details.release.roles.lyricsAuthors));
    setTrackDrafts(buildTrackDraftMap(details.tracks));
    setEditingTrackId(null);
  };

  const togglePaymentStatus = async (paid: boolean) => {
    setBusy("payment");
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${details.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paid })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось обновить статус оплаты.");
      router.refresh();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Не удалось обновить статус оплаты."
      );
    } finally {
      setBusy(null);
    }
  };

  const repairMediaBinding = async (input: {
    key: string;
    target: RepairTarget;
    trackId?: string;
    storageKey: string;
  }) => {
    setRepairBusyKey(input.key);
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${details.id}/repair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: input.target,
          trackId: input.trackId,
          storageKey: input.storageKey
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось перепривязать файл.");
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось перепривязать файл.");
    } finally {
      setRepairBusyKey(null);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#181b2a]/90 via-[#15161d]/95 to-[#12131a]/95 p-5 shadow-[0_10px_40px_-20px_rgba(123,61,245,0.55)]">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div>
            <div className="relative h-[220px] w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {activeCoverUrl ? (
                <img
                  src={activeCoverUrl}
                  alt={details.release.title}
                  className="h-full w-full object-cover"
                  onError={() => {
                    setCoverBroken(true);
                  }}
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-[12px] text-white/50">
                  Без обложки
                </div>
              )}
            </div>
            <ReleaseCoverUploadButton
              releaseId={details.id}
              label={coverSourceUrl ? "Заменить обложку" : "Загрузить обложку"}
              className="mt-4"
              onUploaded={({ previewUrl }) => {
                setCoverOverrideUrl(previewUrl);
                setCoverBroken(false);
              }}
            />
            {coverDiagnosis ? (
              <MediaDiagnosisCard
                className="mt-3"
                diagnosis={coverDiagnosis}
                actionLabel="Перепривязать обложку"
                actionBusy={repairBusyKey === "cover"}
                onAction={
                  coverDiagnosis.suggested_storage_key
                    ? () =>
                        void repairMediaBinding({
                          key: "cover",
                          target: "cover",
                          storageKey: coverDiagnosis.suggested_storage_key!
                        })
                    : undefined
                }
              />
            ) : null}
            {activeCoverUrl ? (
              <a
                href={coverDownloadUrl ?? ""}
                download={guessDownloadName("cover.jpg", (coverDownloadUrl ?? activeCoverUrl ?? "").split("/").pop())}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-[#7b3df5] px-3 text-[13px] font-semibold text-white transition hover:bg-[#8f5bf7]"
              >
                <Download className="h-4 w-4" />
                Скачать обложку
              </a>
            ) : coverSourceUrl ? (
              <button
                type="button"
                disabled
                className="mt-4 inline-flex h-10 w-full cursor-not-allowed items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[13px] font-semibold text-white/45"
              >
                <Download className="h-4 w-4" />
                Файл недоступен
              </button>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={details.status} />
              <span className="text-[12px] text-white/60">
                Оплата: {details.payment_label ?? (details.payment_status === "paid" ? "Оплачен" : "Не оплачен")}
              </span>
              {details.priority ? (
                <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                  Приоритетный
                </span>
              ) : null}
            </div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/42">Редактирование релиза</p>
                  <p className="mt-1 text-[12px] text-white/55">
                    Обложка и аудио заменяются ниже по карточке.
                  </p>
                </div>
                {!editOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpen(true);
                      setError(null);
                    }}
                    disabled={busy !== null}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13px] font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Редактировать
                  </button>
                ) : null}
              </div>

              {editOpen ? (
                <>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[12px] text-white/60">Название релиза</span>
                      <input
                        value={releaseTitle}
                        onChange={(event) => setReleaseTitle(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none transition focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[12px] text-white/60">Подзаголовок</span>
                      <input
                        value={releaseSubtitle}
                        onChange={(event) => setReleaseSubtitle(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none transition focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-[12px] text-white/60">Лейбл</span>
                      <input
                        value={releaseLabel}
                        onChange={(event) => setReleaseLabel(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none transition focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[12px] text-white/60">Дата предзаказа</span>
                      <input
                        type="date"
                        value={preorderDate}
                        onChange={(event) => setPreorderDate(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none transition focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[12px] text-white/60">Дата старта</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none transition focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
                      />
                    </label>
                    <label className="block md:col-span-2">
                      <span className="mb-1 block text-[12px] text-white/60">Дата релиза</span>
                      <input
                        type="date"
                        value={releaseDate}
                        onChange={(event) => setReleaseDate(event.target.value)}
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none transition focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
                      />
                    </label>
                    <RoleInput label="Исполнитель(и)" value={performers} onChange={setPerformers} />
                    <RoleInput label="feat(s)" value={feats} onChange={setFeats} />
                    <RoleInput label="remixer" value={remixers} onChange={setRemixers} />
                    <RoleInput label="соисполнитель" value={coPerformers} onChange={setCoPerformers} />
                    <RoleInput label="продюсер" value={producers} onChange={setProducers} />
                    <RoleInput label="автор(ы) музыки" value={musicAuthors} onChange={setMusicAuthors} />
                    <RoleInput label="автор(ы) слов" value={lyricsAuthors} onChange={setLyricsAuthors} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void saveReleaseMeta();
                      }}
                      disabled={busy !== null}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#7b3df5] px-4 text-[13px] font-semibold text-white transition hover:bg-[#8f5bf7] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busy === "edit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Сохранить изменения
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        resetEditForm();
                        setEditOpen(false);
                        setError(null);
                      }}
                      disabled={busy !== null}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-[13px] font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Отмена
                    </button>
                  </div>
                </>
              ) : null}
            </div>
            {mediaHealth && (mediaHealth.broken_cover || mediaHealth.broken_audio_tracks > 0) ? (
              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100/90">
                <p className="font-semibold text-amber-50">Найдены проблемы с файлами релиза</p>
                <p className="mt-1">
                  {mediaHealth.broken_cover ? "Обложка требует проверки." : "Обложка в порядке."}{" "}
                  {mediaHealth.broken_audio_tracks > 0
                    ? `Проблемных аудиотреков: ${mediaHealth.broken_audio_tracks}.`
                    : "Все аудиотреки читаются корректно."}
                </p>
              </div>
            ) : null}
            {diagnosticsLoading ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[12px] text-white/55">
                Проверяем файлы релиза в storage...
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <InfoSection
                title="Общая информация о релизе"
                rows={[
                  ["Язык метаданных", toDash(details.release.metadata_language)],
                  ["Название релиза", toDash(details.release.title)],
                  ["Подзаголовок релиза", toDash(details.release.subtitle)],
                  ["Жанр", toDash(details.release.genre)],
                  ["Тип релиза", toDash(details.release.release_type)]
                ]}
              />

              <InfoSection
                title="Лейбл и идентификация"
                rows={[
                  ["Наименование лейбла", toDash(details.release.label)],
                  ["UPC", toDash(details.release.upc)]
                ]}
              />

              <InfoSection
                title="Персоны и роли"
                rows={[
                  ["Исполнитель(и)", toList(details.release.roles.performers)],
                  ["feat(s)", toList(details.release.roles.feats)],
                  ["remixer", toList(details.release.roles.remixers)],
                  ["соисполнитель", toList(details.release.roles.coPerformers)],
                  ["продюсер", toList(details.release.roles.producers)],
                  ["автор(ы) музыки", toList(details.release.roles.musicAuthors)],
                  ["автор(ы) слов", toList(details.release.roles.lyricsAuthors)]
                ]}
              />

              <InfoSection
                title="Основные даты релиза"
                rows={[
                  ["Дата предзаказа", toDash(details.release.dates.preorder_date)],
                  ["Дата старта", toDash(details.release.dates.start_date)],
                  ["Дата релиза", toDash(details.release.dates.release_date)]
                ]}
              />

              <InfoSection
                title="Страны распространения"
                rows={[
                  ["Режим", details.release.territories.label || "Страны не выбраны"],
                  [
                    "Список",
                    details.release.territories.countries.length > 0
                      ? details.release.territories.countries.join(", ")
                      : "Страны не выбраны"
                  ]
                ]}
              />

              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                <h3 className="mb-3 text-[14px] font-semibold text-white">Платформы распространения</h3>
                <p className="text-[13px] text-white/80">
                  Количество платформ: <span className="text-white">{details.release.platforms.count}</span>
                </p>
                <button
                  type="button"
                  onClick={() => setPlatformsOpen((prev) => !prev)}
                  className="mt-2 inline-flex items-center gap-1 text-[12px] text-[#b395ff] hover:text-[#cab6ff]"
                >
                  {platformsOpen ? "Скрыть список" : "Показать список"}
                  <ChevronDown className={`h-3.5 w-3.5 transition ${platformsOpen ? "rotate-180" : ""}`} />
                </button>
                {platformsOpen ? (
                  <p className="mt-2 text-[12px] text-white/70">
                    {details.release.platforms.names.length > 0
                      ? details.release.platforms.names.join(", ")
                      : "Площадки не выбраны"}
                  </p>
                ) : null}
              </div>

              <InfoSection
                title="Дополнительные настройки"
                rows={[
                  ["Ранний старт в России", boolView(details.release.settings.early_russia_start)],
                  ["Доставка в реальном времени", boolView(details.release.settings.real_time_delivery)],
                  [
                    "Яндекс Музыка: Скоро новый релиз",
                    details.release.settings.yandex_pre_release_date
                      ? details.release.settings.yandex_pre_release_date
                      : "❌"
                  ]
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null || !canApprove}
          onClick={() => {
            setApproveOpen(true);
            setError(null);
          }}
          className="inline-flex h-10 items-center gap-1 rounded-lg bg-emerald-500/90 px-3 text-[13px] font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-50"
        >
          <Check className="h-4 w-4" />
          Принять
        </button>
        <button
          type="button"
          disabled={busy !== null || !canReject}
          onClick={() => {
            setRejectOpen(true);
            setError(null);
          }}
          className="inline-flex h-10 items-center gap-1 rounded-lg bg-rose-500/90 px-3 text-[13px] font-semibold text-black transition hover:bg-rose-400 disabled:opacity-50"
        >
          <X className="h-4 w-4" />
          Отклонить
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            void togglePaymentStatus(details.payment_status !== "paid");
          }}
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 text-[13px] font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:opacity-50"
        >
          <CheckCircle2 className="h-4 w-4" />
          {details.payment_status === "paid" ? "Снять оплату" : "Отметить как оплачено"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            setDeleteOpen(true);
            setError(null);
          }}
          className="inline-flex h-10 items-center gap-1 rounded-lg border border-white/[0.14] bg-white/[0.04] px-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Удалить
        </button>
        <Link
          href="/admin/releases"
          className="inline-flex h-10 items-center rounded-lg border border-white/[0.14] bg-white/[0.04] px-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.08]"
        >
          Назад к списку
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-[20px] font-semibold text-white">Список треков</h2>
        {details.tracks.map((track, index) => {
          const trackDraft = trackDrafts[track.id] ?? buildTrackDraft(track);
          const trackEditing = editingTrackId === track.id;
          const hasAudioDownload = Boolean(track.files.audio.download_url);
          const audioUploadLabel = track.files.audio.available ? "Заменить аудио" : "Загрузить аудио";
          const lyricsText = track.raw_commentary.lyrics.trim();
          const hasLyricsText = lyricsText.length > 0;
          const downloadableFiles = fileActions([
            { label: "Скачать аудио", file: track.files.audio },
            { label: "Скачать синхронизированный текст", file: track.files.text },
            { label: "Скачать рингтон", file: track.files.karaoke },
            { label: "Скачать видео", file: track.files.video_shot },
            { label: "Скачать video clip", file: track.files.video_clip }
          ]).filter((entry) => Boolean(entry.file.download_url));

          return (
            <article
              key={track.id}
              className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#171929]/80 via-[#14151d]/95 to-[#111219]/95 p-5"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-2">
                  <p className="text-[16px] font-semibold text-white">
                    {index + 1}. {toDash(track.title)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/55">
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1">
                      Длительность: {formatDuration(track.duration_sec)}
                    </span>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1">
                      ISRC: {toDash(track.identification.isrc)}
                    </span>
                    <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1">
                      Язык: {toDash(track.usage.metadata_language)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TrackFileIcon label="Аудио" ok={track.files.audio.available} icon={<Music2 className="h-3.5 w-3.5" />} />
                  <TrackFileIcon label="Синх. текст" ok={track.files.text.available} icon={<FileText className="h-3.5 w-3.5" />} />
                  <TrackFileIcon label="Рингтон" ok={track.files.karaoke.available} icon={<Music2 className="h-3.5 w-3.5" />} />
                  <TrackFileIcon label="Видео" ok={track.files.video_shot.available} icon={<Video className="h-3.5 w-3.5" />} />
                  <TrackFileIcon label="Video clip" ok={track.files.video_clip.available} icon={<Video className="h-3.5 w-3.5" />} />
                  {hasLyricsText ? (
                    <button
                      type="button"
                      onClick={() => setLyricsModal({ title: track.title.trim() || `Трек ${index + 1}`, lyrics: lyricsText })}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#7b3df5]/40 bg-[#7b3df5]/12 px-3 text-[12px] font-semibold text-[#d7cbff] transition hover:bg-[#7b3df5]/20"
                    >
                      <ScrollText className="h-3.5 w-3.5" />
                      Текст
                    </button>
                  ) : null}
                  {downloadableFiles.length === 1 ? (
                    <a
                      href={downloadableFiles[0]?.file.download_url ?? ""}
                      download={guessDownloadName("file.bin", downloadableFiles[0]?.file.file_name)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#7b3df5] px-3 text-[12px] font-semibold text-white transition hover:bg-[#8f5bf7]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Скачать
                    </a>
                  ) : downloadableFiles.length > 1 ? (
                    <details className="group relative">
                      <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1 rounded-lg bg-[#7b3df5] px-3 text-[12px] font-semibold text-white transition hover:bg-[#8f5bf7]">
                        <Download className="h-3.5 w-3.5" />
                        Скачать
                      </summary>
                      <div className="absolute right-0 top-10 z-10 min-w-[190px] rounded-lg border border-white/[0.12] bg-[#181a24] p-1 shadow-xl">
                        {downloadableFiles.map((item) => (
                          <a
                            key={`${track.id}-${item.label}`}
                            href={item.file.download_url ?? ""}
                            download={guessDownloadName("file.bin", item.file.file_name)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-md px-2.5 py-1.5 text-[12px] text-white/85 hover:bg-white/[0.06]"
                          >
                            {item.label}
                          </a>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  <ReleaseAudioUploadButton
                    releaseId={details.id}
                    trackId={track.id}
                    label={audioUploadLabel}
                    className="mt-1"
                    onUploaded={() => {
                      router.refresh();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setTrackDrafts((current) => ({ ...current, [track.id]: current[track.id] ?? buildTrackDraft(track) }));
                      setEditingTrackId((current) => (current === track.id ? null : track.id));
                      setError(null);
                    }}
                    disabled={busy !== null}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-[12px] font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {trackEditing ? "Скрыть редактор" : "Редактировать трек"}
                  </button>
                </div>
              </div>
              {getTrackDiagnosis(track.id, track.files.audio.diagnosis ?? undefined) ? (
                <MediaDiagnosisCard
                  className="mb-4"
                  diagnosis={getTrackDiagnosis(track.id, track.files.audio.diagnosis ?? undefined)!}
                  actionLabel="Перепривязать аудио"
                  actionBusy={repairBusyKey === `track:${track.id}`}
                  onAction={
                    getTrackDiagnosis(track.id, track.files.audio.diagnosis ?? undefined)
                      ?.suggested_storage_key
                      ? () =>
                          void repairMediaBinding({
                            key: `track:${track.id}`,
                            target: "track_audio",
                            trackId: track.id,
                            storageKey:
                              getTrackDiagnosis(track.id, track.files.audio.diagnosis ?? undefined)!
                                .suggested_storage_key!
                          })
                      : undefined
                  }
                />
              ) : null}
              {!hasAudioDownload ? (
                <p className="mb-4 rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[12px] font-medium text-amber-100/95">
                  Аудиофайл не загружен в хранилище. Скачивание недоступно.
                </p>
              ) : null}

              {trackEditing ? (
                <div className="mb-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="block">
                      <span className="mb-1 block text-[12px] text-white/60">Название трека</span>
                      <input
                        value={trackDraft.title}
                        onChange={(event) =>
                          setTrackDrafts((current) => ({
                            ...current,
                            [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), title: event.target.value }
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none transition focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[12px] text-white/60">Подзаголовок трека</span>
                      <input
                        value={trackDraft.subtitle}
                        onChange={(event) =>
                          setTrackDrafts((current) => ({
                            ...current,
                            [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), subtitle: event.target.value }
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[14px] text-white outline-none transition focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
                      />
                    </label>
                    <RoleInput label="Исполнитель(и)" value={trackDraft.performers} onChange={(value) => setTrackDrafts((current) => ({ ...current, [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), performers: value } }))} />
                    <RoleInput label="feat(s)" value={trackDraft.feats} onChange={(value) => setTrackDrafts((current) => ({ ...current, [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), feats: value } }))} />
                    <RoleInput label="remixer" value={trackDraft.remixers} onChange={(value) => setTrackDrafts((current) => ({ ...current, [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), remixers: value } }))} />
                    <RoleInput label="соисполнитель" value={trackDraft.coPerformers} onChange={(value) => setTrackDrafts((current) => ({ ...current, [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), coPerformers: value } }))} />
                    <RoleInput label="продюсер" value={trackDraft.producers} onChange={(value) => setTrackDrafts((current) => ({ ...current, [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), producers: value } }))} />
                    <RoleInput label="автор(ы) музыки" value={trackDraft.musicAuthors} onChange={(value) => setTrackDrafts((current) => ({ ...current, [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), musicAuthors: value } }))} />
                    <RoleInput label="автор(ы) слов" value={trackDraft.lyricsAuthors} onChange={(value) => setTrackDrafts((current) => ({ ...current, [track.id]: { ...(current[track.id] ?? buildTrackDraft(track)), lyricsAuthors: value } }))} />
                  </div>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <InfoSection
                  title="Общая информация о треке"
                  rows={[
                    ["Название трека", toDash(track.title)],
                    ["Подзаголовок трека", toDash(track.subtitle)],
                    ["Длительность", formatDuration(track.duration_sec)],
                    ["Текст трека", hasLyricsText ? "Доступен по кнопке «Текст»" : "Не добавлен"]
                  ]}
                />
                <InfoSection
                  title="Идентификация"
                  rows={[
                    ["ISRC", toDash(track.identification.isrc)],
                    ["Код партнёра", toDash(track.identification.partner_code)]
                  ]}
                />
                <InfoSection
                  title="Персоны и роли"
                  rows={[
                    ["Исполнитель(и)", toList(track.track_roles.performers)],
                    ["feat(s)", toList(track.track_roles.feats)],
                    ["remixer", toList(track.track_roles.remixers)],
                    ["соисполнитель", toList(track.track_roles.coPerformers)],
                    ["продюсер", toList(track.track_roles.producers)],
                    ["автор(ы) музыки", toList(track.track_roles.musicAuthors)],
                    ["автор(ы) слов", toList(track.track_roles.lyricsAuthors)]
                  ]}
                />
                <InfoSection
                  title="Права"
                  rows={[
                    ["Авторские права %", String(track.rights.copyright_pct ?? "-")],
                    ["Смежные права %", String(track.rights.related_rights_pct ?? "-")]
                  ]}
                />
                <InfoSection
                  title="Дополнительные параметры"
                  rows={[
                    ["Начало предпрослушивания", toDash(track.additional.preview_start)],
                    ["Instant gratification", boolView(track.additional.instant_gratification)],
                    ["Focus track", boolView(track.additional.focus_track)]
                  ]}
                />
                <InfoSection
                  title="Версия трека"
                  rows={[
                    ["Explicit content", boolView(track.version.explicit)],
                    [
                      "Упоминание наркотических/психотропных веществ",
                      boolView(track.version.drug_reference)
                    ],
                    ["Live", boolView(track.version.live)],
                    ["Cover", boolView(track.version.cover)],
                    ["Remix", boolView(track.version.remix)],
                    ["Instrumental", boolView(track.version.instrumental)]
                  ]}
                />
                <InfoSection
                  title="Использование ИИ"
                  rows={[
                    ["Использование ИИ", boolView(track.ai_usage.used)],
                    [
                      "Трек полностью сгенерирован ИИ (текст + музыка)",
                      boolView(track.ai_usage.generated_full_track)
                    ],
                    [
                      "ИИ использован только для генерации музыки",
                      boolView(track.ai_usage.generated_music_only)
                    ],
                    [
                      "ИИ использован только для генерации текста",
                      boolView(track.ai_usage.generated_lyrics_only)
                    ],
                    [
                      "ИИ использован только для обработки трека",
                      boolView(track.ai_usage.processed_track_only)
                    ]
                  ]}
                />
                <InfoSection
                  title="Виды использования"
                  rows={[["Язык метаданных", toDash(track.usage.metadata_language)]]}
                />
              </div>
            </article>
          );
        })}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-5">
        <h2 className="text-[18px] font-semibold text-white">Комментарий</h2>
        <p className="mt-2 whitespace-pre-wrap text-[14px] text-white/80">
          {details.comment || "Комментарий не оставлен"}
        </p>
      </section>

      {approveOpen ? (
        <ModalCard
          title="Принять релиз"
          subtitle="Укажите UPC-код перед подтверждением."
          onCancel={() => setApproveOpen(false)}
          confirmLabel="Подтвердить принятие"
          confirmBusy={busy === "approve"}
          onConfirm={() => {
            void approve();
          }}
        >
          <input
            value={upc}
            onChange={(event) => setUpc(event.target.value)}
            className="h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            placeholder="5063635661195"
          />
        </ModalCard>
      ) : null}

      {rejectOpen ? (
        <ModalCard
          title="Отклонить релиз"
          subtitle="Причина обязательна."
          onCancel={() => setRejectOpen(false)}
          confirmLabel="Подтвердить отклонение"
          confirmBusy={busy === "reject"}
          onConfirm={() => {
            void reject();
          }}
          confirmTone="danger"
        >
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            className="w-full resize-none rounded-xl border border-white/[0.12] bg-black/25 px-3 py-2 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
            placeholder="Нужно заменить обложку: плохое качество изображения."
          />
        </ModalCard>
      ) : null}

      {deleteOpen ? (
        <ModalCard
          title="Удалить релиз"
          subtitle="Вы уверены? Релиз будет полностью удалён из базы данных. Это действие нельзя отменить."
          onCancel={() => setDeleteOpen(false)}
          confirmLabel="Подтвердить удаление"
          confirmBusy={busy === "delete"}
          onConfirm={() => {
            void remove();
          }}
          confirmTone="danger"
        />
      ) : null}

      {lyricsModal ? (
        <ModalCard
          title={`Текст трека: ${lyricsModal.title}`}
          subtitle="Полный текст трека"
          onCancel={() => setLyricsModal(null)}
          onConfirm={() => setLyricsModal(null)}
          confirmLabel="Закрыть"
          confirmBusy={false}
          cancelLabel="Закрыть"
          hideConfirm
        >
          <div className="max-h-[65vh] overflow-y-auto rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3">
            <p className="whitespace-pre-wrap break-words text-[15px] leading-8 text-white/92">
              {lyricsModal.lyrics}
            </p>
          </div>
        </ModalCard>
      ) : null}
    </div>
  );
}

function TrackFileIcon({
  label,
  ok,
  icon
}: {
  label: string;
  ok: boolean;
  icon: React.ReactNode;
}) {
  return (
    <span
      title={label}
      className={`inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border px-2 text-[11px] ${
        ok
          ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-200"
          : "border-rose-400/25 bg-rose-500/10 text-rose-200"
      }`}
    >
      {icon}
    </span>
  );
}

function InfoSection({
  title,
  rows
}: {
  title: string;
  rows: Array<[string, React.ReactNode]>;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-black/20 p-4">
      <h3 className="mb-3 text-[14px] font-semibold text-white">{title}</h3>
      <div className="space-y-1.5 text-[13px]">
        {rows.map(([label, value]) => (
          <p key={label} className="leading-snug">
            <span className="text-white/50">{label}: </span>
            <span className="text-white/88">{value}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

function MediaDiagnosisCard({
  diagnosis,
  onAction,
  actionLabel,
  actionBusy,
  className
}: {
  diagnosis: MediaDiagnosisSummary;
  onAction?: () => void;
  actionLabel?: string;
  actionBusy?: boolean;
  className?: string;
}) {
  const tone =
    diagnosis.status === "ok"
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
      : diagnosis.suggested_storage_key
        ? "border-sky-400/25 bg-sky-500/10 text-sky-100"
        : "border-amber-300/25 bg-amber-400/10 text-amber-100";

  return (
    <div className={`rounded-xl border px-3 py-2 text-[12px] ${tone} ${className ?? ""}`}>
      <p className="font-semibold">{diagnosis.label}</p>
      <p className="mt-1 opacity-90">{diagnosis.message}</p>
      {diagnosis.storage_key ? (
        <p className="mt-2 break-all opacity-75">Текущий key: {diagnosis.storage_key}</p>
      ) : null}
      {diagnosis.suggested_storage_key ? (
        <p className="mt-1 break-all opacity-75">Найденный key: {diagnosis.suggested_storage_key}</p>
      ) : null}
      {diagnosis.suggested_ambiguous && !diagnosis.suggested_storage_key ? (
        <p className="mt-1 opacity-75">Найдено несколько кандидатов. Нужна ручная проверка.</p>
      ) : null}
      {onAction && diagnosis.suggested_storage_key ? (
        <button
          type="button"
          onClick={onAction}
          disabled={actionBusy}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {actionBusy ? "Перепривязываем..." : (actionLabel ?? "Перепривязать")}
        </button>
      ) : null}
    </div>
  );
}

function RoleInput({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-white/60">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        placeholder="Введите через запятую"
        className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[14px] text-white outline-none transition placeholder:text-white/28 focus:border-[#7b3df5]/60 focus:bg-white/[0.06]"
      />
    </label>
  );
}

function ModalCard({
  title,
  subtitle,
  children,
  onCancel,
  onConfirm,
  confirmLabel,
  confirmBusy,
  confirmTone = "primary",
  cancelLabel = "Отмена",
  hideConfirm = false
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmBusy: boolean;
  confirmTone?: "primary" | "danger";
  cancelLabel?: string;
  hideConfirm?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl rounded-2xl border border-white/[0.1] bg-[#14151d] p-5">
        <h2 className="text-[19px] font-semibold text-white">{title}</h2>
        <p className="mt-1 text-[13px] text-white/65">{subtitle}</p>
        {children ? <div className="mt-3">{children}</div> : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/[0.12] px-3 py-2 text-[13px] text-white/80"
          >
            {cancelLabel}
          </button>
          {hideConfirm ? null : (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmBusy}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[13px] font-semibold text-black disabled:opacity-40 ${
                confirmTone === "danger" ? "bg-rose-500" : "bg-emerald-500"
              }`}
            >
              {confirmBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
