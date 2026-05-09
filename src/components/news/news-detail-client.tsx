"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

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

export function NewsDetailClient({
  slug,
  backHref = "/dashboard",
  backLabel = "В дашборд"
}: {
  slug: string;
  backHref?: string;
  backLabel?: string;
}) {
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
      <div className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2 text-[14px] font-medium text-white/84 transition hover:bg-white/[0.06]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-[14px] text-white/70">
          Загружаем новость…
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2 text-[14px] font-medium text-white/84 transition hover:bg-white/[0.06]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="space-y-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
          <p className="text-[14px] text-rose-200">{error ?? "Новость не найдена"}</p>
          <Link href={backHref} className="inline-flex rounded-lg border border-white/25 px-3 py-1.5 text-[13px] text-white/90">
            Назад
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2 text-[14px] font-medium text-white/84 transition hover:bg-white/[0.06]"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-4 py-2 text-[14px] font-medium text-white/84 transition hover:bg-white/[0.06]"
        >
          <LayoutDashboard className="h-4 w-4" />
          Выйти в дашборд
        </Link>
      </div>

      <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        {item.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover_image} alt={item.title} className="h-64 w-full object-cover" />
        ) : null}
        <div className="p-6 sm:p-7">
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

          <div className="mt-5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white/85">{item.content}</div>

          <div className="mt-8 border-t border-white/8 pt-5">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-[13px] text-white/90 transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Link>
          </div>
        </div>
      </article>
    </div>
  );
}
