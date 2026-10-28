import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, Lightbulb } from "lucide-react";

import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import { GUIDES, getGuide, type GuideBlock } from "@/lib/guides";
import { absoluteSiteUrl, serializeJsonLd, SITE_NAME } from "@/lib/site-metadata";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const guide = getGuide(params.slug);
  if (!guide) return { title: "Гайд не найден", robots: { index: false, follow: false } };

  return {
    title: guide.seoTitle,
    description: guide.description,
    keywords: guide.keywords,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      type: "article",
      url: `/guides/${guide.slug}`,
      title: guide.title,
      description: guide.description,
      publishedTime: guide.publishedAt,
      modifiedTime: guide.updatedAt
    }
  };
}

function registerHref(slug: string) {
  return `/register?utm_source=guides&utm_medium=article&utm_campaign=seo&utm_content=${slug}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

function Block({ block, slug }: { block: GuideBlock; slug: string }) {
  switch (block.type) {
    case "h2":
      return <h2 className="mt-12 text-[24px] font-bold leading-tight tracking-[-0.01em] text-white sm:text-[28px]">{block.text}</h2>;
    case "p":
      return <p className="mt-4 text-[16px] leading-[1.75] text-white/72 sm:text-[17px]">{block.text}</p>;
    case "list": {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag className="mt-5 space-y-3">
          {block.items.map((item, index) => (
            <li key={item} className="flex gap-3 text-[16px] leading-[1.65] text-white/72 sm:text-[17px]">
              {block.ordered ? (
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#7b61ff]/20 text-[12px] font-bold text-[#c4b5fd]">
                  {index + 1}
                </span>
              ) : (
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa]" />
              )}
              <span>{item}</span>
            </li>
          ))}
        </ListTag>
      );
    }
    case "tip":
      return (
        <aside className="mt-8 rounded-[20px] border border-amber-300/20 bg-amber-400/[0.06] p-5">
          <p className="flex items-center gap-2 text-[14px] font-bold text-amber-200">
            <Lightbulb className="h-4 w-4" />
            {block.title}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-amber-50/80">{block.text}</p>
        </aside>
      );
    case "cta":
      return (
        <aside className="mt-12 overflow-hidden rounded-[26px] border border-[#7b61ff]/30 bg-[radial-gradient(circle_at_85%_0%,rgba(123,97,255,0.35),transparent_45%),linear-gradient(180deg,rgba(23,20,42,0.95),rgba(13,13,24,0.95))] p-6 sm:p-8">
          <p className="text-[22px] font-bold leading-tight text-white sm:text-[26px]">{block.title}</p>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/65">{block.text}</p>
          <Link
            href={registerHref(slug)}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#7b61ff] px-5 py-3 text-[14px] font-semibold text-white shadow-[0_12px_30px_-10px_rgba(123,97,255,0.8)] transition hover:bg-[#6d4dff]"
          >
            Выпустить свой первый трек
            <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      );
  }
}

export default function GuidePage({ params }: { params: { slug: string } }) {
  const guide = getGuide(params.slug);
  if (!guide) notFound();

  const url = absoluteSiteUrl(`/guides/${guide.slug}`);
  const others = GUIDES.filter((item) => item.slug !== guide.slug).slice(0, 3);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: guide.title,
        description: guide.description,
        datePublished: guide.publishedAt,
        dateModified: guide.updatedAt,
        inLanguage: "ru-RU",
        mainEntityOfPage: url,
        author: { "@type": "Organization", name: SITE_NAME, url: absoluteSiteUrl("/") },
        publisher: {
          "@type": "Organization",
          name: SITE_NAME,
          logo: { "@type": "ImageObject", url: absoluteSiteUrl("/icon-512.png") }
        }
      },
      {
        "@type": "FAQPage",
        mainEntity: guide.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a }
        }))
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Главная", item: absoluteSiteUrl("/") },
          { "@type": "ListItem", position: 2, name: "Гайды", item: absoluteSiteUrl("/guides") },
          { "@type": "ListItem", position: 3, name: guide.title, item: url }
        ]
      }
    ]
  };

  return (
    <main className="relative min-h-screen w-full max-w-full overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(94,76,255,0.16),transparent_30%),linear-gradient(180deg,#0a0b12_0%,#0a0b12_60%,#090a10_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
      <LandingScrollUnlock />
      <IcmHeader />

      <article className="mx-auto max-w-3xl px-4 pb-16 pt-28 sm:px-8 sm:pt-36">
        <nav aria-label="Навигация" className="flex items-center gap-2 text-[13px] text-white/45">
          <Link href="/guides" className="inline-flex items-center gap-1.5 transition hover:text-white">
            <ArrowLeft className="h-3.5 w-3.5" />
            Все гайды
          </Link>
        </nav>

        <span className="mt-8 inline-flex rounded-full border border-[#7b61ff]/30 bg-[#7b61ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#c4b5fd]">
          {guide.kicker}
        </span>
        <h1 className="mt-5 text-balance text-[32px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[46px]">{guide.title}</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-white/60 sm:text-[19px]">{guide.description}</p>
        <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-white/40">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5" />
            {guide.readingMinutes} мин чтения
          </span>
          <time dateTime={guide.updatedAt}>Обновлено {formatDate(guide.updatedAt)}</time>
        </p>

        <div className="mt-8 border-t border-white/[0.08] pt-2">
          {guide.blocks.map((block, index) => (
            <Block key={index} block={block} slug={guide.slug} />
          ))}
        </div>

        <section className="mt-14">
          <h2 className="text-[24px] font-bold tracking-[-0.01em] text-white sm:text-[28px]">Частые вопросы</h2>
          <div className="mt-5 divide-y divide-white/[0.08] rounded-[22px] border border-white/[0.08] bg-white/[0.02]">
            {guide.faq.map((item) => (
              <details key={item.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-white">
                  {item.q}
                  <span className="text-[20px] leading-none text-white/40 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-white/62">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </article>

      {others.length > 0 ? (
        <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.22em] text-white/40">Читайте также</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {others.map((item) => (
              <Link
                key={item.slug}
                href={`/guides/${item.slug}`}
                className="rounded-[20px] border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-[#7b61ff]/40"
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#a78bfa]">{item.kicker}</span>
                <p className="mt-2 text-[15px] font-semibold leading-snug text-white">{item.title}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
