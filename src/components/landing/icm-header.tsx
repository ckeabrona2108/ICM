"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";

const NAV = [
  { label: "Главная", href: "#hero" },
  { label: "Дистрибуция", href: "#how" },
  { label: "Платформы", href: "#platforms" }
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
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled ? "backdrop-blur-xl" : ""
      }`}
    >
      <div
        className={`border-b transition-colors duration-300 ${
          scrolled ? "border-white/[0.06] bg-[#09090b]/80" : "border-transparent bg-transparent"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 sm:px-8">
          {/* Logo */}
          <Link href="/" className="group flex items-center">
            <span className="relative flex h-14 shrink-0 items-center transition-transform duration-300 group-hover:scale-105">
              <Image
                src="/brand/logo.png"
                alt="ICM Music Cloud"
                width={317}
                height={400}
                priority
                className="h-14 w-auto object-contain drop-shadow-[0_6px_22px_rgba(99,102,241,0.55)]"
              />
            </span>
          </Link>

          {/* Center nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="relative rounded-lg px-4 py-2 text-[14px] font-medium text-white/70 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right CTA */}
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-[14px] font-medium text-white/80 transition-colors hover:text-white sm:inline-block"
            >
              Вход в аккаунт
            </Link>
            <button
              type="button"
              aria-label="Меню"
              onClick={() => setOpen((s) => !s)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white md:hidden"
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open ? (
        <div className="border-b border-white/[0.06] bg-[#09090b]/95 backdrop-blur-xl md:hidden">
          <div className="mx-auto max-w-7xl px-6 py-3 sm:px-8">
            {NAV.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-3 text-sm text-white/80 hover:bg-white/[0.04] hover:text-white"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-3 text-sm text-white/80 hover:bg-white/[0.04] hover:text-white"
            >
              Вход в аккаунт
            </Link>
          </div>
        </div>
      ) : null}
    </motion.header>
  );
}
