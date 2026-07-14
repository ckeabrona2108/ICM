"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";

const NAV = [
  { label: "Главная", href: "#hero" },
  { label: "Отзывы", href: "#reviews" },
  { label: "Дистрибуция", href: "#how" },
  { label: "Платформы", href: "#platforms" },
  { label: "Тарифы", href: "#subscriptions" },
  { label: "AI Студия", href: "/dashboard/ai-studio" },
  { label: "FAQ", href: "#faq" }
];

export function IcmHeader() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-x-0 top-0 z-[60] px-4 pt-[max(env(safe-area-inset-top),1rem)] sm:px-6 sm:pt-4 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <div
          className={`relative flex items-center justify-between gap-3 rounded-full border px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl transition-all duration-300 sm:px-5 lg:px-6 ${
            scrolled
              ? "border-white/[0.10] bg-[rgba(8,8,12,0.78)]"
              : "border-white/[0.08] bg-[rgba(8,8,12,0.65)]"
          }`}
        >
          <Link href="/" className="group flex shrink-0 items-center">
            <span className="relative flex h-11 shrink-0 items-center transition-transform duration-300 group-hover:scale-[1.03] sm:h-12">
              <Image
                src="/brand/logo.png"
                alt="ICM Music Cloud"
                width={317}
                height={400}
                priority
                className="h-11 w-auto object-contain drop-shadow-[0_6px_22px_rgba(99,102,241,0.55)] sm:h-12"
              />
            </span>
          </Link>

          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 md:flex">
            {NAV.map((link) => (
              link.href.startsWith("/") ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className="whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-medium text-white/[0.72] transition-all duration-200 hover:bg-white/[0.05] hover:text-white"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className="whitespace-nowrap rounded-full px-4 py-2 text-[14px] font-medium text-white/[0.72] transition-all duration-200 hover:bg-white/[0.05] hover:text-white"
                >
                  {link.label}
                </a>
              )
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              href="https://www.icecreammusic.net/login"
              className="hidden rounded-full px-3 py-2 text-[14px] font-medium text-white/[0.72] transition-colors duration-200 hover:text-white sm:inline-block"
            >
              Войти
            </Link>
            <Link
              href="/login"
              className="hidden rounded-full bg-[#7b61ff] px-4 py-2 text-[14px] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(123,97,255,0.75)] transition-all duration-200 hover:bg-[#6a4ff0] sm:inline-flex"
            >
              Создать аккаунт
            </Link>
            <button
              type="button"
              aria-label="Меню"
              onClick={() => setOpen((s) => !s)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white transition-colors hover:bg-white/[0.08] md:hidden"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="mx-auto mt-3 max-w-7xl md:hidden">
          <div className="rounded-[28px] border border-white/[0.08] bg-[rgba(8,8,12,0.82)] p-2 shadow-[0_18px_44px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
            {NAV.map((link) => (
              link.href.startsWith("/") ? (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-4 py-3 text-sm text-white/[0.72] transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-4 py-3 text-sm text-white/[0.72] transition-colors hover:bg-white/[0.05] hover:text-white"
                >
                  {link.label}
                </a>
              )
            ))}
            <Link
              href="https://www.icecreammusic.net/login"
              onClick={() => setOpen(false)}
              className="block rounded-2xl px-4 py-3 text-sm text-white/[0.72] transition-colors hover:bg-white/[0.05] hover:text-white"
            >
              Войти
            </Link>
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="mt-1 block rounded-2xl bg-[#7b61ff] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#6a4ff0]"
            >
              Создать аккаунт
            </Link>
          </div>
        </div>
      ) : null}
    </motion.header>
  );
}
