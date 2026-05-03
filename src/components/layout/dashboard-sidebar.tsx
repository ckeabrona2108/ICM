"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  ChevronDown,
  CreditCard,
  Headset,
  HelpCircle,
  LogOut,
  Music2,
  Package,
  Sparkles,
  Store,
  UserRound,
  Wallet
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import { getCachedRequest } from "@/lib/client-request-cache";
import { cn } from "@/lib/utils";

interface NavLeaf {
  type: "leaf";
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeTone?: "soon";
  count?: number;
  countTone?: "default" | "brand" | "warning" | "info" | "danger";
  unavailable?: boolean;
}

interface NavChild {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  countTone?: "default" | "brand" | "warning" | "info" | "danger";
}

interface NavGroup {
  type: "group";
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  defaultOpen?: boolean;
  children: NavChild[];
}

type NavItem = NavLeaf | NavGroup;

function buildNav(counts: {
  totalReleases: number;
  draftsCount: number;
  moderationCount: number;
  changesCount: number;
  supportUnreadCount: number;
  aiEnabled: boolean;
}): NavItem[] {
  const base: NavItem[] = [
    { type: "leaf", href: "/dashboard", label: "Новости", icon: Bell },
    {
      type: "group",
      id: "music",
      label: "Ваша музыка",
      icon: Music2,
      defaultOpen: true,
      children: [
        {
          href: "/dashboard/releases",
          label: "Все релизы",
          icon: Package,
          count: counts.totalReleases,
          countTone: "brand"
        },
        { href: "/dashboard/releases/new", label: "Новый релиз", icon: Sparkles },
        {
          href: "/dashboard/drafts",
          label: "Черновики",
          icon: Package,
          count: counts.draftsCount,
          countTone: "warning"
        },
        {
          href: "/dashboard/moderation",
          label: "Модерация",
          icon: Package,
          count: counts.moderationCount,
          countTone: "info"
        },
        {
          href: "/dashboard/changes-required",
          label: "Требуются изменения",
          icon: Package,
          count: counts.changesCount,
          countTone: "danger"
        }
      ]
    },
    {
      type: "leaf",
      href: "/dashboard/statistics",
      label: "Аналитика",
      icon: BarChart3
    },
    { type: "leaf", href: "/dashboard/faq", label: "FAQ", icon: HelpCircle },
    {
      type: "leaf",
      href: "/dashboard/marketplace",
      label: "Маркет битов",
      icon: Store,
      badge: "Скоро",
      badgeTone: "soon",
      unavailable: true
    },
    { type: "leaf", href: "/dashboard/finance", label: "Кошелёк", icon: Wallet },
    { type: "leaf", href: "/dashboard/profile", label: "Аккаунт", icon: UserRound },
    {
      type: "leaf",
      href: "/dashboard/support",
      label: "Поддержка",
      icon: Headset,
      count: counts.supportUnreadCount,
      countTone: "danger"
    },
    { type: "leaf", href: "/dashboard/subscription", label: "Тарифы", icon: CreditCard }
  ];

  base.splice(3, 0, {
    type: "leaf",
    href: "/dashboard/ai-recommendations",
    label: "AI-рекомендации",
    icon: Sparkles,
    badge: counts.aiEnabled ? "DEMO" : "PRO",
    badgeTone: "soon"
  });

  return base;
}

