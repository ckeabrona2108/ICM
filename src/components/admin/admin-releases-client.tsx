"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/releases/status-badge";
import type { AdminReleaseDetails } from "@/lib/admin-data";
import { normalizeNextImageSrc } from "@/lib/image-src";

type AdminReleaseTab =
  | "moderation"
  | "pending_verification"
  | "all"
  | "approved"
  | "rejected";

const TAB_LABELS: Record<AdminReleaseTab, string> = {
  moderation: "На модерации",
  pending_verification: "Ожидает верификацию",
  all: "Все",
  approved: "Принятые",
  rejected: "Отклонённые"
};

export function AdminReleasesClient({
  initialReleases,
  initialTab = "moderation"
}: {
  initialReleases?: AdminReleaseDetails[];
  initialTab?: AdminReleaseTab;
}) {
  const [tab, setTab] = React.useState<AdminReleaseTab>(initialTab);
  const [releases, setReleases] = React.useState<AdminReleaseDetails[]>(initialReleases ?? []);
  const [loading, setLoading] = React.useState(!initialReleases);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [coverIndexById, setCoverIndexById] = React.useState<Record<string, number>>({});

  const [rejectModal, setRejectModal] = React.useState<{
    open: boolean;
    release: AdminReleaseDetails | null;
    reason: string;
    error: string | null;
  }>({
    open: false,
    release: null,
    reason: "",
    error: null
  });

  const [deleteModal, setDeleteModal] = React.useState<{
    open: boolean;
    release: AdminReleaseDetails | null;
    error: string | null;
  }>({
    open: false,
    release: null,
    error: null
  });

  const [approveModal, setApproveModal] = React.useState<{
    open: boolean;
    release: AdminReleaseDetails | null;
    upc: string;
    error: string | null;
  }>({
    open: false,
    release: null,
    upc: "",
    error: null
  });

  const loadReleases = React.useCallback(async (nextTab: AdminReleaseTab) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases?status=${nextTab}`, { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | { releases?: AdminReleaseDetails[]; error?: string }
        | null;
      if (!response.ok || !payload?.releases) {
        throw new Error(payload?.error ?? "Не удалось загрузить релизы.");
      }
      setReleases(payload.releases);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить релизы.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (initialReleases && tab === initialTab) return;
    void loadReleases(tab);
  }, [initialReleases, initialTab, loadReleases, tab]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  async function submitApprove() {
    if (!approveModal.release) return;
    const upc = approveModal.upc.trim();
    if (!/^\d{12,14}$/u.test(upc)) {
      setApproveModal((prev) => ({ ...prev, error: "UPC должен содержать 12-14 цифр." }));
      return;
    }

    setBusyId(approveModal.release.id);
    setApproveModal((prev) => ({ ...prev, error: null }));
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${approveModal.release.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upc })
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось принять релиз.");
      }

      setApproveModal({ open: false, release: null, upc: "", error: null });
      setToast("Релиз принят.");
      await loadReleases(tab);
    } catch (approveError) {
      const message = approveError instanceof Error ? approveError.message : "Не удалось принять релиз.";
      setApproveModal((prev) => ({ ...prev, error: message }));
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject() {
    if (!rejectModal.release) return;
    const reason = rejectModal.reason.trim();
    if (!reason) {
      setRejectModal((prev) => ({ ...prev, error: "Причина отклонения обязательна." }));
      return;
    }

    setBusyId(rejectModal.release.id);
    setRejectModal((prev) => ({ ...prev, error: null }));
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${rejectModal.release.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось отклонить релиз.");
      }

      setRejectModal({ open: false, release: null, reason: "", error: null });
      setToast("Релиз отклонён.");
      await loadReleases(tab);
    } catch (rejectError) {
      const message = rejectError instanceof Error ? rejectError.message : "Не удалось отклонить релиз.";
      setRejectModal((prev) => ({ ...prev, error: message }));
    } finally {
      setBusyId(null);
    }
  }

  async function submitDelete() {
    if (!deleteModal.release) return;

    setBusyId(deleteModal.release.id);
    setDeleteModal((prev) => ({ ...prev, error: null }));
    setError(null);
    try {
      const response = await fetch(`/api/admin/releases/${deleteModal.release.id}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось удалить релиз.");
      }

      const deletedId = deleteModal.release.id;
      setReleases((prev) => prev.filter((item) => item.id !== deletedId));
      setDeleteModal({ open: false, release: null, error: null });
      setToast("Релиз удалён.");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Не удалось удалить релиз.";
      setDeleteModal((prev) => ({ ...prev, error: message }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white sm:text-[26px]">Релизы</h1>
      <p className="mt-2 max-w-3xl text-[14px] text-white/65">
        Управление релизами: принятие, отклонение с причиной и полное удаление.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as AdminReleaseTab[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
              tab === value
                ? "border-[#7b3df5]/40 bg-[#7b3df5]/20 text-white"
                : "border-white/[0.1] bg-white/[0.04] text-white/75 hover:bg-white/[0.08]"
            )}
          >
            {TAB_LABELS[value]}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-[14px] text-white/70">
          <Loader2 className="h-4 w-4 animate-spin text-[#a78bfa]" />
          Загружаем релизы...
        </div>
      ) : releases.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#15161d]/90 px-5 py-6 text-[14px] text-white/65">
          В этом разделе релизов нет.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {releases.map((release) => {
            const canApprove = release.status === "moderation";
            const canReject = release.status === "moderation";
            const isBusy = busyId === release.id;
            const coverCandidates = Array.from(
              new Set(
                [release.coverUrl, ...(release.coverUrlCandidates ?? [])]
                  .map((item) => normalizeNextImageSrc(item))
                  .filter((item): item is string => Boolean(item))
              )
            );
            const coverIndex = coverIndexById[release.id] ?? 0;
            const safeCoverUrl = coverCandidates[coverIndex] ?? null;

            return (
              <article
                key={release.id}
                className="rounded-2xl border border-white/[0.07] bg-[#15161d]/90 p-4"
              >
                <div className="flex flex-wrap gap-4">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-white/10">
                    {safeCoverUrl ? (
                      <img
                        src={safeCoverUrl}
                        alt={release.title}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={() =>
                          setCoverIndexById((prev) => ({
                            ...prev,
                            [release.id]:
                              coverIndex + 1 <= coverCandidates.length ? coverIndex + 1 : coverIndex
                          }))
                        }
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center bg-white/[0.03] text-[11px] text-white/45">
                        Нет обложки
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/releases/${release.id}`}
                      className="truncate text-[18px] font-semibold text-white transition hover:text-indigo-300"
                    >
                      {release.title}
                    </Link>
                    <p className="mt-1 truncate text-[13px] text-white/60">{release.subtitle || "—"}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={release.status} />
                      <span
                        className={
                          release.paymentKind === "subscription"
                            ? "inline-flex items-center rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200"
                            : release.paid
                            ? "inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200"
                            : "inline-flex items-center rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200"
                        }
                      >
                        {release.paymentLabel ?? (release.paid ? "Оплачен" : "Не оплачен")}
                      </span>
                      {release.priority ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                          Приоритетный
                        </span>
                      ) : null}
                      {release.rejectedAt ? (
                        <span className="text-[12px] text-white/55">Отклонён: {release.rejectedAt}</span>
                      ) : null}
                      {release.approvedAt ? (
                        <span className="text-[12px] text-white/55">Принят: {release.approvedAt}</span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[12.5px] text-white/65 sm:grid-cols-4">
                      <p>Артист: <span className="text-white/85">{release.artists || "—"}</span></p>
                      <p>UPC: <span className="text-white/85">{release.upc || "—"}</span></p>
                      <p>Жанр: <span className="text-white/85">{release.genre}</span></p>
                      <p>Дата релиза: <span className="text-white/85">{release.releaseDate}</span></p>
                      <p>Площадки: <span className="text-white/85">{release.platformsCount}</span></p>
                    </div>
                    {release.status === "rejected" ? (
                      <div className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-100">
                        <p className="font-medium">Релиз отклонён</p>
                        <p className="mt-1">
                          Причина: {release.rejectionReason || release.moderationComment || "Не указана"}
                        </p>
                      </div>
                    ) : null}
                    {release.status === "pending_verification" ? (
                      <div className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-[13px] text-cyan-100">
                        Релиз будет доступен для модерации после подтверждения верификации пользователя.
                      </div>
                    ) : null}
                  </div>
                  <div className="ml-auto flex flex-col gap-2">
                    <Link
                      href={`/admin/releases/${release.id}`}
                      className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-3 text-[13px] font-semibold text-indigo-100 transition hover:bg-indigo-500/25"
                    >
                      Открыть
                    </Link>
                    <button
                      type="button"
                      disabled={!canApprove || isBusy}
                      onClick={() => {
                        setApproveModal({
                          open: true,
                          release,
                          upc: release.upc || "",
                          error: null
                        });
                      }}
                      className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-emerald-500/90 px-3 text-[13px] font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                      Принять
                    </button>
                    <button
                      type="button"
                      disabled={!canReject || isBusy}
                      onClick={() => {
                        setRejectModal({ open: true, release, reason: "", error: null });
                      }}
                      className="inline-flex h-10 items-center justify-center gap-1 rounded-lg bg-rose-500/90 px-3 text-[13px] font-semibold text-black transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <X className="h-4 w-4" />
                      Отклонить
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        setDeleteModal({ open: true, release, error: null });
                      }}
                      className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-white/[0.14] bg-white/[0.04] px-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                      Удалить
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rejectModal.open && rejectModal.release ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/[0.1] bg-[#14151d] p-5">
            <h2 className="text-[19px] font-semibold text-white">Отклонить релиз</h2>
            <p className="mt-1 text-[13px] text-white/60">
              Причина обязательна. Релиз перейдёт в «Требуются изменения».
            </p>
            <textarea
              value={rejectModal.reason}
              onChange={(event) =>
                setRejectModal((prev) => ({ ...prev, reason: event.target.value, error: null }))
              }
              rows={4}
              className="mt-3 w-full resize-none rounded-xl border border-white/[0.12] bg-black/25 px-3 py-2 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
              placeholder="Причина отклонения"
            />
            {rejectModal.error ? (
              <p className="mt-2 text-[12.5px] text-rose-300">{rejectModal.error}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectModal({ open: false, release: null, reason: "", error: null })}
                className="rounded-lg border border-white/[0.12] px-3 py-2 text-[13px] text-white/80"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  void submitReject();
                }}
                disabled={busyId === rejectModal.release.id}
                className="rounded-lg bg-rose-500 px-3 py-2 text-[13px] font-semibold text-black disabled:opacity-40"
              >
                Подтвердить отклонение
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approveModal.open && approveModal.release ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-white/[0.1] bg-[#14151d] p-5">
            <h2 className="text-[19px] font-semibold text-white">Принять релиз</h2>
            <p className="mt-1 text-[13px] text-white/60">
              Для принятия обязательно укажите UPC (12-14 цифр).
            </p>
            <input
              value={approveModal.upc}
              onChange={(event) =>
                setApproveModal((prev) => ({ ...prev, upc: event.target.value, error: null }))
              }
              className="mt-3 h-11 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] text-white outline-none focus:border-[#7b3df5]/60"
              placeholder="5063635661195"
            />
            {approveModal.error ? (
              <p className="mt-2 text-[12.5px] text-rose-300">{approveModal.error}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setApproveModal({ open: false, release: null, upc: "", error: null })}
                className="rounded-lg border border-white/[0.12] px-3 py-2 text-[13px] text-white/80"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  void submitApprove();
                }}
                disabled={busyId === approveModal.release.id}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-[13px] font-semibold text-black disabled:opacity-40"
              >
                Подтвердить принятие
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModal.open && deleteModal.release ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#14151d] p-5">
            <h2 className="text-[19px] font-semibold text-white">Удалить релиз безвозвратно?</h2>
            <p className="mt-2 text-[13px] text-white/60">
              Релиз и связанные сущности будут удалены из базы данных.
            </p>
            {deleteModal.error ? (
              <p className="mt-2 text-[12.5px] text-rose-300">{deleteModal.error}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteModal({ open: false, release: null, error: null })}
                className="rounded-lg border border-white/[0.12] px-3 py-2 text-[13px] text-white/80"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  void submitDelete();
                }}
                disabled={busyId === deleteModal.release.id}
                className="rounded-lg bg-rose-500 px-3 py-2 text-[13px] font-semibold text-black disabled:opacity-40"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-100">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
