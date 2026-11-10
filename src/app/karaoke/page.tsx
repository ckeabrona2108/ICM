import type { Metadata } from "next";
import Link from "next/link";

import { KaraokeStudio } from "@/components/karaoke/karaoke-studio";
import { IcmHeader } from "@/components/landing/icm-header";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import { serializeJsonLd } from "@/lib/site-metadata";

const TITLE = "Караоке из своего трека: видео с текстом для историй и TTML бесплатно";
const DESCRIPTION =
  "Бесплатно сделайте караоке для своего трека: разметьте текст под музыку, скачайте TTML для Apple Music и Spotify и соберите вертикальное видео с текстом песни для историй, VK Клипов, Reels и Shorts.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: "/karaoke"
  },
  openGraph: {
    type: "website",
    url: "/karaoke",
    title: TITLE,
    description: DESCRIPTION
  }
};

const STEPS = [
  {
    title: "Загрузите трек и текст",
    text: "Выберите файл WAV, MP3, FLAC или M4A и вставьте текст песни — по одной строке на фразу. Трек остаётся у вас в браузере и никуда не загружается."
  },
  {
    title: "Разметьте строки под музыку",
    text: "Нажмите Play. Когда начинается строка, зажмите Пробел и держите, пока она звучит, — отпустите в конце. На телефоне вместо Пробела большая кнопка."
  },
  {
    title: "Скачайте TTML или видео",
    text: "TTML с синхронизированным текстом — для Apple Music и Spotify. Или соберите вертикальное MP4 на 15 или 30 секунд для историй, VK Клипов, Reels и Shorts."
  }
];

const FAQ = [
  {
    q: "Это правда бесплатно?",
    a: "Да. Регистрация не нужна, ограничений по количеству треков нет. В углу видео стоит небольшая подпись icecreammusic.net."
  },
  {
    q: "Мой трек куда-то загружается?",
    a: "Нет. Трек открывается и обрабатывается прямо в вашем браузере, а видео собирается на вашем устройстве. На наш сервер файл не отправляется."
  },
  {
    q: "Какие форматы аудио подходят?",
    a: "WAV, MP3, FLAC и M4A. Лучше брать финальный мастер — тот же файл, что уходит на площадки."
  },
  {
    q: "Что такое TTML и зачем он нужен?",
    a: "TTML — файл с текстом песни, где у каждой строки есть время начала и конца. По нему Apple Music и Spotify подсвечивают текст в такт музыке. Такой файл можно приложить к релизу при выпуске через ICECREAMMUSIC."
  },
  {
    q: "Какое видео получится?",
    a: "Вертикальное MP4 1080×1920, 60 кадров в секунду, на 15 или 30 секунд — под истории ВКонтакте и Instagram, VK Клипы, Reels и YouTube Shorts. Можно выбрать фон (размытая обложка, тёмный, градиент или светлый), цвет текста и акцента, эффекты и анимацию плеера в начале."
  },
  {
    q: "Можно сделать с телефона?",
    a: "Да. Вместо Пробела на телефоне есть большая кнопка: держите её, пока звучит строка. С компьютера размечать немного удобнее — видна вся волна трека."
  },
  {
    q: "Можно сделать караоке на чужую песню?",
    a: "Инструмент сделан для своих треков. Публиковать видео с чужой песней можно только с разрешения правообладателя — иначе площадки его удалят."
  }
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a }
  }))
};

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#c4b5fd]">{eyebrow}</span>
      <h2 className="mt-3 text-balance text-[28px] font-bold leading-[1.1] tracking-[-0.02em] sm:text-[36px]">{title}</h2>
    </div>
  );
}

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
            Караоке-видео{" "}
            <span className="bg-gradient-to-r from-[#c4b5fd] via-[#7b3df5] to-[#3b82f6] bg-clip-text text-transparent">
              из своего трека
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-white/62 sm:text-[17px]">
            Разметьте текст под музыку — и получите вертикальное видео с текстом песни для историй, VK Клипов, Reels и
            Shorts, а также TTML для Apple Music и Spotify. Бесплатно и без регистрации — трек не покидает ваш браузер.
          </p>
        </div>

        <div className="mt-12">
          <KaraokeStudio />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-8">
        <SectionTitle eyebrow="Как это работает" title="Караоке за три шага" />
        <ol className="mt-10 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="rounded-3xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] p-6"
            >
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#7b3df5]/20 text-[15px] font-bold text-[#c4b5fd]">
                {i + 1}
              </span>
              <h3 className="mt-4 text-[17px] font-semibold">{step.title}</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/60">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-24 sm:px-8">
        <SectionTitle eyebrow="Вопросы" title="Частые вопросы" />
        <FaqAccordion items={FAQ} className="mt-10" />
        <p className="mt-8 text-center text-[14px] text-white/55">
          Подробнее — в гайде{" "}
          <Link href="/guides/tekst-pesni-i-karaoke" className="text-[#c4b5fd] underline-offset-4 hover:underline">
            «Как добавить текст песни и караоке на Яндекс Музыку и VK Музыку»
          </Link>
          .
        </p>
      </section>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(FAQ_JSON_LD) }} />
    </main>
  );
}