export function DashboardSidebar({
  counts
}: {
  counts: {
    totalReleases: number;
    draftsCount: number;
    moderationCount: number;
    changesCount: number;
    aiEnabled: boolean;
  };
}) {
  const pathname = usePathname() ?? "";
  const [liveCounts, setLiveCounts] = React.useState({
    ...counts,
    supportUnreadCount: 0,
    aiEnabled: counts.aiEnabled
  });
  const [unavailableToast, setUnavailableToast] = React.useState<string | null>(null);
  const unavailableToastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const nav = React.useMemo(() => buildNav(liveCounts), [liveCounts]);

  const loadReleaseCounts = React.useCallback(async (force = false) => {
    try {
      const load = async () => {
        const response = await fetch("/api/releases/counts", { method: "GET" });
        if (!response.ok) return null;
        return (await response.json().catch(() => null)) as
          | {
              all?: number;
              draft?: number;
              moderation?: number;
              changes_required?: number;
            }
          | null;
      };
      const payload = force
        ? await load()
        : await getCachedRequest("sidebar:release-counts", 30_000, load);
      if (!payload) return;

      const all = Number(payload.all);
      const draft = Number(payload.draft);
      const moderation = Number(payload.moderation);
      const changesRequired = Number(payload.changes_required);

      if (
        !Number.isFinite(all) ||
        !Number.isFinite(draft) ||
        !Number.isFinite(moderation) ||
        !Number.isFinite(changesRequired)
      ) {
        return;
      }

      const totalReleases = Math.max(0, Math.floor(all));
      const draftsCount = Math.max(0, Math.floor(draft));
      const moderationCount = Math.max(0, Math.floor(moderation));
      const changesCount = Math.max(0, Math.floor(changesRequired));
      setLiveCounts((prev) => {
        if (
          prev.totalReleases === totalReleases &&
          prev.draftsCount === draftsCount &&
          prev.moderationCount === moderationCount &&
          prev.changesCount === changesCount
        ) {
          return prev;
        }
        return {
          ...prev,
          totalReleases,
          draftsCount,
          moderationCount,
          changesCount
        };
      });
    } catch {
      // ignore and retry on next refresh tick
    }
  }, []);

  React.useEffect(() => {
    setLiveCounts((prev) => ({ ...prev, ...counts }));
  }, [counts]);

  React.useEffect(() => {
    const onDraftsCount = (event: Event) => {
      const custom = event as CustomEvent<{ draftsCount?: number }>;
      const next = Number(custom.detail?.draftsCount);
      if (!Number.isFinite(next)) return;
      setLiveCounts((prev) => ({ ...prev, draftsCount: Math.max(0, Math.floor(next)) }));
      void loadReleaseCounts(true);
    };

    const onReleaseCountsRefresh = () => {
      void loadReleaseCounts(true);
    };

    const onSupportUnreadCount = (event: Event) => {
      const custom = event as CustomEvent<{ count?: number }>;
      const next = Number(custom.detail?.count);
      if (!Number.isFinite(next)) return;
      const unread = Math.max(0, Math.floor(next));
      setLiveCounts((prev) => {
        if (prev.supportUnreadCount === unread) return prev;
        return {
          ...prev,
          supportUnreadCount: unread
        };
      });
    };

    window.addEventListener("dashboard:drafts-count", onDraftsCount as EventListener);
    window.addEventListener(
      "dashboard:release-counts-refresh",
      onReleaseCountsRefresh as EventListener
    );
    window.addEventListener(
      "dashboard:support-unread-count",
      onSupportUnreadCount as EventListener
    );
    return () => {
      window.removeEventListener("dashboard:drafts-count", onDraftsCount as EventListener);
      window.removeEventListener(
        "dashboard:release-counts-refresh",
        onReleaseCountsRefresh as EventListener
      );
      window.removeEventListener(
        "dashboard:support-unread-count",
        onSupportUnreadCount as EventListener
      );
    };
  }, [loadReleaseCounts]);

  React.useEffect(() => {
    let cancelled = false;
    const loadUnread = async () => {
      try {
        const payload = await getCachedRequest(
          "sidebar:support-unread",
          30_000,
          async () => {
            const response = await fetch("/api/support/unread-count", { method: "GET" });
            if (!response.ok) return null;
            return (await response.json().catch(() => null)) as
              | { count?: number }
              | { error?: string }
              | null;
          }
        );
        if (!payload || !("count" in payload) || typeof payload.count !== "number") return;
        if (cancelled) return;
        const next = Math.max(0, Math.floor(payload.count));
        setLiveCounts((prev) => {
          if (prev.supportUnreadCount === next) return prev;
          return { ...prev, supportUnreadCount: next };
        });
      } catch {
        // ignore and retry on next poll
      }
    };

    void loadUnread();
    const timer = setInterval(() => {
      void loadUnread();
    }, 45_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  React.useEffect(() => {
    const timer = setInterval(() => {
      void loadReleaseCounts();
    }, 45_000);
    return () => {
      clearInterval(timer);
    };
  }, [loadReleaseCounts]);

  React.useEffect(() => {
    return () => {
      if (unavailableToastTimerRef.current) {
        clearTimeout(unavailableToastTimerRef.current);
      }
    };
  }, []);

  const showUnavailableNotice = React.useCallback(() => {
    setUnavailableToast("Раздел временно недоступен");
    if (unavailableToastTimerRef.current) {
      clearTimeout(unavailableToastTimerRef.current);
    }
    unavailableToastTimerRef.current = setTimeout(() => {
      setUnavailableToast(null);
      unavailableToastTimerRef.current = null;
    }, 3000);
  }, []);

  const initialOpen = React.useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const item of nav) {
      if (item.type === "group") {
        map[item.id] =
          item.defaultOpen || item.children.some((c) => pathname.startsWith(c.href));
      }
    }
    return map;
  }, [nav, pathname]);

  const [open, setOpen] = React.useState<Record<string, boolean>>(initialOpen);

  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[258px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0d0f16]/96 backdrop-blur-[4px] lg:flex">
        <div className="flex h-full flex-col overflow-y-auto px-3.5 py-5">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="grid h-10 w-10 place-items-center overflow-hidden">
            <Image
              src="/brand/logo.png"
              alt="ICM"
              width={317}
              height={400}
              className="h-8 w-auto object-contain"
            />
          </span>
          <span className="leading-tight">
            <span className="block text-[14px] font-bold tracking-wide text-white">
              ICECREAMMUSIC
            </span>
          </span>
        </Link>

        <nav className="flex-1 space-y-0.5">
          {nav.map((item) => {
            if (item.type === "leaf") {
              return (
                <NavLink
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onUnavailableClick={showUnavailableNotice}
                />
              );
            }
            const ActiveIcon = item.icon;
            const isOpen = open[item.id];
            const groupActive = item.children.some(
              (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
            );
            return (
              <div key={item.id}>
                <button
                  type="button"
                  onClick={() => toggle(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium transition-colors",
                    groupActive
                      ? "text-white"
                      : "text-white/65 hover:bg-white/[0.04] hover:text-white"
                  )}
                >
                  <ActiveIcon className="h-4.5 w-4.5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-white/40 transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen ? (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="my-1 ml-3 space-y-0.5 border-l border-white/[0.05] pl-2">
                        {item.children.map((child) => (
                          <SubNavLink key={child.href} child={child} pathname={pathname} />
                        ))}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => {
              import("next-auth/react").then((m) => m.signOut({ callbackUrl: "/login" }));
            }}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Выход</span>
          </button>
        </nav>

        </div>
      </aside>

      <AnimatePresence initial={false}>
        {unavailableToast ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed right-5 top-5 z-[90] rounded-xl border border-amber-300/30 bg-[#251d05]/95 px-4 py-3 text-[14px] font-medium text-amber-100 shadow-[0_18px_50px_-22px_rgba(0,0,0,0.9)] backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-300" />
              {unavailableToast}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function NavLink({
  item,
  pathname,
  onUnavailableClick
}: {
  item: NavLeaf;
  pathname: string;
  onUnavailableClick?: () => void;
}) {
  const Icon = item.icon;
  const active = pathname === item.href;
  return (
    <Link
      href={item.href}
      onClick={(event) => {
        if (!item.unavailable) return;
        event.preventDefault();
        onUnavailableClick?.();
      }}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium transition-colors",
        active
          ? "bg-[#7b3df5]/[0.18] text-white"
          : "text-white/65 hover:bg-white/[0.04] hover:text-white"
      )}
    >
      {active ? (
        <motion.span
          layoutId="cabinet-active"
          className="absolute inset-0 rounded-lg bg-[#7b3df5]/[0.18] ring-1 ring-inset ring-[#7b3df5]/30"
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      ) : null}
      <Icon className="relative h-4.5 w-4.5 shrink-0" />
      <span className="relative flex-1">{item.label}</span>
      {item.badge ? (
        <span
          className={cn(
            "relative rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
            item.badgeTone === "soon"
              ? "border-cyan-300/35 bg-cyan-400/10 text-cyan-200"
              : "border-white/[0.18] bg-white/[0.07] text-white/85"
          )}
        >
          {item.badge}
        </span>
      ) : null}
      {typeof item.count === "number" && item.count > 0 ? (
        <span
          className={cn(
            "relative rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            item.countTone === "danger" &&
              "border-[#ff5d6d]/30 bg-[#ff5d6d]/15 text-[#ff8390]",
            item.countTone === "info" &&
              "border-sky-300/35 bg-sky-400/10 text-sky-200",
            item.countTone === "warning" &&
              "border-amber-300/35 bg-amber-400/10 text-amber-200",
            item.countTone === "brand" &&
              "border-[#a78bfa]/40 bg-[#7b3df5]/20 text-[#d5c8ff]",
            (!item.countTone || item.countTone === "default") &&
              "border-white/[0.16] bg-white/[0.08] text-white/82"
          )}
        >
          +{item.count}
        </span>
      ) : null}
    </Link>
  );
}

function SubNavLink({
  child,
  pathname
}: {
  child: NavChild;
  pathname: string;
}) {
  const Icon = child.icon;
  const active = pathname === child.href;
  return (
    <Link
      href={child.href}
      prefetch={child.href === "/dashboard/drafts" ? false : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors",
        active
          ? "bg-[#7b3df5]/[0.20] text-white"
          : "text-white/55 hover:bg-white/[0.04] hover:text-white"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{child.label}</span>
      {typeof child.count === "number" && child.count > 0 ? (
        <span
          className={cn(
            "rounded-full border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
            child.countTone === "danger" &&
              "border-[#ff5d6d]/30 bg-[#ff5d6d]/15 text-[#ff8390]",
            child.countTone === "info" &&
              "border-sky-300/35 bg-sky-400/10 text-sky-200",
            child.countTone === "warning" &&
              "border-amber-300/35 bg-amber-400/10 text-amber-200",
            child.countTone === "brand" &&
              "border-[#a78bfa]/40 bg-[#7b3df5]/20 text-[#d5c8ff]",
            (!child.countTone || child.countTone === "default") &&
              "border-white/[0.16] bg-white/[0.08] text-white/82"
          )}
        >
          {child.count}
        </span>
      ) : null}
    </Link>
  );
}
