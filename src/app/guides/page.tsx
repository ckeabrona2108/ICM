import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";

import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import { GUIDES } from "@/lib/guides";

const DESCRIPTION =
  "Гайды для музыкантов: как выпустить трек на Яндекс Музыку, сколько платят стриминги, как выбрать дистрибьютора и подготовить релиз.";

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
    description: DESCRIPTION
  }
};

export default function GuidesPage() {
  return (
    <main className="relative min-h-screen w-full max-w-full overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(94,76,255,0.18),transparent_30%),linear-gradient(180deg,#0a0b12_0%,#0a0b12_60%,#090a10_100%)] text-white">
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

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="group flex flex-col rounded-[24px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,18,28,0.92),rgba(11,13,21,0.88))] p-6 transition hover:border-[#7b61ff]/40 hover:shadow-[0_30px_80px_-50px_rgba(123,97,255,0.6)]"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#a78bfa]">{guide.kicker}</span>
              <h2 className="mt-3 text-[20px] font-bold leading-snug tracking-[-0.01em] text-white">{guide.title}</h2>
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
    </main>
  );
}
