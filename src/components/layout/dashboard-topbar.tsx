"use client";

import Link from "next/link";
import Image from "next/image";
import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Coins, LogOut, Sparkles, UserRound, Wallet } from "lucide-react";

import { useCurrentUser } from "@/components/user/user-provider";
import { UserAvatar } from "@/components/user/user-avatar";
import { ServiceWorkStatus } from "@/components/layout/service-work-status";
import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { VerificationStatusBadge } from "@/components/verification/verification-status-badge";
import { formatAiTokenAmount } from "@/lib/ai-studio";
import { formatRubCurrency } from "@/lib/currency-format";
import { cn } from "@/lib/utils";

function formatRuCount(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function formatSubscriptionExpiry(endsAt?: string | null, nowTs = Date.now()): string | null {
  if (!endsAt) return null;
  const parsed = new Date(endsAt);
  if (Number.isNaN(parsed.getTime())) return null;

  const diffMs = parsed.getTime() - nowTs;
  if (diffMs <= 0) return "Подписка истекла";

  const totalMinutes = Math.ceil(diffMs / (60 * 1000));
  if (totalMinutes < 60) {
    return `Подписка истечёт через ${totalMinutes} ${formatRuCount(totalMinutes, "минуту", "минуты", "минут")}`;
  }

  if (totalMinutes < 24 * 60) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (minutes === 0) {
      return `Подписка истечёт через ${hours} ${formatRuCount(hours, "час", "часа", "часов")}`;
    }
    return `Подписка истечёт через ${hours} ${formatRuCount(hours, "час", "часа", "часов")} ${minutes} ${formatRuCount(minutes, "минуту", "минуты", "минут")}`;
  }

  const countdownDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  if (countdownDays % 7 === 0 && countdownDays >= 7 && countdownDays <= 56) {
    const weeks = Math.ceil(countdownDays / 7);
    return `Подписка истечёт через ${weeks} ${formatRuCount(weeks, "неделю", "недели", "недель")}`;
  }

  return `Подписка истечёт через ${countdownDays} ${formatRuCount(countdownDays, "день", "дня", "дней")}`;
}

