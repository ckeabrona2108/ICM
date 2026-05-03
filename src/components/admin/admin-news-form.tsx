"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
}

interface NewsFormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_image: string;
  status: "draft" | "published" | "archived";
  category: string;
  is_pinned: boolean;
  published_at: string;
}

function toDateTimeLocalValue(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapToState(initial: AdminNewsPost | null): NewsFormState {
  return {
    title: initial?.title ?? "",
    slug: initial?.slug ?? "",
    excerpt: initial?.excerpt ?? "",
    content: initial?.content ?? "",
    cover_image: initial?.cover_image ?? "",
    status: initial?.status ?? "draft",
    category: initial?.category ?? "",
    is_pinned: initial?.is_pinned ?? false,
    published_at: toDateTimeLocalValue(initial?.published_at ?? null)
  };
}

export function AdminNewsForm({ newsId }: { newsId?: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(Boolean(newsId));
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState(false);
  const [state, setState] = React.useState<NewsFormState>(() => mapToState(null));

  React.useEffect(() => {
    if (!newsId) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/news/${newsId}`, { method: "GET" });
        const payload = (await response.json().catch(() => null)) as
          | { item?: AdminNewsPost; error?: string }
          | null;
        if (!response.ok || !payload?.item) {
          throw new Error(payload?.error ?? "Не удалось загрузить новость");
        }
        if (!cancelled) {
          setState(mapToState(payload.item));
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить новость");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [newsId]);

  const onChange = (key: keyof NewsFormState, value: string | boolean) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  async function onCoverSelected(file: File | null) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Разрешены только jpg, png, webp.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Максимальный размер изображения: 5MB.");
      return;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
      reader.readAsDataURL(file);
    });

    setState((prev) => ({ ...prev, cover_image: dataUrl }));
  }

  async function save() {
    setSaving(true);
    setError(null);

    try {
      const body = {
        title: state.title,
        slug: state.slug,
        excerpt: state.excerpt || null,
        content: state.content,
        cover_image: state.cover_image || null,
        status: state.status,
        category: state.category || null,
        is_pinned: state.is_pinned,
        published_at: fromDateTimeLocalValue(state.published_at)
      };

      const response = await fetch(newsId ? `/api/admin/news/${newsId}` : "/api/admin/news", {
        method: newsId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; item?: { id: string } }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Не удалось сохранить новость");
      }

      const nextId = payload.item?.id ?? newsId;
      router.push(nextId ? `/admin/news/${nextId}/edit` : "/admin/news");
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить новость");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#14151d] p-6 text-[14px] text-white/65">
        Загружаем форму новости...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-semibold text-white">{newsId ? "Редактирование новости" : "Новая новость"}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[12px] font-semibold text-white"
          >
            {preview ? "Скрыть preview" : "Показать preview"}
          </button>
          <Link
            href="/admin/news"
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-[12px] font-semibold text-white/90"
          >
            К списку
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-white/10 bg-[#14151d] p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[12px] text-white/60">title</span>
            <input
              value={state.title}
              onChange={(event) => onChange("title", event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[14px] text-white outline-none ring-0"
              placeholder="Название новости"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[12px] text-white/60">slug</span>
            <input
              value={state.slug}
              onChange={(event) => onChange("slug", event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[14px] text-white outline-none ring-0"
              placeholder="auto-from-title-if-empty"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[12px] text-white/60">category</span>
            <input
              value={state.category}
              onChange={(event) => onChange("category", event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[14px] text-white outline-none ring-0"
              placeholder="Обновление / Правила / Промо"
            />
          </label>

          <label className="space-y-1">
            <span className="text-[12px] text-white/60">status</span>
            <select
              value={state.status}
              onChange={(event) => onChange("status", event.target.value as NewsFormState["status"])}
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[14px] text-white outline-none ring-0"
            >
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-[12px] text-white/60">published_at</span>
            <input
              type="datetime-local"
              value={state.published_at}
              onChange={(event) => onChange("published_at", event.target.value)}
              className="w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[14px] text-white outline-none ring-0"
            />
          </label>

          <label className="flex items-end gap-2 pb-1 text-[13px] text-white/80">
            <input
              type="checkbox"
              checked={state.is_pinned}
              onChange={(event) => onChange("is_pinned", event.target.checked)}
              className="h-4 w-4"
            />
            Закрепить новость
          </label>
        </div>

        <label className="space-y-1">
          <span className="text-[12px] text-white/60">excerpt</span>
          <textarea
            value={state.excerpt}
            onChange={(event) => onChange("excerpt", event.target.value)}
            className="min-h-[90px] w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
            placeholder="Короткое описание новости"
          />
        </label>

        <label className="space-y-1">
          <span className="text-[12px] text-white/60">content (markdown/plain)</span>
          <textarea
            value={state.content}
            onChange={(event) => onChange("content", event.target.value)}
            className="min-h-[220px] w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-[14px] text-white outline-none"
            placeholder="Полный текст новости"
          />
        </label>

        <div className="space-y-2">
          <span className="text-[12px] text-white/60">cover image</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              void onCoverSelected(file);
            }}
            className="block w-full max-w-full text-[13px] text-white/85 file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-white/10 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
          />
          {state.cover_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.cover_image} alt="cover" className="h-40 w-full max-w-sm rounded-lg object-cover" />
          ) : null}
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              void save();
            }}
            disabled={saving}
            className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </div>
      </section>

      {preview ? (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <h2 className="text-[18px] font-semibold text-white">Preview</h2>
          <p className="mt-2 text-[12px] text-white/55">{state.category || "Без категории"}</p>
          <h3 className="mt-1 text-[24px] font-semibold text-white">{state.title || "Без названия"}</h3>
          {state.excerpt ? <p className="mt-2 text-[15px] text-white/75">{state.excerpt}</p> : null}
          {state.cover_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={state.cover_image} alt="preview cover" className="mt-3 h-52 w-full rounded-xl object-cover" />
          ) : null}
          <div className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-white/85">{state.content}</div>
        </section>
      ) : null}
    </div>
  );
}
