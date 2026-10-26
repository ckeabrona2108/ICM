"use client";

import Link from "next/link";
import Image from "next/image";
import * as React from "react";
import { signOut } from "next-auth/react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Coins,
  FileSpreadsheet,
  LogOut,
  MessageSquareText,
  Music2,
  PanelLeft,
  Plus,
  Sparkles,
  UserRound,
  Wallet
} from "lucide-react";

import { useCurrentUser } from "@/components/user/user-provider";
import { UserAvatar } from "@/components/user/user-avatar";
import { ServiceWorkStatus } from "@/components/layout/service-work-status";
import { VerifiedBadge } from "@/components/uitripled/native-verified-badge-shadcnui";
import type {
  DashboardNotificationItemResponse,
  DashboardNotificationsResponse
} from "@/lib/api/contracts";
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

function formatNotificationTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));
  if (diffMinutes < 60) {
    return `${diffMinutes} ${formatRuCount(diffMinutes, "минуту", "минуты", "минут")} назад`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${formatRuCount(diffHours, "час", "часа", "часов")} назад`;
  }

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export function shouldShowNotificationTimestamp(kind: DashboardNotificationItemResponse["kind"]): boolean {
  return kind !== "report_ready" && kind !== "report_changes_requested" && kind !== "report_agreed";
}

export function optimisticallyMarkNotificationRead(
  current: DashboardNotificationsResponse,
  notificationId: string
): DashboardNotificationsResponse {
  const target = current.items.find((item) => item.id === notificationId);
  if (!target?.isUnread) return current;

  return {
    unreadCount: Math.max(0, current.unreadCount - 1),
    items: current.items.map((item) =>
      item.id === notificationId ? { ...item, isUnread: false } : item
    )
  };
}

export function restoreOptimisticNotificationRead(
  current: DashboardNotificationsResponse,
  notificationId: string
): DashboardNotificationsResponse {
  const target = current.items.find((item) => item.id === notificationId);
  if (!target || target.isUnread) return current;

  return {
    unreadCount: current.unreadCount + 1,
    items: current.items.map((item) =>
      item.id === notificationId ? { ...item, isUnread: true } : item
    )
  };
}

function getNotificationMeta(kind: DashboardNotificationItemResponse["kind"]): {
  icon: React.ComponentType<{ className?: string }>;
  toneClassName: string;
} {
  switch (kind) {
    case "release_approved":
    case "report_agreed":
    case "payout_paid":
      return {
        icon: CheckCircle2,
        toneClassName: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
      };
    case "support_reply":
    case "collaboration_response_received":
      return {
        icon: MessageSquareText,
        toneClassName: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200"
      };
    case "artist_release_published":
    case "artist_post_published":
      return {
        icon: Music2,
        toneClassName: "border-violet-400/20 bg-violet-500/10 text-violet-200"
      };
    case "report_ready":
    case "report_changes_requested":
      return {
        icon: FileSpreadsheet,
        toneClassName: "border-sky-400/20 bg-sky-500/10 text-sky-200"
      };
    case "payout_requested":
    case "payout_rejected":
      return {
        icon: CircleDollarSign,
        toneClassName: "border-amber-400/20 bg-amber-500/10 text-amber-200"
      };
    default:
      return {
        icon: AlertCircle,
        toneClassName: "border-violet-400/20 bg-violet-500/10 text-violet-200"
      };
  }
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
  const [activeMenu, setActiveMenu] = React.useState<"user" | "ai" | "notifications" | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const aiButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const notificationsButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const userButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const aiMenuRef = React.useRef<HTMLDivElement | null>(null);
  const notificationsMenuRef = React.useRef<HTMLDivElement | null>(null);
  const userMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = React.useState<{
    ai: { top: number; right: number } | null;
    notifications: { top: number; right: number } | null;
    user: { top: number; right: number } | null;
  }>({
    ai: null,
    notifications: null,
    user: null
  });
  const [isDesktopViewport, setIsDesktopViewport] = React.useState(false);
  const [notifications, setNotifications] = React.useState<DashboardNotificationsResponse>({
    unreadCount: 0,
    items: []
  });
  const [notificationsLoading, setNotificationsLoading] = React.useState(true);
  const handleLogout = React.useCallback(async () => {
    try {
      await signOut({ redirect: false });
    } finally {
      window.location.assign("/login");
    }
  }, []);

  React.useEffect(() => {
    const syncViewport = () => setIsDesktopViewport(window.innerWidth >= 640);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

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
      const insideNotificationsMenu = notificationsMenuRef.current?.contains(target) ?? false;
      const insideUserMenu = userMenuRef.current?.contains(target) ?? false;
      if (!insideHeader && !insideAiMenu && !insideNotificationsMenu && !insideUserMenu) {
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

  React.useEffect(() => {
    let cancelled = false;

    const loadNotifications = async (showLoader: boolean) => {
      if (showLoader) {
        setNotificationsLoading(true);
      }
      try {
        const response = await fetch("/api/dashboard/notifications", {
          method: "GET",
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("Не удалось загрузить уведомления.");
        }
        const payload = (await response.json()) as DashboardNotificationsResponse;
        if (!cancelled) {
          setNotifications(payload);
        }
      } catch {
        if (!cancelled) {
          setNotifications((current) => current);
        }
      } finally {
        if (!cancelled) {
          setNotificationsLoading(false);
        }
      }
    };

    void loadNotifications(true);

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadNotifications(false);
    }, 45_000);

    const onFocus = () => {
      void loadNotifications(false);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const markAllNotificationsAsRead = React.useCallback(async () => {
    const previous = notifications;
    setNotifications((current) => ({
      unreadCount: 0,
      items: current.items.map((item) => ({ ...item, isUnread: false }))
    }));
    try {
      const response = await fetch("/api/dashboard/notifications", { method: "PATCH" });
      if (!response.ok) throw new Error("Не удалось сохранить статус уведомлений.");
    } catch {
      setNotifications(previous);
    }
  }, [notifications]);

  const markNotificationAsRead = React.useCallback(async (notificationId: string) => {
    const target = notifications.items.find((item) => item.id === notificationId);
    if (!target?.isUnread) return;

    setNotifications((current) => optimisticallyMarkNotificationRead(current, notificationId));
    try {
      const response = await fetch(
        `/api/dashboard/notifications/${encodeURIComponent(notificationId)}`,
        { method: "PATCH" }
      );
      if (!response.ok) throw new Error("Не удалось сохранить статус уведомления.");
    } catch (error) {
      setNotifications((current) => restoreOptimisticNotificationRead(current, notificationId));
      throw error;
    }
  }, [notifications.items]);

  const updateMenuPositions = React.useCallback(() => {
    const nextAi = aiButtonRef.current?.getBoundingClientRect();
    const nextNotifications = notificationsButtonRef.current?.getBoundingClientRect();
    const nextUser = userButtonRef.current?.getBoundingClientRect();

    setMenuPosition({
      ai: nextAi
        ? {
            top: nextAi.bottom + 8,
            right: Math.max(16, window.innerWidth - nextAi.right)
          }
        : null,
      notifications: nextNotifications
        ? {
            top: nextNotifications.bottom + 8,
            right: Math.max(16, window.innerWidth - nextNotifications.right)
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
    <div className="perf-fixed-layer fixed inset-x-0 top-0 z-50 mb-4 flex min-h-[var(--dashboard-mobile-header-height)] min-w-0 flex-wrap items-center gap-2 overflow-visible border-b border-white/[0.08] bg-[#0d0f16]/96 px-4 pb-1.5 pt-[calc(env(safe-area-inset-top)+0.375rem)] backdrop-blur-[6px] sm:px-6 lg:sticky lg:top-0 lg:z-[70] lg:isolate lg:-mx-8 lg:mb-6 lg:min-h-[72px] lg:gap-4 lg:bg-[#0d0f16]/92 lg:px-8 lg:py-0 lg:pt-0 lg:backdrop-blur-[2px]">
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new CustomEvent("dashboard:toggle-mobile-sidebar"));
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.04] text-white/82 transition-colors hover:bg-white/[0.08] lg:hidden"
        aria-label="Открыть меню кабинета"
      >
        <PanelLeft className="h-4.5 w-4.5" />
      </button>

      <ServiceWorkStatus pill className="order-1 flex min-w-0 items-center gap-2.5" />

      <div
        className="order-2 ml-auto flex min-w-0 items-center gap-0.5 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-1 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.9)]"
        ref={menuRef}
      >
        {/* One capsule: wallet · AI · notifications · profile, separated by thin dividers. */}
        <div className="relative flex shrink-0 items-center">
        <Link
          href="/dashboard/finance"
          className="flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-white/[0.06] sm:gap-2 sm:px-3 sm:text-[14px]"
        >
          <Wallet className="h-4 w-4 text-white/50" />
          <span className="tabular-nums">{effectiveRoyaltyBalance}</span>
        </Link>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-white/[0.08]" />

          <button
            ref={aiButtonRef}
            type="button"
            onClick={() => setActiveMenu((prev) => (prev === "ai" ? null : "ai"))}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-2.5 text-[13px] font-semibold transition-colors sm:text-[14px]",
              activeMenu === "ai" ? "bg-white/[0.07] text-white" : "text-white/90 hover:bg-white/[0.06]"
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
            <ChevronDown className="h-3.5 w-3.5 text-white/40" />
          </button>
          <Link
            href="/dashboard/ai-studio/image?buyTokens=1"
            aria-label="Пополнить AI-токены"
            title="Пополнить AI-токены"
            className="hidden h-7 w-7 place-items-center rounded-full bg-white/[0.06] text-white/70 transition hover:bg-[#7b61ff] hover:text-white sm:grid"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
          </Link>
          <span aria-hidden className="mx-1 h-5 w-px bg-white/[0.08]" />

          {activeMenu === "ai" && menuPosition.ai
            ? createPortal(
                <div
                  ref={aiMenuRef}
                  className="ux-floating fixed z-[120] min-w-[220px] rounded-xl p-1.5"
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
            ref={notificationsButtonRef}
            type="button"
            onClick={() => setActiveMenu((prev) => (prev === "notifications" ? null : "notifications"))}
            className={cn(
              "relative inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
              activeMenu === "notifications" ? "bg-white/[0.07] text-white" : "text-white/75 hover:bg-white/[0.06] hover:text-white"
            )}
            aria-label="Открыть уведомления"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "notifications"}
          >
            <Bell className="h-4 w-4" />
            {notifications.unreadCount > 0 ? (
              <span className="absolute right-0.5 top-0.5 inline-flex min-w-[17px] items-center justify-center rounded-full bg-[#ff4f8b] px-1 py-0.5 text-[9.5px] font-bold leading-none text-white shadow-[0_0_0_2px_#12141b]">
                {notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}
              </span>
            ) : null}
          </button>

          {activeMenu === "notifications" && menuPosition.notifications
            ? createPortal(
                <div
                  ref={notificationsMenuRef}
                  className="fixed left-3 right-3 z-[120] w-auto overflow-hidden rounded-2xl border border-white/[0.09] bg-[#141624]/98 shadow-[0_30px_70px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl sm:left-auto sm:w-[min(390px,calc(100vw-24px))]"
                  style={{
                    top: menuPosition.notifications.top,
                    ...(isDesktopViewport
                      ? { right: menuPosition.notifications.right }
                      : {})
                  }}
                >
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] font-semibold text-white">Уведомления</span>
                      {notifications.unreadCount > 0 ? (
                        <span className="rounded-full bg-[#ff4f8b]/15 px-2 py-0.5 text-[11px] font-bold text-[#ff8db5]">
                          {notifications.unreadCount} новых
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={markAllNotificationsAsRead}
                      disabled={notifications.unreadCount === 0}
                      className="text-[12px] font-semibold text-[#b9a8ff] transition-colors hover:text-white disabled:cursor-default disabled:text-white/30"
                    >
                      Прочитать все
                    </button>
                  </div>

                  <div className="max-h-[440px] overflow-y-auto p-1.5">
                    {notificationsLoading ? (
                      <div className="rounded-lg px-3 py-6 text-center text-[13px] text-white/55">
                        Загружаем уведомления...
                      </div>
                    ) : notifications.items.length > 0 ? (
                      <div className="grid gap-0.5">
                        {notifications.items.map((item) => (
                          <NotificationMenuItem
                            key={item.id}
                            item={item}
                            onNavigate={() => setActiveMenu(null)}
                            onRead={markNotificationAsRead}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="px-3 py-8 text-center">
                        <Bell className="mx-auto h-6 w-6 text-white/25" />
                        <p className="mt-2 text-[13px] text-white/55">Пока ничего нет</p>
                      </div>
                    )}
                  </div>
                </div>,
                document.body
              )
            : null}
        </div>

        <span aria-hidden className="mx-1 h-5 w-px bg-white/[0.08]" />

        <div className="relative">
          <button
            ref={userButtonRef}
            type="button"
            onClick={() => setActiveMenu((prev) => (prev === "user" ? null : "user"))}
            className={cn(
              "flex h-9 min-w-0 items-center gap-2 rounded-xl pl-1 pr-1 text-left transition-colors sm:gap-2.5 sm:pr-2.5",
              activeMenu === "user" ? "bg-white/[0.07]" : "hover:bg-white/[0.06]"
            )}
            aria-haspopup="menu"
            aria-expanded={activeMenu === "user"}
          >
            <UserAvatar
              name={displayName}
              avatarUrl={user?.avatarUrl}
              size="sm"
              className="border-white/[0.10] bg-white/[0.08]"
            />
            <span className="hidden min-w-0 sm:block">
              <span className="flex max-w-[120px] items-center gap-1.5 leading-tight sm:max-w-[160px]">
                <span className="truncate text-[13px] font-semibold text-white">
                  {displayName}
                </span>
                {effectiveVerification.status === "approved" ? (
                  <VerifiedBadge
                    variant="blue"
                    size="sm"
                    tooltip="Верифицированный профиль"
                    className="-translate-y-0.5 shrink-0"
                  />
                ) : null}
              </span>
              <span className="hidden items-center gap-2 leading-tight sm:flex">
                <span
                  className={cn(
                    "max-w-[180px] truncate text-[11px] font-medium",
                    hasSubscription && effectivePlan ? "font-semibold text-[#b9a8ff]" : "text-white/45"
                  )}
                >
                  {hasSubscription && effectivePlan ? `Тариф ${effectivePlan}` : "Без подписки"}
                </span>
                {effectiveVerification.status !== "approved" ? (
                  <VerificationStatusBadge
                    status={effectiveVerification.status}
                    className="-translate-y-0.5"
                  />
                ) : null}
              </span>
            </span>
            <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-white/50 sm:block" />
          </button>

          {activeMenu === "user" && menuPosition.user
            ? createPortal(
                <div
                  ref={userMenuRef}
                  className="fixed z-[120] min-w-[270px] rounded-2xl border border-white/[0.09] bg-[#141624]/98 p-1.5 shadow-[0_30px_70px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl"
                  style={{
                    top: menuPosition.user.top,
                    right: menuPosition.user.right
                  }}
                >
                  <div className="ux-surface-soft rounded-lg px-3 py-3">
                    <div className="text-[15px] font-semibold text-white">{displayName}</div>
                    <div className="mt-0.5 truncate text-[12px] font-medium text-white/50">{displayEmail}</div>
                    <div className="mt-1.5 text-[12px] font-semibold text-[#b9a8ff]">
                      {effectivePlan}
                      {subscriptionExpiresLabel ? (
                        <span className="font-medium text-white/45"> · {subscriptionExpiresLabel}</span>
                      ) : null}
                    </div>
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
                        void handleLogout();
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
  label,
  onClick
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white"
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

function NotificationMenuItem({
  item,
  onNavigate,
  onRead
}: {
  item: DashboardNotificationItemResponse;
  onNavigate: () => void;
  onRead: (notificationId: string) => Promise<void>;
}) {
  const meta = getNotificationMeta(item.kind);
  const Icon = meta.icon;

  return (
    <Link
      href={item.href}
      onClick={async (event) => {
        event.preventDefault();
        try {
          await onRead(item.id);
        } catch {}
        onNavigate();
        window.location.assign(item.href);
      }}
      className={cn(
        "relative flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.05]",
        item.isUnread && "bg-[#7b61ff]/[0.07]"
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
          meta.toneClassName
        )}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-3">
          <span className="block text-[13px] font-semibold text-white">{item.title}</span>
          {item.isUnread ? (
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#7b61ff] shadow-[0_0_8px_rgba(123,97,255,0.9)]" />
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-white/58">
          {item.message}
        </span>
        {shouldShowNotificationTimestamp(item.kind) ? (
          <span className="mt-1.5 block text-[11px] font-medium text-white/36">
            {formatNotificationTimestamp(item.createdAt)}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
