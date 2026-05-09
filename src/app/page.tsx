import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AdvantageCards } from "@/components/landing/advantage-cards";
import { HeroCollage } from "@/components/landing/hero-collage";
import { HowItWorks } from "@/components/landing/how-it-works";
import { IcmHeader } from "@/components/landing/icm-header";
import { LandingScrollUnlock } from "@/components/landing/landing-scroll-unlock";
import {
  AppleMusicLogo,
  ShazamLogo,
  SpotifyLogo,
  TikTokLogo,
  VkMusicLogo,
  YandexMusicLogo,
  YouTubeMusicLogo
} from "@/components/landing/platform-logos";
import { Reveal, Stagger, StaggerItem } from "@/components/landing/reveal";
import { IcmTariffCard } from "@/components/tariffs/icm-tariff-card";
import { ICM_TARIFFS } from "@/lib/icm-tariffs";

const PLATFORMS = [
  { name: "Spotify", Logo: SpotifyLogo },
  { name: "Apple Music", Logo: AppleMusicLogo },
  { name: "VK Музыка", Logo: VkMusicLogo },
  { name: "Яндекс Музыка", Logo: YandexMusicLogo },
  { name: "YouTube Music", Logo: YouTubeMusicLogo },
  { name: "TikTok", Logo: TikTokLogo },
  { name: "Shazam", Logo: ShazamLogo }
];

export default function HomePage() {
  return (
    <main className="relative h-[100dvh] overflow-x-hidden overflow-y-auto bg-[#09090b] text-white">
      <LandingScrollUnlock />

      {/* ambient animated glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="blob-a absolute -top-40 left-1/2 h-[600px] w-[1100px] rounded-full bg-[#7b61ff]/15 blur-[160px]" />
        <div className="blob-b absolute right-0 top-1/4 h-[500px] w-[500px] rounded-full bg-[#ff3b5c]/10 blur-[160px]" />
        <div className="blob-c absolute bottom-0 left-0 h-[500px] w-[500px] rounded-full bg-[#3b82f6]/10 blur-[160px]" />
      </div>

      <IcmHeader />

      {/* ============== HERO ============== */}
      <section id="hero" className="relative">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-28 sm:px-8 sm:pt-32 lg:grid-cols-[1fr_1.05fr] lg:gap-12 lg:pb-36 lg:pt-36">
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
                href="#how"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-medium text-white/85 transition-colors hover:text-white"
              >
                Узнать больше
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </Reveal>

          <div className="relative">
            <HeroCollage />
          </div>
        </div>
      </section>

      {/* ============== HOW IT WORKS ============== */}
      <section id="how" className="relative mx-auto -mt-8 max-w-7xl px-6 pb-24 pt-16 sm:px-8 lg:-mt-10 lg:pb-32 lg:pt-20">
        <Reveal className="text-center">
          <h2 className="text-[36px] font-bold tracking-tight sm:text-[44px] lg:text-[52px]">
            Как это работает?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[14px] text-white/55 sm:text-[15px]">
            6 простых шагов, чтобы узнать, как мы выкладываем ваш релиз на площадки
          </p>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <HowItWorks />
        </Reveal>
      </section>

      {/* ============== ADVANTAGES ============== */}
      <section className="relative mx-auto max-w-7xl px-6 pb-24 pt-6 sm:px-8 lg:pb-32 lg:pt-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-16 top-0 h-16 bg-gradient-to-b from-white/[0.015] to-transparent blur-2xl"
        />
        <Reveal className="text-center">
          <h2 className="text-[36px] font-bold tracking-tight sm:text-[44px] lg:text-[52px]">
            Наши преимущества
          </h2>
        </Reveal>

        <div className="mt-12">
          <AdvantageCards />
        </div>
      </section>

      {/* ============== PLATFORMS ============== */}
      <section id="platforms" className="relative mx-auto max-w-7xl px-6 pb-24 pt-6 sm:px-8 lg:pb-32 lg:pt-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-16 top-0 h-16 bg-gradient-to-b from-white/[0.015] to-transparent blur-2xl"
        />
        <Reveal className="text-center">
          <h2 className="text-[36px] font-bold tracking-tight sm:text-[44px] lg:text-[52px]">
            Основные площадки
          </h2>
        </Reveal>

        <Stagger className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4" stagger={0.05}>
          {PLATFORMS.map(({ name, Logo }) => (
            <StaggerItem key={name}>
              <div className="icm-card group flex h-[110px] items-center justify-center gap-3 px-4 sm:h-[130px] sm:px-6">
                <span className="inline-flex shrink-0 transition-transform duration-300 group-hover:scale-110">
                  <Logo size={32} />
                </span>
                <span className="text-[15px] font-semibold text-white sm:text-[16px]">{name}</span>
              </div>
            </StaggerItem>
          ))}
          <StaggerItem>
            <div className="icm-card flex h-[110px] items-center justify-center px-6 text-center sm:h-[130px]">
              <p className="text-[14px] font-medium text-white/65">И ещё 240 площадок</p>
            </div>
          </StaggerItem>
        </Stagger>
      </section>

      {/* ============== PRICING ============== */}
      <section id="pricing" className="relative mx-auto max-w-7xl px-6 pb-24 pt-6 sm:px-8 lg:pb-32 lg:pt-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-16 top-0 h-16 bg-gradient-to-b from-white/[0.015] to-transparent blur-2xl"
        />
        <Reveal className="text-center">
          <h2 className="text-[36px] font-bold tracking-tight sm:text-[44px] lg:text-[52px]">
            Наши услуги
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[14px] text-white/55 sm:text-[15px]">
            Ознакомьтесь с условиями работы с нами! У нас есть бесплатный и платный тариф.
          </p>
        </Reveal>

        <Stagger className="mt-12 grid gap-6 lg:grid-cols-3" stagger={0.1}>
          {ICM_TARIFFS.map((tier) => (
            <StaggerItem key={tier.id}>
              <IcmTariffCard tier={tier} />
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ============== CTA ============== */}
      <section className="relative mx-auto max-w-7xl px-6 pb-20 sm:px-8 lg:pb-28">
        <Reveal className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-[#1a1230] via-[#0e0e1a] to-[#0a0a14] p-10 text-center sm:p-14">
          <div className="pointer-events-none absolute -top-20 left-1/2 h-72 w-[800px] -translate-x-1/2 rounded-full bg-[#7b61ff]/30 blur-[120px]" />
          <div className="relative">
            <h2 className="text-[28px] font-bold tracking-tight sm:text-[36px]">
              Заинтересовало?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[14px] text-white/65 sm:text-[15px]">
              Тогда создавай аккаунт и выкладывай свою музыку вместе с нами!
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 rounded-xl bg-[#7b61ff] px-7 py-3.5 text-[15px] font-semibold text-white shadow-[0_12px_36px_-10px_rgba(123,97,255,0.75)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#6a4ff0]"
              >
                Создать аккаунт
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ============== FOOTER ============== */}
      <footer className="relative border-t border-white/[0.06] bg-[#09090b]">
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
