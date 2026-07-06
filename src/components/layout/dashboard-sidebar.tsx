"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  BookOpenText,
  CalendarDays,
  ChevronDown,
  CreditCard,
  ExternalLink,
  Headset,
  HelpCircle,
  LayoutGrid,
  LogOut,
  Music2,
  Package,
  PanelLeftClose,
  Rocket,
  Sparkles,
  Store,
  Ticket,
  UserRound,
  Wallet
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/components/user/user-provider";
import { VerificationAccessModal } from "@/components/verification/verification-access-modal";

function RobotStickerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("block", className)}
    >
      <path d="M12 4.25v2.1" />
      <path d="M9.25 6.35h5.5a3.7 3.7 0 0 1 3.7 3.7v4.9a3.7 3.7 0 0 1-3.7 3.7h-5.5a3.7 3.7 0 0 1-3.7-3.7v-4.9a3.7 3.7 0 0 1 3.7-3.7Z" />
      <path d="M8 18.65v1.35" />
      <path d="M16 18.65v1.35" />
      <path d="M5.55 10.1H4.1" />
      <path d="M19.9 10.1h-1.45" />
      <circle cx="9.75" cy="11.95" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.25" cy="11.95" r="0.9" fill="currentColor" stroke="none" />
      <path d="M9.4 15.05c.7.55 1.55.82 2.6.82s1.9-.27 2.6-.82" />
    </svg>
  );
}

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
  badge?: string;
  badgeTone?: "soon";
  unavailable?: boolean;
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
    {
      type: "leaf",
      href: "/dashboard/promo",
      label: "Промо",
      icon: Rocket
    },
    {
      type: "leaf",
      href: "/dashboard/smart-links",
      label: "Smart Links",
      icon: ExternalLink
    },
    { type: "leaf", href: "/dashboard/faq", label: "FAQ", icon: HelpCircle },
    {
      type: "leaf",
      href: "/dashboard/marketplace",
      label: "Beat Market",
      icon: Store,
      badge: "Скоро",
      badgeTone: "soon"
    },
    {
      type: "leaf",
      href: "/dashboard/collab-market",
      label: "Collab Market",
      icon: Store,
      badge: "Скоро",
      badgeTone: "soon"
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
    type: "group",
    id: "ai",
    label: "AI",
    icon: RobotStickerIcon,
    children: [
      {
        href: "/dashboard/ai-recommendations",
        label: "AI Monitoring",
        icon: RobotStickerIcon,
        badge: "BETA",
        badgeTone: "soon"
      },
      {
        href: "/dashboard/video-snippets",
        label: "Видео-сниппеты",
        icon: RobotStickerIcon,
        badge: "NEW",
        badgeTone: "soon"
      },
      {
        href: "/dashboard/ai-studio",
        label: "AI Студия",
        icon: RobotStickerIcon
      },
      {
        href: "/dashboard/ai-artists",
        label: "AI Artists",
        icon: RobotStickerIcon,
        badge: "Скоро",
        badgeTone: "soon"
      },
      {
        href: "/dashboard/ai-textbook",
        label: "TextBook",
        icon: BookOpenText,
        badge: "Скоро",
        badgeTone: "soon"
      },
      {
        href: "/dashboard/ai-workspace",
        label: "Workspace",
        icon: LayoutGrid,
        badge: "Скоро",
        badgeTone: "soon"
      },
      {
        href: "/dashboard/ai-tiktok-boost",
        label: "TikTok Boost",
        icon: Rocket,
        badge: "Скоро",
        badgeTone: "soon"
      }
    ]
  });

  return base;
}