export function DashboardTopbar({
  userName,
  userEmail,
  planLabel,
  balanceLabel,
  aiTokenBalanceLabel,
  hasSubscription,
  subscriptionEndsAt,
  contractStatus
}: {
  userName: string;
  userEmail?: string;
  planLabel?: string;
  balanceLabel: string;
  aiTokenBalanceLabel: string;
  hasSubscription: boolean;
  subscriptionEndsAt?: string | null;
  contractStatus: ContractStatusPayload;
}) {
  const { user } = useCurrentUser();
  const displayName = user?.name?.trim() || userName || "Пользователь";
  const displayEmail = user?.email?.trim() || userEmail?.trim() || "—";
  const effectiveVerification = user?.verification ?? contractStatus;
  const effectivePlan = user?.currentPlan ?? planLabel ?? "FREE";
  const effectiveRoyaltyBalance =
    typeof user?.royaltyBalance === "number" ? formatRubCurrency(user.royaltyBalance) : balanceLabel;
  const effectiveAiBalance =
    typeof user?.aiTokenBalance === "number"
      ? formatAiTokenAmount(user.aiTokenBalance)
      : aiTokenBalanceLabel;
  const [nowTs, setNowTs] = React.useState(() => Date.now());
  const subscriptionExpiresLabel =
    hasSubscription && effectivePlan ? formatSubscriptionExpiry(subscriptionEndsAt, nowTs) : null;
  const [activeMenu, setActiveMenu] = React.useState<"user" | "ai" | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const aiButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const userButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const aiMenuRef = React.useRef<HTMLDivElement | null>(null);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = React.useState<{
    ai: { top: number; right: number } | null;
    user: { top: number; right: number } | null;
  }>({
    ai: null,
    user: null
  });

  React.useEffect(() => {
    if (!hasSubscription || !subscriptionEndsAt) return;
    const timer = window.setInterval(() => setNowTs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [hasSubscription, subscriptionEndsAt]);

  React.useEffect(() => {
    if (!activeMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const insideHeader = menuRef.current?.contains(target) ?? false;
      const insideAiMenu = aiMenuRef.current?.contains(target) ?? false;
      const insideUserMenu = userMenuRef.current?.contains(target) ?? false;
      if (!insideHeader && !insideAiMenu && !insideUserMenu) {
        setActiveMenu(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveMenu(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeMenu]);

  const updateMenuPositions = React.useCallback(() => {
    const nextAi = aiButtonRef.current?.getBoundingClientRect();
    const nextUser = userButtonRef.current?.getBoundingClientRect();

    setMenuPosition({
      ai: nextAi
        ? {
            top: nextAi.bottom + 8,
            right: Math.max(16, window.innerWidth - nextAi.right)
          }
        : null,
      user: nextUser
        ? {
            top: nextUser.bottom + 8,
            right: Math.max(16, window.innerWidth - nextUser.right)
          }
        : null
    });
  }, []);

  React.useEffect(() => {
    if (!activeMenu) return;
    updateMenuPositions();

    const handleViewportChange = () => updateMenuPositions();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [activeMenu, updateMenuPositions]);

  return (
    <div className="perf-fixed-layer fixed inset-x-0 top-0 z-50 mb-5 flex min-h-[var(--dashboard-mobile-header-height)] min-w-0 flex-wrap items-center gap-2 overflow-visible border-b border-white/[0.08] bg-[#0d0f16]/96 px-4 py-2 backdrop-blur-[6px] sm:px-6 lg:sticky lg:top-0 lg:z-[70] lg:isolate lg:-mx-8 lg:mb-6 lg:min-h-[72px] lg:gap-4 lg:bg-[#0d0f16]/92 lg:px-8 lg:py-0 lg:backdrop-blur-[2px]">
      <ServiceWorkStatus className="order-1 flex min-w-0 items-center gap-2.5" />

      <div className="order-2 ml-auto flex min-w-0 items-center gap-2 sm:gap-3" ref={menuRef}>
        {hasSubscription && effectivePlan ? (
          <div className="hidden shrink-0 flex-col items-end sm:flex">
            <span className="whitespace-nowrap rounded-md border border-white/[0.12] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-white/88 sm:text-[11px]">
              {effectivePlan}
            </span>
            {subscriptionExpiresLabel ? (
              <span className="mt-1 whitespace-nowrap text-[11px] font-medium text-white/55">
                {subscriptionExpiresLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        <Link
          href="/dashboard/finance"
          className="flex items-center gap-1.5 rounded-md border border-white/[0.12] bg-white/[0.03] px-2.5 py-1.5 text-[13px] font-medium text-white/88 transition-colors hover:border-white/[0.20] hover:bg-white/[0.05] sm:gap-2 sm:px-3 sm:py-2 sm:text-[14px]"
        >
          <Wallet className="h-3.5 w-3.5 text-white/70" />
          <span>{effectiveRoyaltyBalance}</span>
        </Link>

        <div className="relative">
          <button
            ref={aiButtonRef}
            type="button"
            onClick={() => setActiveMenu((prev) => (prev === "ai" ? null : "ai"))}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition-colors sm:px-3 sm:py-2 sm:text-[14px]",
              activeMenu === "ai"
                ? "border-[#7b3df5]/40 bg-[#7b3df5]/10 text-white"
                : "border-white/[0.12] bg-white/[0.03] text-white/88 hover:border-white/[0.20] hover:bg-white/[0.05]"
            )}
          >
            <span className="relative h-4 w-4 overflow-hidden rounded-full border border-cyan-300/35 bg-[#0f1a2d] shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_0_12px_rgba(85,203,255,0.18)]">
              <Image
                src="/assets/ai-token-logo.png"
                alt=""
                fill
                sizes="16px"
                className="object-cover object-center"
                priority
              />
            </span>
            <span>AI: {effectiveAiBalance}</span>
            <ChevronDown className="h-3.5 w-3.5 text-white/50" />
          </button>

          {activeMenu === "ai" && menuPosition.ai
            ? createPortal(
                <div
                  ref={aiMenuRef}
                  className="fixed z-[120] min-w-[220px] rounded-xl border border-white/[0.12] bg-[#141824]/95 p-1.5 shadow-[0_16px_32px_-20px_rgba(0,0,0,0.78)] backdrop-blur-[8px]"
                  style={{
                    top: menuPosition.ai.top,
                    right: menuPosition.ai.right
                  }}
                >
                  <TopbarMenuLink href="/dashboard/ai-studio/image?buyTokens=1" icon={Coins} label="Пополнить токены" />
                  <TopbarMenuLink href="/dashboard/ai-tokens" icon={Wallet} label="История токенов" />
                  <TopbarMenuLink href="/dashboard/ai-studio/image" icon={Sparkles} label="AI Студия" />
                </div>,
                document.body
              )
            : null}
        </div>

        <div className="relative">
          <button
            ref={userButtonRef}
            type="button"
            onClick={() => setActiveMenu((prev) => (prev === "user" ? null : "user"))}
            className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05] sm:gap-3 sm:px-3 sm:py-2"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "user"}
          >
            <UserAvatar
              name={displayName}
              avatarUrl={user?.avatarUrl}
              size="sm"
              className="border-white/[0.10] bg-white/[0.08]"
            />
            <span className="min-w-0">
              <span className="block max-w-[120px] truncate text-[13px] font-medium text-white sm:max-w-[160px] sm:text-[14px]">
                {displayName}
              </span>
              <span className="hidden items-center gap-2 sm:flex">
                <span className="max-w-[220px] truncate text-[12px] font-medium text-white/60">
                  {displayEmail}
                </span>
                <VerificationStatusBadge
                  status={effectiveVerification.status}
                  className="-translate-y-0.5"
                />
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/50" />
          </button>

          {activeMenu === "user" && menuPosition.user
            ? createPortal(
                <div
                  ref={userMenuRef}
                  className="fixed z-[120] min-w-[260px] rounded-xl border border-white/[0.12] bg-[#141824]/95 p-1.5 shadow-[0_16px_32px_-20px_rgba(0,0,0,0.78)] backdrop-blur-[8px]"
                  style={{
                    top: menuPosition.user.top,
                    right: menuPosition.user.right
                  }}
                >
                  <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-3">
                    <div className="text-[15px] font-semibold text-white">{displayName}</div>
                    <div className="mt-1 text-[12px] font-medium text-white/52">{effectivePlan}</div>
                    <div className="mt-3 grid gap-2">
                      <MenuStat label="AI-токены" value={effectiveAiBalance} />
                      <MenuStat label="Роялти" value={effectiveRoyaltyBalance} />
                    </div>
                  </div>
                  <div className="mt-1.5 grid gap-1">
                    <TopbarMenuLink href="/dashboard/profile" icon={UserRound} label="Профиль" />
                    <TopbarMenuLink href="/dashboard/ai-tokens" icon={Coins} label="История токенов" />
                    <TopbarMenuLink href="/dashboard/ai-studio/archive" icon={Sparkles} label="История генераций" />
                    <TopbarMenuLink href="/dashboard/ai-studio/chat" icon={Sparkles} label="Настройки AI" />
                    <button
                      type="button"
                      onClick={() => {
                        setActiveMenu(null);
                        import("next-auth/react").then((m) => m.signOut({ callbackUrl: "/login" }));
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white"
                    >
                      <LogOut className="h-4 w-4" />
                      <span>Выход</span>
                    </button>
                  </div>
                </div>,
                document.body
              )
            : null}
        </div>
      </div>
    </div>
  );
}

function MenuStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[13px] font-medium text-white/72">
      <span>{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function TopbarMenuLink({
  href,
  icon: Icon,
  label
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white"
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}
