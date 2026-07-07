"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CircleHelp,
  Ticket,
  CreditCard,
  FileText,
  Headset,
  LogOut,
  Music2,
  UserRound,
  Verified
} from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Дашборд", icon: FileText },
  { href: "/admin/news", label: "Новости сервиса", icon: FileText },
  { href: "/admin/users", label: "Пользователи", icon: UserRound },
  { href: "/admin/releases", label: "Релизы", icon: Music2 },
  { href: "/admin/ai-tokens", label: "AI-токены пользователей", icon: CreditCard },
  { href: "/admin/partner-codes", label: "Партнёрские коды", icon: Ticket },
  { href: "/admin/support/tickets", label: "Поддержка", icon: Headset },
  { href: "/admin/promo", label: "Промо", icon: Ticket },
  { href: "/admin/analytics", label: "Аналитика CSV", icon: BarChart3 },
  { href: "/admin/catalog-sync", label: "Smart Catalog Sync", icon: BarChart3 },
  { href: "/admin/faq", label: "FAQ", icon: CircleHelp },
  { href: "/admin/verification", label: "Верификация", icon: Verified },
  { href: "/admin/payments", label: "Заявки на выплаты", icon: CreditCard },
  { href: "/admin/playlists", label: "Плейлисты", icon: Music2 }
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.push("/admin/login");
      router.refresh();
    }
  };

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 border-r border-white/[0.06] bg-[#08090d]/95 px-4 py-6 backdrop-blur-xl lg:block">
      <Link href="/admin" className="mb-10 flex items-center gap-2 px-1">
        <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden">
          <Image
            src="/brand/logo.png"
            alt="ICECREAMMUSIC"
            width={56}
            height={56}
            className="h-10 w-10 object-contain"
          />
        </span>
        <span className="min-w-0 leading-[1.05]">
          <span className="block text-[12px] font-bold tracking-[0.02em] text-white">ICECREAM</span>
          <span className="block text-[12px] font-bold tracking-[0.02em] text-white">MUSIC</span>
        </span>
      </Link>

      <nav className="space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13.5px] font-medium leading-snug transition-colors",
                active
                  ? "bg-[#7b3df5]/20 text-white ring-1 ring-inset ring-[#7b3df5]/40"
                  : "text-white/65 hover:bg-white/[0.04] hover:text-white"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-white/55")} />
              <span className="min-w-0">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-white/[0.08] pt-4">
        <button
          type="button"
          onClick={() => {
            void handleLogout();
          }}
          className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.12] bg-white/[0.03] px-3 py-2.5 text-[13.5px] font-medium text-white/80 transition-colors hover:bg-white/[0.07] hover:text-white"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Выйти
        </button>
      </div>
    </aside>
  );
}