export function DashboardSidebar({
  counts,
  contractStatus
}: {
  counts: {
    totalReleases: number;
    draftsCount: number;
    moderationCount: number;
    changesCount: number;
    aiEnabled: boolean;
  };
  contractStatus: ContractStatusPayload;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const { user } = useCurrentUser();
  const effectiveVerification = user?.verification ?? contractStatus;
  const [optimisticPath, setOptimisticPath] = React.useState<string | null>(null);
  const [liveCounts, setLiveCounts] = React.useState({
    ...counts,
    supportUnreadCount: 0,
    aiEnabled: counts.aiEnabled
  });
  const [verificationModalOpen, setVerificationModalOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [unavailableToast, setUnavailableToast] = React.useState<string | null>(null);
  const unavailableToastTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const nav = React.useMemo(() => buildNav(liveCounts), [liveCounts]);
  const activePath = optimisticPath ?? pathname;

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
      const payload = await load();
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
    if (!optimisticPath) return;
    if (pathname === optimisticPath || pathname.startsWith(`${optimisticPath}/`)) {
      setOptimisticPath(null);
    }
  }, [optimisticPath, pathname]);

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

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

    const onToggleMobileSidebar = () => {
      setMobileMenuOpen((prev) => !prev);
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
    window.addEventListener(
      "dashboard:toggle-mobile-sidebar",
      onToggleMobileSidebar as EventListener
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
      window.removeEventListener(
        "dashboard:toggle-mobile-sidebar",
        onToggleMobileSidebar as EventListener
      );
    };
  }, [loadReleaseCounts]);

  React.useEffect(() => {
    let cancelled = false;
    const loadUnread = async () => {
      try {
        const response = await fetch("/api/support/unread-count", {
          method: "GET",
          cache: "no-store"
        });
        if (!response.ok) return;
        const payload = (await response.json().catch(() => null)) as
          | { count?: number }
          | { error?: string }
          | null;
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
    void loadReleaseCounts(true);
  }, [loadReleaseCounts]);

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
        map[item.id] = false;
      }
    }
    return map;
  }, [nav]);

  const [open, setOpen] = React.useState<Record<string, boolean>>(initialOpen);

  const toggle = (id: string) => setOpen((state) => ({ ...state, [id]: !state[id] }));
  const requiresVerificationGate = React.useCallback(
    (href: string) => href === "/dashboard/releases/new" && !effectiveVerification.canCreateRelease,
    [effectiveVerification.canCreateRelease]
  );
  const prefetchHref = React.useCallback(
    (href: string) => {
      void router.prefetch(href);
    },
    [router]
  );
  const startNavigation = React.useCallback((href: string) => {
    setOptimisticPath(href);
    setMobileMenuOpen(false);
  }, []);
  const mobileNavItems = React.useMemo(
    () => [
      { href: "/dashboard", label: "Новости", icon: Bell },
      { href: "/dashboard/releases", label: "Релизы", icon: Package },
      { href: "/dashboard/statistics", label: "Аналитика", icon: BarChart3 },
      { href: "/dashboard/finance", label: "Кошелёк", icon: Wallet },
      { href: "/dashboard/profile", label: "Аккаунт", icon: UserRound }
    ],
    []
  );

  const sidebarNavigation = (
    <>
      <Link href="/dashboard" className="mb-6 flex items-center justify-start gap-2.5 px-3">
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
          <span className="block text-[13px] font-semibold tracking-[0.01em] text-white">
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
                pathname={activePath}
                onUnavailableClick={showUnavailableNotice}
                onVerificationRequired={() => setVerificationModalOpen(true)}
                requiresVerificationGate={requiresVerificationGate}
                onNavigate={startNavigation}
                onPrefetch={prefetchHref}
              />
            );
          }

          const ActiveIcon = item.icon;
          const isOpen = open[item.id];
          const groupActive = item.children.some(
            (child) => activePath === child.href || activePath.startsWith(`${child.href}/`)
          );

          return (
            <div key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14.5px] font-medium transition-colors",
                  groupActive ? "text-white" : "text-white/65 hover:bg-white/[0.04] hover:text-white"
                )}
              >
                <ActiveIcon className="h-4 w-4 shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 text-white/40 transition-transform", isOpen && "rotate-180")}
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
                        <SubNavLink
                          key={child.href}
                          child={child}
                          pathname={activePath}
                          onUnavailableClick={showUnavailableNotice}
                          onVerificationRequired={() => setVerificationModalOpen(true)}
                          requiresVerificationGate={requiresVerificationGate}
                          onNavigate={startNavigation}
                          onPrefetch={prefetchHref}
                        />
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
            import("next-auth/react").then((module) => module.signOut({ callbackUrl: "/login" }));
          }}
          className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Выход</span>
        </button>
      </nav>
    </>
  );

  return (
    <>
      <aside
        data-dashboard-sidebar="true"
        className="perf-fixed-layer fixed inset-y-0 left-0 z-30 hidden w-[258px] shrink-0 flex-col border-r border-white/[0.08] bg-[#0d0f16]/96 backdrop-blur-[2px] lg:flex"
      >
        <div className="perf-scroll-shell flex h-full flex-col overflow-y-auto px-3.5 py-5">{sidebarNavigation}</div>
      </aside>

      <AnimatePresence initial={false}>
        {mobileMenuOpen ? (
          <>
            <motion.button
              type="button"
              aria-label="Закрыть меню кабинета"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[74] bg-[#04050a]/88 backdrop-blur-[8px] lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.aside
              data-dashboard-sidebar="true"
              initial={{ x: -28, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -20, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed inset-y-0 left-0 z-[75] flex w-[min(86vw,320px)] max-w-[320px] flex-col border-r border-white/[0.12] bg-[#0a0c12] shadow-[24px_0_70px_-34px_rgba(0,0,0,0.98)] lg:hidden"
            >
              <div className="flex items-center justify-end px-4 pt-4">
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] text-white/78 transition-colors hover:bg-white/[0.08]"
                  aria-label="Закрыть меню кабинета"
                >
                  <PanelLeftClose className="h-4.5 w-4.5" />
                </button>
              </div>
              <div className="perf-scroll-shell flex h-full flex-col overflow-y-auto px-3.5 pb-[calc(env(safe-area-inset-bottom)+96px)] pt-2">
                {sidebarNavigation}
              </div>
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>

      <nav className="perf-fixed-layer fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.1] bg-[#0d0f16]/96 px-1.5 pb-[calc(env(safe-area-inset-bottom)+6px)] pt-1.5 backdrop-blur-[6px] lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = activePath === item.href || activePath.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                data-bypass-wizard-guard="true"
                onClick={() => startNavigation(item.href)}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg px-1 py-2 text-center transition-colors",
                  active ? "bg-[#7b3df5]/20 text-white" : "text-white/60 hover:bg-white/[0.04] hover:text-white"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="mt-1 text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <AnimatePresence initial={false}>
        {unavailableToast ? (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed right-5 top-5 z-[90] rounded-xl border border-amber-300/30 bg-[#251d05]/95 px-4 py-3 text-[14px] font-medium text-amber-100 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.8)] backdrop-blur-[4px]"
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

      <VerificationAccessModal
        open={verificationModalOpen}
        status={effectiveVerification}
        onClose={() => setVerificationModalOpen(false)}
      />
    </>
  );
}

function NavLink({
  item,
  pathname,
  onUnavailableClick,
  onVerificationRequired,
  requiresVerificationGate,
  onNavigate,
  onPrefetch
}: {
  item: NavLeaf;
  pathname: string;
  onUnavailableClick?: () => void;
  onVerificationRequired?: () => void;
  requiresVerificationGate?: (href: string) => boolean;
  onNavigate?: (href: string) => void;
  onPrefetch?: (href: string) => void;
}) {
  const Icon = item.icon;
  const active = pathname === item.href;

  return (
    <Link
      href={item.href}
      prefetch
      data-bypass-wizard-guard="true"
      onMouseEnter={() => onPrefetch?.(item.href)}
      onFocus={() => onPrefetch?.(item.href)}
      onClick={(event) => {
        if (item.unavailable) {
          event.preventDefault();
          onUnavailableClick?.();
          return;
        }
        if (requiresVerificationGate?.(item.href)) {
          event.preventDefault();
          onVerificationRequired?.();
          return;
        }
        onNavigate?.(item.href);
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
      <Icon className="relative h-4 w-4 shrink-0" />
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
  pathname,
  onUnavailableClick,
  onVerificationRequired,
  requiresVerificationGate,
  onNavigate,
  onPrefetch
}: {
  child: NavChild;
  pathname: string;
  onUnavailableClick?: () => void;
  onVerificationRequired?: () => void;
  requiresVerificationGate?: (href: string) => boolean;
  onNavigate?: (href: string) => void;
  onPrefetch?: (href: string) => void;
}) {
  const Icon = child.icon;
  const active = pathname === child.href;

  return (
    <Link
      href={child.href}
      prefetch
      data-bypass-wizard-guard="true"
      onMouseEnter={() => onPrefetch?.(child.href)}
      onFocus={() => onPrefetch?.(child.href)}
      onClick={(event) => {
        if (child.unavailable) {
          event.preventDefault();
          onUnavailableClick?.();
          return;
        }
        if (requiresVerificationGate?.(child.href)) {
          event.preventDefault();
          onVerificationRequired?.();
          return;
        }
        onNavigate?.(child.href);
      }}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors",
        active
          ? "bg-[#7b3df5]/[0.20] text-white"
          : "text-white/55 hover:bg-white/[0.04] hover:text-white",
        child.unavailable && "opacity-85"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-normal break-normal leading-snug [overflow-wrap:normal] [hyphens:none]">
        {child.label}
      </span>
      {child.badge ? (
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]",
            child.badgeTone === "soon"
              ? "border-cyan-300/35 bg-cyan-400/10 text-cyan-200"
              : "border-white/[0.18] bg-white/[0.07] text-white/85"
          )}
        >
          {child.badge}
        </span>
      ) : null}
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
