import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  Clock3,
  Globe2,
  Headset,
  Layers3,
  PlayCircle,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wallet,
  WalletCards
} from "lucide-react";

import { FaqAccordion } from "@/components/landing/faq-accordion";
import { HeroCollage } from "@/components/landing/hero-collage";
import { HowItWorks } from "@/components/landing/how-it-works";
import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import {
  AppleMusicLogo,
  SoundCloudLogo,
  SpotifyLogo,
  TidalLogo,
  TikTokLogo,
  YouTubeMusicLogo
} from "@/components/landing/platform-logos";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/reveal";

const COMPANY_STATS = [
  {
    value: "с 2023",
    label: "",
    note: "помогаем артистам пройти путь от подготовки релиза до публикации и сопровождения",
    compact: true,
    kicker: "Старт"
  },
  { value: "1 500+", label: "релизов выпущено", note: "от первых синглов до полноформатных альбомов" },
  { value: "500+", label: "артистов", note: "музыканты, продюсеры и независимые проекты, которые выпускают музыку через ICE CREAM MUSIC" },
  { value: "240+", label: "площадок", note: "мировые стриминговые сервисы, социальные платформы и локальные музыкальные витрины" },
  {
    value: "7/7",
    label: "поддержка",
    note: "помогаем с релизами, модерацией, правками и вопросами по выплатам",
    compact: true,
    kicker: "На связи"
  }
] as const;

const WHY_US = [
  {
    icon: ShieldCheck,
    title: "Контроль на каждом этапе",
    description:
      "Вы всегда видите, что происходит с релизом: отправлен ли он на проверку, требует ли правок или уже готов к публикации."
  },
  {
    icon: Clock3,
    title: "Понятный процесс",
    description:
      "Без сложных инструкций и лишней путаницы. Каждый этап релиза последовательно ведёт к публикации."
  },
  {
    icon: Headset,
    title: "Поддержка реальных людей",
    description:
      "Если возникают вопросы, вы можете обратиться к команде и получить помощь по конкретной ситуации."
  },
  {
    icon: Wallet,
    title: "Всё под рукой",
    description:
      "Релизы, статистика, выплаты и история работы находятся в одном кабинете."
  }
] as const;

const SERVICE_STACK = [
  {
    icon: BarChart3,
    title: "Аналитика и отчёты",
    description:
      "Следите за показателями релизов и динамикой прослушиваний."
  },
  {
    icon: Sparkles,
    title: "AI и промо-инструменты",
    description:
      "Используйте дополнительные возможности для продвижения своей музыки."
  },
  {
    icon: Layers3,
    title: "Удобный кабинет",
    description:
      "Вся информация по релизам, выплатам и обращениям собрана в одном месте."
  },
  {
    icon: BadgeCheck,
    title: "Поддержка команды",
    description:
      "Если возникают вопросы или сложности, мы остаёмся на связи и помогаем разобраться."
  }
] as const;

const PLATFORM_MARQUEE_ITEMS = [
  { name: "SoundCloud", Logo: SoundCloudLogo, logoSize: 38 },
  { name: "Tidal", Logo: TidalLogo, logoSize: 36 },
  { name: "Shazam", imageSrc: "/landing/platforms/shazam-user.png", rounded: true, imageClassName: "h-[37px] w-[37px]" },
  { name: "VK Музыка", imageSrc: "/landing/platforms/vk-music.webp", imageClassName: "h-[38px] w-[38px]" },
  { name: "Яндекс Музыка", imageSrc: "/landing/platforms/yandex-music.png", rounded: true, imageClassName: "h-[38px] w-[38px]" },
  { name: "Apple Music", Logo: AppleMusicLogo, logoSize: 38 },
  { name: "Spotify", Logo: SpotifyLogo, logoSize: 38 },
  { name: "YouTube Music", Logo: YouTubeMusicLogo, logoSize: 38 },
  { name: "TikTok", Logo: TikTokLogo, logoSize: 37 },
  { name: "МТС Музыка", imageSrc: "/landing/platforms/mts-music-user.png", imageClassName: "h-[36px] w-[36px]" }
] as const;

