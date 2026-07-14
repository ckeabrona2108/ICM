"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { label: "Дистрибуция", href: "#distribution" },
  { label: "AI Studio", href: "#ai" },
  { label: "Продвижение", href: "#promotion" },
  { label: "Блог", href: "#blog" },
  { label: "FAQ", href: "#faq" }
];

export function LandingHeader() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 transition-all duration-300",
        "px-4 pt-[max(env(safe-area-inset-top),1rem)] sm:px-6 sm:pt-4"
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-2xl border border-white/10 px-4 py-2.5 backdrop-blur-xl transition-all sm:px-5",
          scrolled ? "bg-black/60 shadow-glass" : "bg-black/25"
        )}
      >
        <BrandLogo />
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm text-white/70 transition hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">
              Войти
            </Button>
          </Link>
          <Link href="/register">
            <Button size="sm" className="btn-shine">
              Начать
            </Button>
          </Link>
          <button
            type="button"
            aria-label="Открыть меню"
            onClick={() => setOpen((s) => !s)}
            className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white lg:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="mx-auto mt-2 max-w-7xl rounded-2xl border border-white/10 bg-black/80 p-2 backdrop-blur-xl lg:hidden">
          {NAV.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block rounded-lg px-4 py-3 text-sm text-white/80 hover:bg-white/5"
            >
              {link.label}
            </a>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg px-4 py-3 text-sm text-white/80 hover:bg-white/5 sm:hidden">
            Войти
          </Link>
        </div>
      ) : null}
    </header>
  );
}
