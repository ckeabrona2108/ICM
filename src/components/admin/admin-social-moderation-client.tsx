"use client";

import * as React from "react";

import type {
  AdminModerationPost,
  AdminSocialReport,
  AdminSocialReportStatus
} from "@/lib/admin-social-moderation-service";

interface AdminSocialModerationData {
  reports: AdminSocialReport[];
  posts: AdminModerationPost[];
}

const REPORT_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает",
  reviewing: "В работе",
  resolved: "Решено",
  dismissed: "Отклонено"
};

const REPORT_REASON_LABELS: Record<string, string> = {
  spam: "Спам",
  harassment: "Оскорбления",
  hate: "Ненависть",
  impersonation: "Выдаёт себя за другого",
  privacy: "Личные данные",
  illegal: "Незаконный контент",
  other: "Другое"
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

function truncate(value: string, max = 180) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= max) return normalized || "Без текста";
  return `${normalized.slice(0, max - 1)}…`;
}

export function AdminSocialModerationClient({ initialData }: { initialData: AdminSocialModerationData }) {
  const [reports, setReports] = React.useState(initialData.reports);
  const [posts, setPosts] = React.useState(initialData.posts);
  const [error, setError] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);

  async function callJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!response.ok || !payload) {
      throw new Error(payload?.error ?? "Не удалось выполнить действие");
    }
    return payload;
  }

  async function hidePost(postId: string) {
    setError(null);
    setBusyKey(`hide:${postId}`);
    try {
      const payload = await callJson<{ item: AdminModerationPost }>(`/api/admin/social/posts/${postId}/hide`, {
        method: "POST"
      });
      setPosts((current) => current.map((post) => (post.id === postId ? payload.item : post)));
      setReports((current) => current.map((report) =>
        report.targetPost?.id === postId ? { ...report, targetPost: payload.item } : report
      ));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось скрыть пост");
    } finally {
      setBusyKey(null);
    }
  }

  async function restorePost(postId: string) {
    setError(null);
    setBusyKey(`restore:${postId}`);
    try {
      const payload = await callJson<{ item: AdminModerationPost }>(`/api/admin/social/posts/${postId}/hide`, {
        method: "DELETE"
      });
      setPosts((current) => current.map((post) => (post.id === postId ? payload.item : post)));
      setReports((current) => current.map((report) =>
        report.targetPost?.id === postId ? { ...report, targetPost: payload.item } : report
      ));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось вернуть пост");
    } finally {
      setBusyKey(null);
    }
  }

  async function deletePost(postId: string) {
    if (!window.confirm("Удалить публикацию безвозвратно?")) return;
    setError(null);
    setBusyKey(`delete:${postId}`);
    try {
      await callJson<{ ok: boolean }>(`/api/admin/social/posts/${postId}/delete`, { method: "DELETE" });
      setPosts((current) => current.filter((post) => post.id !== postId));
      setReports((current) => current.map((report) =>
        report.targetPost?.id === postId ? { ...report, targetPost: null } : report
      ));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось удалить пост");
    } finally {
      setBusyKey(null);
    }
  }

  async function setReportStatus(reportId: string, status: AdminSocialReportStatus) {
    setError(null);
    setBusyKey(`report:${reportId}:${status}`);
    try {
      const payload = await callJson<{ item: { id: string; status: string; updated_at: string } }>(
        `/api/admin/social/reports/${reportId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status })
        }
      );
      setReports((current) => current.map((report) =>
        report.id === reportId
          ? { ...report, status: payload.item.status, updatedAt: payload.item.updated_at }
          : report
      ));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось обновить жалобу");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6 text-white">
      <div>
        <h1 className="text-[24px] font-semibold tracking-tight">Социальная модерация</h1>
        <p className="mt-1 max-w-3xl text-[14px] leading-6 text-white/62">
          Жалобы пользователей из Collab Market и управление публикациями: скрытие убирает пост из публичной ленты,
          удаление полностью удаляет запись.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-100">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-white/10 bg-[#111522] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold">Жалобы</h2>
            <p className="mt-1 text-[13px] text-white/50">Новые жалобы приходят сюда со статусом pending.</p>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[12px] text-white/65">
            {reports.filter((report) => report.status === "pending").length} pending
          </span>
        </div>

        <div className="space-y-3">
          {reports.length ? reports.map((report) => (
            <article key={report.id} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[12px] font-semibold text-amber-100">
                      {REPORT_STATUS_LABELS[report.status] ?? report.status}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-[12px] text-white/70">
                      {report.targetType}
                    </span>
                    <span className="text-[12px] text-white/45">{formatDate(report.createdAt)}</span>
                  </div>
                  <h3 className="mt-3 text-[15px] font-semibold">
                    {REPORT_REASON_LABELS[report.reason] ?? report.reason}
                  </h3>
                  <p className="mt-1 text-[13px] leading-5 text-white/68">
                    {report.details?.trim() ? report.details : "Пользователь не добавил описание."}
                  </p>
                  <p className="mt-3 text-[12px] text-white/45">
                    Reporter: {report.reporter.name} · {report.reporter.email}
                  </p>
                  <p className="mt-1 text-[12px] text-white/45">
                    Reported: {report.reportedUser.name} · {report.reportedUser.email}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["reviewing", "resolved", "dismissed"] as AdminSocialReportStatus[]).map((status) => (
                    <button
                      key={status}
                      type="button"
                      disabled={busyKey === `report:${report.id}:${status}`}
                      onClick={() => {
                        void setReportStatus(report.id, status);
                      }}
                      className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[12px] font-semibold text-white/75 transition hover:bg-white/[0.08] disabled:opacity-50"
                    >
                      {REPORT_STATUS_LABELS[status]}
                    </button>
                  ))}
                </div>
              </div>

              {report.targetPost ? (
                <PostModerationCard
                  post={report.targetPost}
                  busyKey={busyKey}
                  compact
                  onHide={hidePost}
                  onRestore={restorePost}
                  onDelete={deletePost}
                />
              ) : (
                <div className="mt-4 rounded-xl border border-white/8 bg-black/15 px-3 py-2 text-[12px] text-white/45">
                  Целевой пост не найден или жалоба относится не к публикации.
                </div>
              )}
            </article>
          )) : (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-8 text-center text-[14px] text-white/50">
              Жалоб пока нет.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-[#111522] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
        <div className="mb-4">
          <h2 className="text-[18px] font-semibold">Последние публикации</h2>
          <p className="mt-1 text-[13px] text-white/50">Быстрое скрытие или удаление постов без ожидания жалобы.</p>
        </div>
        <div className="space-y-3">
          {posts.length ? posts.map((post) => (
            <PostModerationCard
              key={post.id}
              post={post}
              busyKey={busyKey}
              onHide={hidePost}
              onRestore={restorePost}
              onDelete={deletePost}
            />
          )) : (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-8 text-center text-[14px] text-white/50">
              Публикаций пока нет.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PostModerationCard({
  post,
  busyKey,
  compact = false,
  onHide,
  onRestore,
  onDelete
}: {
  post: AdminModerationPost;
  busyKey: string | null;
  compact?: boolean;
  onHide: (postId: string) => void;
  onRestore: (postId: string) => void;
  onDelete: (postId: string) => void;
}) {
  return (
    <div className={compact ? "mt-4 rounded-2xl border border-white/8 bg-black/15 p-3" : "rounded-2xl border border-white/8 bg-white/[0.035] p-4"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={post.hidden
              ? "rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[12px] font-semibold text-amber-100"
              : "rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[12px] font-semibold text-emerald-100"}
            >
              {post.hidden ? "Скрыт" : "Публичный"}
            </span>
            <span className="text-[12px] text-white/45">{formatDate(post.createdAt)}</span>
          </div>
          <p className="text-[14px] font-semibold text-white">{truncate(post.content)}</p>
          <p className="mt-2 text-[12px] text-white/45">
            {post.author.name} · {post.author.email} · {post.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {post.hidden ? (
            <button
              type="button"
              disabled={busyKey === `restore:${post.id}`}
              onClick={() => onRestore(post.id)}
              className="rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 py-2 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-400/15 disabled:opacity-50"
            >
              Вернуть
            </button>
          ) : (
            <button
              type="button"
              disabled={busyKey === `hide:${post.id}`}
              onClick={() => onHide(post.id)}
              className="rounded-lg border border-amber-300/25 bg-amber-400/10 px-3 py-2 text-[12px] font-semibold text-amber-100 transition hover:bg-amber-400/15 disabled:opacity-50"
            >
              Скрыть
            </button>
          )}
          <button
            type="button"
            disabled={busyKey === `delete:${post.id}`}
            onClick={() => onDelete(post.id)}
            className="rounded-lg border border-rose-300/25 bg-rose-400/10 px-3 py-2 text-[12px] font-semibold text-rose-100 transition hover:bg-rose-400/15 disabled:opacity-50"
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