const REVIEW_SCREENSHOTS = [
  {
    src: "/landing/reviews/review-01.png",
    alt: "Отзыв Михаила Бегункова",
    className: "md:rotate-[-5deg] md:translate-y-8 md:translate-x-2"
  },
  {
    src: "/landing/reviews/review-02.png",
    alt: "Отзыв Egor Potapov",
    className: "md:rotate-[4deg] md:-translate-y-2 md:translate-x-8"
  },
  {
    src: "/landing/reviews/review-03.png",
    alt: "Отзыв Егора Русакова",
    className: "md:rotate-[-2deg] md:translate-y-3 md:-translate-x-6"
  },
  {
    src: "/landing/reviews/review-04.png",
    alt: "Отзыв Никиты Полтинина",
    className: "md:rotate-[3deg] md:translate-y-12"
  },
  {
    src: "/landing/reviews/review-05.png",
    alt: "Отзыв Maksim Selivanov",
    className: "md:rotate-[-4deg] md:-translate-y-6 md:translate-x-6"
  },
  {
    src: "/landing/reviews/review-06.png",
    alt: "Отзыв Марка Карих",
    className: "md:rotate-[2deg] md:translate-y-4 md:-translate-x-4"
  },
  {
    src: "/landing/reviews/review-07.png",
    alt: "Отзыв Марселя Рахматуллина",
    className: "md:rotate-[-3deg] md:translate-y-10 md:translate-x-10"
  },
  {
    src: "/landing/reviews/review-08.png",
    alt: "Отзыв Сени Кислицина",
    className: "md:rotate-[5deg] md:-translate-y-1 md:translate-x-2"
  }
] as const;

const PROMO_CARDS = [
  {
    title: "Громкие новинки",
    subtitle: "VK Музыка",
    imageSrc: "/landing/promo/vk-music-cover.png",
    rotate: "-rotate-[7deg]",
    shift: "translate-y-6 md:translate-y-8",
    textRotate: "-rotate-[2deg]"
  },
  {
    title: "Популярное",
    subtitle: "Яндекс Музыка",
    imageSrc: "/landing/promo/yandex-music-cover.jpg",
    rotate: "rotate-[6deg]",
    shift: "-translate-y-2 md:-translate-y-4",
    textRotate: "rotate-[1deg]"
  }
] as const;

const FAQ_ITEMS = [
  {
    q: "Что включает сервис кроме дистрибуции?",
    a: "Помимо доставки музыки на площадки вы получаете личный кабинет, статистику, поддержку команды и инструменты для работы с релизами."
  },
  {
    q: "Как быстро нужно загружать релиз до даты выхода?",
    a: "Рекомендуем загружать релизы заранее, чтобы оставалось время на проверку и возможные корректировки."
  },
  {
    q: "Какие права передаёт артист?",
    a: "Все права на музыку остаются за правообладателем согласно условиям сотрудничества."
  },
  {
    q: "Можно ли выпускать ремиксы и каверы?",
    a: "Да, если соблюдены все необходимые требования и оформлены соответствующие права."
  },
  {
    q: "Как понять, что релиз уже принят?",
    a: "Статус релиза отображается в личном кабинете на каждом этапе обработки."
  }
] as const;

const HERO_METRICS = [
  {
    title: "Стримы",
    value: "1 245 800",
    icon: ArrowUpRight,
    iconTint: "text-[#d9d2ff]",
    tilt: "sm:-rotate-[3deg]",
    shift: "sm:translate-y-2",
    duration: "6.6s",
    delay: "0.4s",
    panel:
      "bg-[linear-gradient(135deg,rgba(148,132,255,0.26),rgba(92,80,196,0.14))] border-white/12"
  },
  {
    title: "Выплата доступна",
    value: "14 500 ₽",
    icon: WalletCards,
    iconTint: "text-[#1fd19a]",
    tilt: "sm:rotate-[4deg]",
    shift: "sm:translate-y-6",
    duration: "7.4s",
    delay: "1.3s",
    panel:
      "bg-[linear-gradient(135deg,rgba(72,68,116,0.56),rgba(44,40,80,0.38))] border-white/10"
  }
] as const;

