"use client";

import Link from "next/link";
import Image from "next/image";
import * as React from "react";
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
  PanelLeft,
  Sparkles,
  UserRound,
  Wallet
} from "lucide-react";

import { useCurrentUser } from "@/components/user/user-provider";
import { UserAvatar } from "@/components/user/user-avatar";
import { ServiceWorkStatus } from "@/components/layout/service-work-status";
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

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = window.atob(base64);
  const result = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) {
    result[index] = bytes.charCodeAt(index);
  }
  return result.buffer;
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
      return {
        icon: MessageSquareText,
        toneClassName: "border-cyan-400/20 bg-cyan-500/10 text-cyan-200"
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
  const [notifications, setNotifications] = React.useState<DashboardNotificationsResponse>({
    unreadCount: 0,
    items: []
  });
  const [notificationsLoading, setNotificationsLoading] = React.useState(true);
  const [pushState, setPushState] = React.useState<
    "unsupported" | "idle" | "enabling" | "enabled" | "error"
  >("unsupported");
  const [pushPublicKey, setPushPublicKey] = React.useState<string | null>(null);

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

  React.useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return;
    }

    let cancelled = false;
    void fetch("/api/dashboard/notifications/push-subscription", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Push status unavailable");
        return response.json() as Promise<{ enabled: boolean; publicKey: string | null }>;
      })
      .then((payload) => {
        if (cancelled) return;
        setPushPublicKey(payload.publicKey);
        setPushState(payload.enabled ? "enabled" : "idle");
      })
      .catch(() => {
        if (!cancelled) setPushState("error");
      });

    return () => {
      cancelled = true;
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

  const enablePushNotifications = React.useCallback(async () => {
    if (!pushPublicKey || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    setPushState("enabling");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Push permission denied");

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToArrayBuffer(pushPublicKey)
      });
      const response = await fetch("/api/dashboard/notifications/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON())
      });
      if (!response.ok) throw new Error("Push subscription failed");
      setPushState("enabled");
    } catch {
      setPushState("error");
    }
  }, [pushPublicKey]);

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
            ref={notificationsButtonRef}
            type="button"
            onClick={() => setActiveMenu((prev) => (prev === "notifications" ? null : "notifications"))}
            className={cn(
              "relative inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors sm:h-10 sm:w-10",
              activeMenu === "notifications"
                ? "border-[#7b3df5]/40 bg-[#7b3df5]/10 text-white"
                : "border-white/[0.12] bg-white/[0.03] text-white/82 hover:border-white/[0.20] hover:bg-white/[0.05]"
            )}
            aria-label="Открыть уведомления"
            aria-haspopup="menu"
            aria-expanded={activeMenu === "notifications"}
          >
            <Bell className="h-4 w-4" />
            {notifications.unreadCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-[20px] items-center justify-center rounded-full border border-[#0d0f16] bg-emerald-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-[#05120b]">
                {notifications.unreadCount > 99 ? "99+" : notifications.unreadCount}
              </span>
            ) : null}
          </button>

          {activeMenu === "notifications" && menuPosition.notifications
            ? createPortal(
                <div
                  ref={notificationsMenuRef}
                  className="fixed z-[120] w-[min(380px,calc(100vw-24px))] rounded-xl border border-white/[0.12] bg-[#141824]/95 p-1.5 shadow-[0_16px_32px_-20px_rgba(0,0,0,0.78)] backdrop-blur-[8px]"
                  style={{
                    top: menuPosition.notifications.top,
                    right: menuPosition.notifications.right
                  }}
                >
                  <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                    <div>
                      <div className="text-[14px] font-semibold text-white">Уведомления</div>
                      <div className="text-[12px] text-white/50">
                        {notifications.unreadCount > 0
                          ? `${notifications.unreadCount} новых`
                          : "Новых уведомлений нет"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={markAllNotificationsAsRead}
                      disabled={notifications.unreadCount === 0}
                      className="text-[12px] font-medium text-white/55 transition-colors hover:text-white disabled:cursor-default disabled:text-white/30"
                    >
                      Прочитать все
                    </button>
                  </div>

                  {pushPublicKey && pushState !== "unsupported" ? (
                    <div className="mt-1.5 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2.5">
                      {pushState === "enabled" ? (
                        <div className="text-[12px] font-medium text-emerald-300">
                          PWA-уведомления включены
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={enablePushNotifications}
                          disabled={pushState === "enabling"}
                          className="text-[12px] font-medium text-white/65 transition-colors hover:text-white disabled:cursor-wait disabled:text-white/35"
                        >
                          {pushState === "enabling" ? "Включаем..." : "Включить PWA-уведомления"}
                        </button>
                      )}
                    </div>
                  ) : null}

                  <div className="mt-1.5 max-h-[420px] overflow-y-auto pr-1">
                    {notificationsLoading ? (
                      <div className="rounded-lg px-3 py-6 text-center text-[13px] text-white/55">
                        Загружаем уведомления...
                      </div>
                    ) : notifications.items.length > 0 ? (
                      <div className="grid gap-1">
                        {notifications.items.map((item) => (
                          <NotificationMenuItem
                            key={item.id}
                            item={item}
                            onNavigate={() => setActiveMenu(null)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg px-3 py-6 text-center text-[13px] text-white/55">
                        Пока ничего нет.
                      </div>
                    )}
                  </div>
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
  onNavigate
}: {
  item: DashboardNotificationItemResponse;
  onNavigate: () => void;
}) {
  const meta = getNotificationMeta(item.kind);
  const Icon = meta.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-white/[0.05]"
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
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          ) : null}
        </span>
        <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-white/58">
          {item.message}
        </span>
        <span className="mt-1.5 block text-[11px] font-medium text-white/36">
          {formatNotificationTimestamp(item.createdAt)}
        </span>
      </span>
    </Link>
  );
}
