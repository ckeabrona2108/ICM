"use client";

import Link from "next/link";
import * as React from "react";

interface AdminNewsPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  status: "draft" | "published" | "archived";
  category: string | null;
  is_pinned: boolean;
  published_at: string | null;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

export function AdminNewsClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<AdminNewsPost[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/news", { method: "GET" });
      const payload = (await response.json().catch(() => null)) as
        | { items?: AdminNewsPost[]; error?: string }
        | null;
      if (!response.ok || !payload?.items) {
        throw new Error(payload?.error ?? "Не удалось загрузить новости");
      }
      setItems(payload.items);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить новости");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function callAction(url: string, method: "POST" | "DELETE") {
    setError(null);
    const response = await fetch(url, { method });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? "Не удалось выполнить действие");
    }
  }

  async function publish(id: string) {
    try {
      await callAction(`/api/admin/news/${id}/publish`, "POST");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось опубликовать");
    }
  }

  async function unpublish(id: string) {
    try {
      await callAction(`/api/admin/news/${id}/unpublish`, "POST");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось снять с публикации");
    }
  }

  async function pin(id: string) {
    try {
      await callAction(`/api/admin/news/${id}/pin`, "POST");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось закрепить");
    }
  }

  async function unpin(id: string) {
    try {
      await callAction(`/api/admin/news/${id}/unpin`, "POST");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось открепить");
    }
  }

  async function archive(id: string) {
    try {
      await callAction(`/api/admin/news/${id}`, "DELETE");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось архивировать");
    }
  }

  async function remove(id: string) {
    const yes = window.confirm("Удалить новость безвозвратно?");
    if (!yes) return;
    try {
      await callAction(`/api/admin/news/${id}?mode=delete`, "DELETE");
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось удалить");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-white">Новости</h1>
          <p className="mt-1 text-[14px] text-white/65">
            Управление новостями сервиса: draft/published/archived, закрепление и публикация.
          </p>
        </div>
        <Link
          href="/admin/news/new"
          className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/15"
        >
          Создать новость
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#14151d]">
        <table className="min-w-full text-left text-[13px] text-white/85">
          <thead className="bg-white/[0.03] text-white/60">
            <tr>
              <th className="px-3 py-2">title</th>
              <th className="px-3 py-2">category</th>
              <th className="px-3 py-2">status</th>
              <th className="px-3 py-2">is_pinned</th>
              <th className="px-3 py-2">published_at</th>
              <th className="px-3 py-2">created_at</th>
              <th className="px-3 py-2">actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-white/65">
                  Загружаем новости...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-white/65">
                  Новостей пока нет.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-white/10 align-top">
                  <td className="px-3 py-2">
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="mt-0.5 text-[11px] text-white/45">/{item.slug}</p>
                  </td>
                  <td className="px-3 py-2">{item.category ?? "—"}</td>
                  <td className="px-3 py-2">{item.status}</td>
                  <td className="px-3 py-2">{item.is_pinned ? "yes" : "no"}</td>
                  <td className="px-3 py-2">{formatDate(item.published_at)}</td>
                  <td className="px-3 py-2">{formatDate(item.created_at)}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        href={`/admin/news/${item.id}/edit`}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10"
                      >
                        edit
                      </Link>
                      {item.status !== "published" ? (
                        <button
                          type="button"
                          onClick={() => {
                            void publish(item.id);
                          }}
                          className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200"
                        >
                          publish
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            void unpublish(item.id);
                          }}
                          className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200"
                        >
                          unpublish
                        </button>
                      )}
                      {!item.is_pinned ? (
                        <button
                          type="button"
                          onClick={() => {
                            void pin(item.id);
                          }}
                          className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200"
                        >
                          pin
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            void unpin(item.id);
                          }}
                          className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[11px] text-cyan-200"
                        >
                          unpin
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          void archive(item.id);
                        }}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10"
                      >
                        archive
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void remove(item.id);
                        }}
                        className="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200"
                      >
                        delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