const SURFACE_PANEL =
  "border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,18,28,0.92),rgba(11,13,21,0.88))] shadow-[0_30px_120px_-60px_rgba(91,75,255,0.32)] backdrop-blur-xl";

const SURFACE_PANEL_GLOW =
  "border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,18,28,0.92),rgba(11,13,21,0.88))] shadow-[0_30px_120px_-60px_rgba(91,75,255,0.32)] backdrop-blur-xl";

type PlatformMarqueeItem = (typeof PLATFORM_MARQUEE_ITEMS)[number];

function isImagePlatformItem(
  item: PlatformMarqueeItem
): item is Extract<PlatformMarqueeItem, { imageSrc: string }> {
  return "imageSrc" in item;
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#8b5cf6]/25 bg-[#8b5cf6]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-[#c4b5fd]">
      {children}
    </span>
  );
}

export default function HomePage() {
  return (
    <main className="relative h-[100dvh] overflow-x-hidden overflow-y-auto bg-[radial-gradient(circle_at_50%_0%,rgba(94,76,255,0.18),transparent_26%),linear-gradient(180deg,#0a0b12_0%,#0a0b12_58%,#090a10_100%)] text-white">
      <LandingScrollUnlock />

      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="blob-a absolute -top-40 left-1/2 h-[600px] w-[1100px] rounded-full bg-[#7b61ff]/15 blur-[160px]" />
        <div className="ambient-orbit-left absolute left-1/2 top-[14%] h-[420px] w-[760px] -translate-x-1/2 rounded-full border border-[#7b61ff]/10 bg-[#7b61ff]/10 blur-[140px]" />
      </div>

      <IcmHeader />

      <section id="hero" className="relative">
        <div className="mx-auto grid max-w-7xl gap-10 px-6 pb-8 pt-28 sm:px-8 sm:pb-12 sm:pt-32 lg:grid-cols-[1fr_1.05fr] lg:gap-10 lg:pb-16 lg:pt-36">
          <Reveal>
            <h1 className="max-w-2xl text-balance text-[44px] font-bold leading-[1.04] tracking-[-0.02em] sm:text-[56px] md:text-[68px] lg:text-[76px]">
              Всё для артиста <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-[#a78bfa] via-[#7b61ff] to-[#5d3dd1] bg-clip-text text-transparent">
                в одном месте
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-white/65 sm:text-[17px]">
              Управляйте своим творчеством, продажами и маркетингом в одном месте, чтобы сделать
              вашу музыку заметной и доступной миллионам слушателей.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#7b61ff] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_12px_36px_-10px_rgba(123,97,255,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6a4ff0] hover:shadow-[0_18px_44px_-10px_rgba(123,97,255,0.85)]"
              >
                Вход в аккаунт
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a
                href="#company"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-medium text-white/85 transition-colors hover:text-white"
              >
                Узнать больше
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <div className="mt-20 flex max-w-[520px] flex-col gap-3 sm:mt-24 sm:flex-row">
              {HERO_METRICS.map((item) => {
                const Icon = item.icon;

                return (
                  <div
                    key={item.title}
                    className={`flex min-h-[92px] flex-1 items-center gap-3 overflow-hidden rounded-[24px] border px-4 py-3 shadow-[0_20px_56px_-36px_rgba(0,0,0,0.82)] backdrop-blur-[20px] transition-transform duration-300 sm:min-h-[96px] ${item.panel} ${item.tilt} ${item.shift}`}
                    style={{ animation: `float-soft ${item.duration} ease-in-out ${item.delay} infinite` }}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-white/8 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] sm:h-14 sm:w-14">
                      <Icon className={`h-5 w-5 sm:h-6 sm:w-6 ${item.iconTint}`} strokeWidth={1.8} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium leading-none text-white/55 sm:text-[13px]">
                        {item.title}
                      </div>
                      <div className="mt-2 text-[20px] font-bold leading-none tracking-[-0.04em] text-white sm:text-[24px]">
                        {item.value}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>

          <div className="relative">
            <HeroCollage />
          </div>
        </div>
      </section>

      <section
        id="company"
        className="relative mx-auto -mt-12 max-w-7xl px-6 pb-18 pt-0 sm:-mt-16 sm:px-8 sm:pb-20 lg:-mt-20 lg:pb-24"
      >
        <Reveal className={`rounded-[34px] p-8 sm:p-10 lg:p-12 ${SURFACE_PANEL}`}>
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="max-w-2xl">
              <SectionEyebrow>Статистика компании</SectionEyebrow>
              <h2 className="mt-4 text-[34px] font-bold leading-[1.02] tracking-tight sm:text-[42px] lg:text-[54px]">
                Работаем с 2023 года
              </h2>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-white/60 sm:text-[16px]">
              Каждый релиз — это не просто загрузка музыки на площадки. Мы помогаем артистам пройти путь от подготовки релиза до его публикации и дальнейшего сопровождения.
            </p>
          </div>

          <Stagger className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5" stagger={0.06}>
            {COMPANY_STATS.map((item) => (
              <StaggerItem key={item.label}>
                <div
                  className={`h-full rounded-[26px] border p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
                    "compact" in item && item.compact
                      ? "border-[#8b5cf6]/14 bg-[linear-gradient(180deg,rgba(123,97,255,0.08),rgba(13,13,20,0.92))]"
                      : "border-white/[0.08] bg-[#0d0d14]/90"
                  }`}
                >
                  {"compact" in item && item.compact && "kicker" in item ? (
                    <div className="inline-flex rounded-full border border-[#8b5cf6]/20 bg-[#8b5cf6]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#cfc0ff]">
                      {item.kicker}
                    </div>
                  ) : null}
                  <div
                    className={`font-bold leading-none tracking-[-0.04em] text-white ${
                      "compact" in item && item.compact
                        ? "mt-4 text-[32px] sm:text-[38px]"
                        : "text-[40px] sm:text-[48px]"
                    }`}
                  >
                    {item.value}
                  </div>
                  {item.label ? (
                    <div className="mt-3 text-[12px] font-semibold uppercase tracking-[0.22em] text-[#c4b5fd]">
                      {item.label}
                    </div>
                  ) : null}
                  <p className="mt-3 text-[13px] leading-relaxed text-white/55">{item.note}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 pb-18 sm:px-8 sm:pb-20 lg:pb-24">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <Reveal className="lg:sticky lg:top-24">
            <SectionEyebrow>Почему артисты выбирают нас</SectionEyebrow>
            <h2 className="mt-4 text-[34px] font-bold leading-[1.04] tracking-tight sm:text-[42px] lg:text-[54px]">
              Всё необходимое для выпуска музыки в одном месте
            </h2>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-[16px]">
              Мы стараемся сделать процесс выпуска музыки понятным и спокойным — независимо от того, выпускаете вы первый трек или работаете с релизами регулярно.
            </p>
          </Reveal>

          <Stagger className="grid gap-4 md:grid-cols-2" stagger={0.08}>
            {WHY_US.map((item) => {
              const Icon = item.icon;
              return (
                <StaggerItem key={item.title}>
                  <div className="group h-full rounded-[28px] border border-white/[0.08] bg-white/[0.025] p-6 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#7b61ff]/10 text-[#d6cbff] shadow-[0_0_40px_-14px_rgba(123,97,255,0.55)]">
                      <Icon className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <h3 className="mt-5 text-[22px] font-semibold tracking-tight text-white">
                      {item.title}
                    </h3>
                    <p className="mt-3 text-[14px] leading-relaxed text-white/60">
                      {item.description}
                    </p>
                  </div>
                </StaggerItem>
              );
            })}
          </Stagger>
        </div>
      </section>

      <section id="how" className="relative mx-auto max-w-7xl px-6 pb-18 sm:px-8 sm:pb-20 lg:pb-24">
        <Reveal className="text-center">
          <SectionEyebrow>Как проходит релиз</SectionEyebrow>
          <h2 className="mt-4 text-[34px] font-bold tracking-tight sm:text-[42px] lg:text-[54px]">
            Как проходит выпуск релиза
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-white/58 sm:text-[16px]">
            Понятный путь от регистрации до публикации и дальнейшей работы с релизом.
          </p>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <HowItWorks />
        </Reveal>
      </section>

      <section id="reviews" className="relative mx-auto max-w-7xl px-6 pb-18 sm:px-8 sm:pb-20 lg:pb-24">
        <Reveal className={`rounded-[34px] p-8 sm:p-10 lg:p-12 ${SURFACE_PANEL_GLOW}`}>
          <div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div>
              <SectionEyebrow>Не просто дистрибуция</SectionEyebrow>
              <h2 className="mt-4 text-[34px] font-bold leading-[1.04] tracking-tight sm:text-[42px] lg:text-[54px]">
                Помогаем не только выпустить музыку, но и работать с ней дальше
              </h2>
              <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/60 sm:text-[16px]">
                После публикации релиз продолжает жить. Поэтому в ICE CREAM MUSIC доступны инструменты, которые помогают следить за результатами и управлять дальнейшей работой.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {SERVICE_STACK.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="rounded-[26px] border border-white/[0.08] bg-[#0d0d14]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-white">
                      <Icon className="h-5 w-5" strokeWidth={1.6} />
                    </div>
                    <h3 className="mt-4 text-[19px] font-semibold text-white">{item.title}</h3>
                    <p className="mt-2 text-[14px] leading-relaxed text-white/58">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </section>

      <section id="platforms" className="relative mx-auto max-w-7xl px-6 pb-18 sm:px-8 sm:pb-20 lg:pb-24">
        <Reveal className={`overflow-hidden rounded-[36px] py-10 sm:py-12 ${SURFACE_PANEL_GLOW}`}>
          <div className="px-6 text-center sm:px-8">
            <SectionEyebrow>Площадки</SectionEyebrow>
            <h2 className="mt-4 text-[34px] font-bold tracking-tight sm:text-[42px] lg:text-[54px]">
              Выпускайте музыку там, где её слушают
            </h2>
            <p className="mx-auto mt-4 max-w-3xl text-[15px] leading-relaxed text-white/60 sm:text-[16px]">
              Мы доставляем релизы на популярные мировые и локальные музыкальные площадки. Вместо
              набора карточек здесь лучше работает живая витрина охвата.
            </p>
            <div className="mt-6 inline-flex items-center gap-3 rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-left">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#7b61ff]/10 text-[#d7ccff]">
                <Globe2 className="h-5 w-5" strokeWidth={1.6} />
              </div>
              <div>
                <div className="text-[15px] font-semibold text-white">240+ площадок</div>
                <div className="text-[13px] text-white/55">
                  Spotify, Apple Music, YouTube Music, VK Музыка, Яндекс Музыка, TikTok, Shazam и другие.
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 space-y-4">
            {[false, true].map((reverse, rowIndex) => {
              const items = [...PLATFORM_MARQUEE_ITEMS, ...PLATFORM_MARQUEE_ITEMS];
              return (
                <div
                  key={rowIndex}
                  className="[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
                >
                  <div
                    className={`flex w-max gap-4 whitespace-nowrap ${
                      reverse ? "animate-marqueeReverse" : "animate-marqueeSlow"
                    }`}
                  >
                    {items.map((item, index) => (
                      <div
                        key={`${item.name}-${rowIndex}-${index}`}
                        className="flex items-center gap-3 rounded-full border border-white/[0.08] bg-white/[0.04] px-5 py-3 text-[15px] font-semibold text-white/78 backdrop-blur-md"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-black/20">
                          {"Logo" in item && item.Logo ? (
                            <item.Logo size={"logoSize" in item ? item.logoSize : 38} />
                          ) : isImagePlatformItem(item) ? (
                            <Image
                              src={item.imageSrc}
                              alt={item.name}
                              width={32}
                              height={32}
                              className={`${"imageClassName" in item ? item.imageClassName : "h-8 w-8"} object-contain ${"rounded" in item && item.rounded ? "rounded-[9px]" : ""}`}
                            />
                          ) : null}
                        </div>
                        <span className="text-[20px] font-semibold tracking-tight text-white/72 sm:text-[24px]">
                          {item.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 pb-18 sm:px-8 sm:pb-20 lg:pb-24">
        <div className="grid gap-12 lg:grid-cols-[0.32fr_0.68fr] lg:items-start">
          <Reveal className="text-center lg:sticky lg:top-24">
            <SectionEyebrow>Отзывы</SectionEyebrow>
            <h2 className="mt-4 text-[34px] font-bold tracking-tight sm:text-[42px] lg:text-[54px]">
              Нам доверяют артисты
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/58 sm:text-[16px]">
              Живые отзывы всегда говорят лучше любых цитат. Поэтому в этом блоке мы показываем реальные скриншоты — как дополнительное подтверждение опыта наших клиентов.
            </p>
          </Reveal>

          <div className="relative lg:pt-24">
            <div className="pointer-events-none absolute inset-0 rounded-[40px] bg-[radial-gradient(circle_at_30%_20%,rgba(123,97,255,0.2),transparent_42%),radial-gradient(circle_at_70%_70%,rgba(255,59,92,0.12),transparent_38%)] blur-3xl" />

            <Stagger className="relative grid gap-6 md:grid-cols-2" stagger={0.06}>
              {REVIEW_SCREENSHOTS.map((review, index) => (
                <StaggerItem key={review.src} className={review.className}>
                  <div
                    className={`overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#111217] shadow-[0_24px_60px_-30px_rgba(0,0,0,0.75)] transition-transform duration-300 hover:scale-[1.01] ${
                      index % 3 === 0 ? "md:col-span-2" : ""
                    }`}
                    style={{ animation: `float-soft ${7.4 + index * 0.35}s ease-in-out ${index * 0.45}s infinite` }}
                  >
                    <Image
                      src={review.src}
                      alt={review.alt}
                      width={1544}
                      height={232}
                      className="h-auto w-full scale-[1.07] object-cover"
                    />
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 pb-18 sm:px-8 sm:pb-20 lg:pb-24">
        <Reveal className={`overflow-hidden rounded-[34px] p-8 sm:p-10 lg:p-12 ${SURFACE_PANEL_GLOW}`}>
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="text-center">
              <SectionEyebrow>Promo</SectionEyebrow>
              <h2 className="mt-4 text-[34px] font-bold leading-[1.04] tracking-tight sm:text-[42px] lg:text-[54px]">
                Поддержка редакторов
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-white/62 sm:text-[16px]">
                Наша promo-команда отправляет твои релизы напрямую редакторам площадок и помогает
                усиливать шанс на питчинг в заметные подборки.
              </p>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-white/62 sm:text-[16px]">
                VK Музыка, Яндекс Музыка и другие витрины получают релизы в аккуратной подаче,
                чтобы качественная музыка не терялась в общем потоке.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link
                  href="/register"
                  className="group inline-flex items-center gap-2 rounded-xl bg-[#7b61ff] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_12px_36px_-10px_rgba(123,97,255,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6a4ff0]"
                >
                  Отправить релиз
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link
                  href="https://vk.com/icecreammusicru"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-5 py-3.5 text-[15px] font-medium text-white/85 transition-colors hover:border-white/[0.16] hover:text-white"
                >
                  Узнать подробнее
                </Link>
              </div>
            </div>

            <div className="relative min-h-[320px] md:min-h-[360px]">
              <div className="pointer-events-none absolute inset-0 rounded-[34px] bg-[radial-gradient(circle_at_62%_36%,rgba(123,97,255,0.24),transparent_34%),radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.08),transparent_18%)] blur-2xl" />
              <div className="absolute inset-0 flex items-center justify-end">
                <div className="relative h-[300px] w-full max-w-[520px] md:h-[340px]">
                  {PROMO_CARDS.map((card, index) => {
                    return (
                      <div
                        key={card.title}
                        className={`absolute top-1/2 w-[220px] rounded-[30px] border border-white/[0.1] bg-[linear-gradient(180deg,rgba(22,23,36,0.96),rgba(15,16,26,0.94))] p-4 shadow-[0_28px_72px_-34px_rgba(0,0,0,0.82)] backdrop-blur-xl md:w-[248px] ${card.rotate} ${card.shift} ${
                          index === 0 ? "right-[35%]" : "right-[6%]"
                        }`}
                        style={{ animation: `float-soft ${6.8 + index}s ease-in-out ${index * 0.6}s infinite` }}
                      >
                        <div className="relative">
                          <div
                            className="relative h-36 overflow-hidden rounded-[22px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] md:h-40"
                          >
                            <Image
                              src={card.imageSrc}
                              alt={card.title}
                              fill
                              sizes="(max-width: 768px) 220px, 248px"
                              className="object-cover"
                            />
                          </div>
                          <div className={`mt-4 text-[28px] font-bold leading-[0.95] tracking-tight text-white ${card.textRotate}`}>
                            {card.title}
                          </div>
                          <div className="mt-2 text-[16px] font-medium text-white/58">
                            {card.subtitle}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="faq" className="relative mx-auto max-w-7xl px-6 pb-18 sm:px-8 sm:pb-20 lg:pb-24">
        <Reveal className="text-center">
          <SectionEyebrow>FAQ</SectionEyebrow>
          <h2 className="mt-4 text-[34px] font-bold tracking-tight sm:text-[42px] lg:text-[54px]">
            FAQ
          </h2>
        </Reveal>

        <Reveal delay={0.08} className="mt-12">
          <FaqAccordion items={[...FAQ_ITEMS]} />
        </Reveal>
      </section>

      <section className="relative mx-auto max-w-7xl px-6 pb-20 sm:px-8 lg:pb-28">
        <Reveal className={`relative overflow-hidden rounded-[32px] p-10 text-center sm:p-14 ${SURFACE_PANEL_GLOW}`}>
          <div className="pointer-events-none absolute -top-20 left-1/2 h-72 w-[800px] -translate-x-1/2 rounded-full bg-[#7b61ff]/30 blur-[120px]" />
          <div className="relative">
            <h2 className="mt-4 text-[30px] font-bold tracking-tight sm:text-[40px] lg:text-[48px]">
              Выпускайте музыку вместе с ICE CREAM MUSIC
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-white/64 sm:text-[16px]">
              Независимый артист — не значит один.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#7b61ff] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_12px_36px_-10px_rgba(123,97,255,0.75)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6a4ff0]"
              >
                Выпустить релиз
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="https://vk.com/icecreammusicru"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-5 py-3.5 text-[15px] font-medium text-white/85 transition-colors hover:border-white/[0.16] hover:text-white"
              >
                Задать вопрос
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <footer className="relative border-t border-white/[0.06] bg-transparent">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-[12.5px] text-white/45 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-7 shrink-0 items-center">
              <Image
                src="/brand/logo.png"
                alt="ICM"
                width={317}
                height={400}
                className="h-7 w-auto object-contain"
              />
            </span>
            <span>© 2026 ICECREAMMUSIC</span>
          </div>
        </div>
        <div className="mx-auto max-w-7xl border-t border-white/[0.06] px-6 pb-8 pt-5 text-center text-[12.5px] leading-relaxed text-white/55 sm:px-8">
          <p>ИП Шманцарь Вячеслав Васильевич</p>
          <p>ОГРН: 324390000034601</p>
          <p>ИНН: 391301950740</p>
          <p>+79024226647 (Поддержка по телефону не осуществляется)</p>
        </div>
      </footer>
    </main>
  );
}
