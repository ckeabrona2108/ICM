"use client";

import Link from "next/link";
import * as React from "react";

interface NewsCard {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  category: string | null;
  is_pinned: boolean;
  published_at: string;
  is_new: boolean;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

function NewsCardView({ item }: { item: NewsCard }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      {item.cover_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover_image}
          alt={item.title}
          className="h-44 w-full object-cover"
        />
      ) : null}

      <div className="p-5">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {item.category ? (
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-cyan-200">
              {item.category}
            </span>
          ) : null}
          {item.is_pinned ? (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-amber-200">
              Закреплено
            </span>
          ) : null}
          {item.is_new ? (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-200">
              Новое
            </span>
          ) : null}
          <span className="text-white/55">{formatDate(item.published_at)}</span>
        </div>

        <h2 className="mt-3 text-[20px] font-semibold leading-tight text-white">{item.title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-white/70">{item.excerpt ?? "Без описания"}</p>

        <Link
          href={`/news/${item.slug}`}
          className="mt-4 inline-flex rounded-lg border border-white/20 px-3 py-1.5 text-[13px] font-medium text-white/90 transition hover:bg-white/10"
        >
          Читать
        </Link>
      </div>
    </article>
  );
}

export function NewsListClient() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<NewsCard[]>([]);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/news", { method: "GET" });
        const payload = (await response.json().catch(() => null)) as
          | { items?: NewsCard[]; error?: string }
          | null;

        if (!response.ok || !payload?.items) {
          throw new Error(payload?.error ?? "Не удалось загрузить новости");
        }

        if (!cancelled) {
          setItems(payload.items);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить новости");
          setItems([]);
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
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[14px] text-white/70">
        Загружаем новости…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-[14px] text-rose-200">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[14px] text-white/65">
        Пока нет новостей
      </div>
    );
  }

  const pinned = items.filter((item) => item.is_pinned);
  const regular = items.filter((item) => !item.is_pinned);

  return (
    <div className="space-y-6">
      {pinned.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[16px] font-semibold text-white">Закреплённые новости</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {pinned.map((item) => (
              <NewsCardView key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-white">Все новости</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {regular.map((item) => (
            <NewsCardView key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
