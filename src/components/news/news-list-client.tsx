"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Pin, Sparkles } from "lucide-react";

import { NativeLikesCounter, TripledIdentity } from "@/components/ui/tripled-social";

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
  const pathname = usePathname();
  const detailHref = pathname?.startsWith("/dashboard") ? `/dashboard/news/${item.slug}` : `/news/${item.slug}`;
  const isDashboard = pathname?.startsWith("/dashboard");

  if (isDashboard) {
    return (
      <article className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.02))] p-6 shadow-[0_24px_70px_-48px_rgba(0,0,0,0.75)] sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-white/55">
          <span>{formatDate(item.published_at)}</span>
          {item.is_pinned ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/18 bg-amber-300/[0.09] px-2.5 py-1 text-amber-100">
              <Pin className="h-3.5 w-3.5" /> Закреплено
            </span>
          ) : null}
          {item.is_new ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d8c5ff]/18 bg-[#d8c5ff]/[0.09] px-2.5 py-1 text-[#efe4ff]">
              <Sparkles className="h-3.5 w-3.5" /> Новое
            </span>
          ) : null}
        </div>

        <h2 className="mt-5 text-balance text-[24px] font-semibold leading-[1.12] tracking-[-0.04em] text-white">
          {item.title}
        </h2>
        <p className="mt-4 text-[15px] leading-8 text-white/72">{item.excerpt ?? "Без описания"}</p>

        <Link
          href={detailHref}
          className="mt-6 inline-flex items-center gap-2 rounded-[14px] border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[15px] font-medium text-white/88 transition hover:border-white/18 hover:bg-white/[0.06]"
        >
          Читать <ArrowUpRight className="h-4 w-4" />
        </Link>
      </article>
    );
  }

  return (
    <article className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.028))] shadow-[0_28px_70px_-46px_rgba(0,0,0,0.7)] transition duration-300 hover:-translate-y-1 hover:border-white/16 hover:bg-white/[0.08]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,171,255,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(110,209,255,0.1),transparent_24%)] opacity-90" />
      {item.cover_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover_image}
          alt={item.title}
          className="relative h-52 w-full object-cover transition duration-500 group-hover:scale-[1.03]"
        />
      ) : <div className="relative h-52 w-full bg-[radial-gradient(circle_at_top,rgba(201,171,255,0.22),transparent_42%),linear-gradient(180deg,#171c27,#10131a)]" />}

      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {item.category ? (
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-white/72">
              {item.category}
            </span>
          ) : null}
          {item.is_pinned ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/18 bg-amber-300/[0.09] px-2.5 py-1 text-amber-100">
              <Pin className="h-3.5 w-3.5" /> Закреплено
            </span>
          ) : null}
          {item.is_new ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#d8c5ff]/18 bg-[#d8c5ff]/[0.09] px-2.5 py-1 text-[#efe4ff]">
              <Sparkles className="h-3.5 w-3.5" /> Новое
            </span>
          ) : null}
          <span className="text-white/55">{formatDate(item.published_at)}</span>
        </div>

        <h2 className="mt-4 text-balance text-[22px] font-semibold leading-[1.1] tracking-[-0.04em] text-white">{item.title}</h2>
        <p className="mt-3 text-[14px] leading-7 text-white/68">{item.excerpt ?? "Без описания"}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <TripledIdentity name="ICECREAMMUSIC" avatarUrl={null} meta={item.category ?? "Новости"} compact />
          <NativeLikesCounter count={item.is_pinned ? 128 : item.is_new ? 64 : 32} />
        </div>

        <Link
          href={detailHref}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-[13px] font-medium text-white/90 transition hover:border-white/18 hover:bg-white/[0.1]"
        >
          Читать <ArrowUpRight className="h-4 w-4" />
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
          <div className="grid gap-5 md:grid-cols-2">
            {pinned.map((item) => (
              <NewsCardView key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[16px] font-semibold text-white">Все новости</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {regular.map((item) => (
            <NewsCardView key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
