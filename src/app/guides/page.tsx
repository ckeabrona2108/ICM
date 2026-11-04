import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";

import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import { GUIDES, getGuidesByCategory } from "@/lib/guides";
import { absoluteSiteUrl, serializeJsonLd, SITE_NAME } from "@/lib/site-metadata";

const DESCRIPTION =
  "Гайды для музыкантов: как выпустить трек на Яндекс Музыку и VK Музыку, попасть в плейлисты, продвигать релиз, получать роялти и разобраться в правах.";

export const metadata: Metadata = {
  title: "Гайды для артистов",
  description: DESCRIPTION,
  alternates: {
    canonical: "/guides"
  },
  openGraph: {
    type: "website",
    url: "/guides",
    title: "Гайды для артистов — ICECREAMMUSIC",
    description: DESCRIPTION,
    locale: "ru_RU",
    siteName: SITE_NAME,
    images: [{ url: absoluteSiteUrl("/icon-512.png"), width: 512, height: 512, alt: SITE_NAME }]
  }
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      name: "Гайды для артистов",
      description: DESCRIPTION,
      url: absoluteSiteUrl("/guides"),
      inLanguage: "ru-RU",
      mainEntity: {
        "@type": "ItemList",
        itemListElement: GUIDES.map((guide, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: absoluteSiteUrl(`/guides/${guide.slug}`),
          name: guide.title
        }))
      }
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Главная", item: absoluteSiteUrl("/") },
        { "@type": "ListItem", position: 2, name: "Гайды", item: absoluteSiteUrl("/guides") }
      ]
    }
  ]
};

export default function GuidesPage() {
  const groups = getGuidesByCategory();

  return (
    <main className="relative min-h-screen w-full max-w-full overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(94,76,255,0.18),transparent_30%),linear-gradient(180deg,#0a0b12_0%,#0a0b12_60%,#090a10_100%)] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(JSON_LD) }} />
      <LandingScrollUnlock />
      <IcmHeader />

      <section className="mx-auto max-w-5xl px-4 pb-20 pt-28 sm:px-8 sm:pt-36">
        <div className="max-w-2xl">
          <span className="inline-flex items-center rounded-full border border-[#7b61ff]/30 bg-[#7b61ff]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#c4b5fd]">
            Гайды
          </span>
          <h1 className="mt-5 text-balance text-[36px] font-bold leading-[1.05] tracking-[-0.02em] sm:text-[52px]">
            Всё, что нужно знать перед релизом
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-white/62 sm:text-[17px]">
            Простым языком о выпуске музыки: от подготовки трека до денег с прослушиваний.
          </p>
        </div>

        <nav aria-label="Разделы" className="mt-10 flex flex-wrap gap-2">
          {groups.map((group) => (
            <a
              key={group.id}
              href={`#${group.id}`}
              className="rounded-full border border-white/[0.1] bg-white/[0.03] px-4 py-2 text-[13px] font-semibold text-white/70 transition hover:border-[#7b61ff]/40 hover:text-white"
            >
              {group.title}
              <span className="ml-1.5 text-white/35">{group.guides.length}</span>
            </a>
          ))}
        </nav>

        {groups.map((group) => (
          <section key={group.id} id={group.id} className="mt-14 scroll-mt-28">
            <h2 className="text-[24px] font-bold tracking-[-0.01em] text-white sm:text-[28px]">{group.title}</h2>
            <p className="mt-2 text-[14px] text-white/50 sm:text-[15px]">{group.description}</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {group.guides.map((guide) => (
                <Link
                  key={guide.slug}
                  href={`/guides/${guide.slug}`}
                  className="group flex flex-col rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,18,28,0.92),rgba(11,13,21,0.88))] p-6 transition hover:border-[#7b61ff]/40 hover:shadow-[0_30px_80px_-50px_rgba(123,97,255,0.6)]"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a78bfa]">{guide.kicker}</span>
                  <h3 className="mt-3 text-[20px] font-bold leading-snug tracking-[-0.01em] text-white">{guide.title}</h3>
                  <p className="mt-2 flex-1 text-[14px] leading-relaxed text-white/55">{guide.description}</p>
                  <span className="mt-5 flex items-center justify-between text-[13px] font-semibold">
                    <span className="inline-flex items-center gap-1.5 text-white/40">
                      <Clock3 className="h-3.5 w-3.5" />
                      {guide.readingMinutes} мин
                    </span>
                    <span className="inline-flex items-center gap-1 text-white/70 transition group-hover:text-white">
                      Читать
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}
