import type { Metadata } from "next";

import { KaraokeStudio } from "@/components/karaoke/karaoke-studio";
import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";

const DESCRIPTION =
  "Бесплатно сделайте синхронизированный текст (караоке) для своего трека: загрузите аудио, разметьте строки и скачайте TTML или LRC.";

export const metadata: Metadata = {
  title: "Караоке для трека — TTML синхронизация текста",
  description: DESCRIPTION,
  alternates: {
    canonical: "/karaoke"
  },
  openGraph: {
    type: "website",
    url: "/karaoke",
    title: "Караоке для трека — TTML синхронизация текста",
    description: DESCRIPTION
  }
};

export default function KaraokePage() {
  return (
    <main className="relative min-h-screen w-full max-w-full overflow-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(123,61,245,0.22),transparent_30%),linear-gradient(180deg,#070910_0%,#0a0b12_60%,#090a10_100%)] text-white">
      <LandingScrollUnlock />
      <IcmHeader />

      <section className="mx-auto max-w-4xl px-4 pb-20 pt-28 sm:px-8 sm:pt-36">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-[#7b3df5]/30 bg-[#7b3df5]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#c4b5fd]">
            Караоке для твоего трека
          </span>
          <h1 className="mt-5 text-balance text-[36px] font-bold leading-[1.04] tracking-[-0.02em] sm:text-[52px]">
            Синхронизация текста{" "}
            <span className="bg-gradient-to-r from-[#c4b5fd] via-[#7b3df5] to-[#3b82f6] bg-clip-text text-transparent">
              TTML
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-white/62 sm:text-[17px]">
            Совместите текст с музыкой и скачайте файл для Apple Music, Spotify и других площадок. Бесплатно и без
            регистрации — трек не покидает ваш браузер.
          </p>
        </div>

        <div className="mt-12">
          <KaraokeStudio />
        </div>
      </section>
    </main>
  );
}
