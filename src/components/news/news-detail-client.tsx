"use client";

import Link from "next/link";
import * as React from "react";

interface NewsPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  category: string | null;
  is_pinned: boolean;
  published_at: string;
  is_new: boolean;
  content: string;
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

export function NewsDetailClient({ slug }: { slug: string }) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [item, setItem] = React.useState<NewsPost | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/news/${slug}`, { method: "GET" });
        const payload = (await response.json().catch(() => null)) as
          | { item?: NewsPost; error?: string }
          | null;

        if (!response.ok || !payload?.item) {
          throw new Error(payload?.error ?? "Новость не найдена");
        }

        if (!cancelled) {
          setItem(payload.item);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Не удалось загрузить новость");
          setItem(null);
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
  }, [slug]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[14px] text-white/70">
        Загружаем новость…
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
        <p className="text-[14px] text-rose-200">{error ?? "Новость не найдена"}</p>
        <Link href="/news" className="inline-flex rounded-lg border border-white/25 px-3 py-1.5 text-[13px] text-white/90">
          К списку новостей
        </Link>
      </div>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      {item.cover_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.cover_image} alt={item.title} className="h-64 w-full object-cover" />
      ) : null}
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/60">
          {item.category ? (
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-cyan-200">
              {item.category}
            </span>
          ) : null}
          <span>{formatDate(item.published_at)}</span>
        </div>

        <h1 className="mt-3 text-[30px] font-semibold leading-tight text-white">{item.title}</h1>
        {item.excerpt ? <p className="mt-3 text-[16px] text-white/75">{item.excerpt}</p> : null}

        <div className="mt-5 whitespace-pre-wrap text-[15px] leading-relaxed text-white/85">{item.content}</div>

        <Link
          href="/news"
          className="mt-6 inline-flex rounded-lg border border-white/20 px-3 py-1.5 text-[13px] text-white/90 transition hover:bg-white/10"
        >
          К списку новостей
        </Link>
      </div>
    </article>
  );
}
