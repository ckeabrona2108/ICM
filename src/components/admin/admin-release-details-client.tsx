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

import { StatusBadge } from "@/components/releases/status-badge";

interface AdminReleaseDetailsResponse {
  id: string;
  status: string;
  payment_status: string;
  payment_label?: string;
  payment_usage?: string | null;
  payment_plan?: "STANDARD" | "PRO" | "ENTERPRISE" | null;
  priority: boolean;
  cover: {
    url: string;
    download_url: string | null;
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
}

type ActionKind = "approve" | "reject" | "delete";

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
  const canModerate = details.status === "moderation";
  const [busy, setBusy] = React.useState<ActionKind | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [upc, setUpc] = React.useState(details.release.upc && details.release.upc !== "-" ? details.release.upc : "");
  const [reason, setReason] = React.useState("");
  const [platformsOpen, setPlatformsOpen] = React.useState(false);
  const [lyricsModal, setLyricsModal] = React.useState<{ title: string; lyrics: string } | null>(null);

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

  return (
    <div className="space-y-6 pb-10">
      <div className="rounded-3xl border border-white/[0.08] bg-gradient-to-br from-[#181b2a]/90 via-[#15161d]/95 to-[#12131a]/95 p-5 shadow-[0_10px_40px_-20px_rgba(123,61,245,0.55)]">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          <div>
            <div className="relative h-[220px] w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
              {details.cover.url ? (
                <img src={details.cover.url} alt={details.release.title} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-[12px] text-white/50">
                  Без обложки
                </div>
              )}
            </div>
            {details.cover.download_url ? (
              <a
                href={details.cover.download_url}
                download={guessDownloadName("cover.jpg", details.cover.url.split("/").pop())}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1 rounded-xl bg-[#7b3df5] px-3 text-[13px] font-semibold text-white transition hover:bg-[#8f5bf7]"
              >
                <Download className="h-4 w-4" />
                Скачать обложку
              </a>
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
          disabled={busy !== null || !canModerate}
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
          disabled={busy !== null || !canModerate}
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
          const hasAudioDownload = Boolean(track.files.audio.download_url);
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
                </div>
              </div>
              {!hasAudioDownload ? (
                <p className="mb-4 rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[12px] font-medium text-amber-100/95">
                  Аудиофайл не загружен в хранилище. Скачивание недоступно.
                </p>
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
                    ["Live", boolView(track.version.live)],
                    ["Cover", boolView(track.version.cover)],
                    ["Remix", boolView(track.version.remix)],
                    ["Instrumental", boolView(track.version.instrumental)]
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
