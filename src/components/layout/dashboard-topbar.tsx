"use client";

import Link from "next/link";
import * as React from "react";
import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { useCurrentUser } from "@/components/user/user-provider";
import { UserAvatar } from "@/components/user/user-avatar";
import { ServiceWorkStatus } from "@/components/layout/service-work-status";
import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { VerificationStatusBadge } from "@/components/verification/verification-status-badge";

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
  hasSubscription,
  subscriptionEndsAt,
  contractStatus
}: {
  userName: string;
  userEmail?: string;
  planLabel?: string;
  balanceLabel: string;
  hasSubscription: boolean;
  subscriptionEndsAt?: string | null;
  contractStatus: ContractStatusPayload;
}) {
  const { user } = useCurrentUser();
  const displayName = user?.name?.trim() || userName || "Пользователь";
  const displayEmail = user?.email?.trim() || userEmail?.trim() || "—";
  const effectiveVerification = user?.verification ?? contractStatus;
  const [nowTs, setNowTs] = React.useState(() => Date.now());
  const subscriptionExpiresLabel =
    hasSubscription && planLabel
      ? formatSubscriptionExpiry(subscriptionEndsAt, nowTs)
      : null;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!hasSubscription || !subscriptionEndsAt) return;
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [hasSubscription, subscriptionEndsAt]);

  React.useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (!menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-6 flex h-[72px] min-w-0 items-center gap-4 overflow-x-clip border-b border-white/[0.08] bg-[#0d0f16]/92 px-4 backdrop-blur-[4px] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <ServiceWorkStatus className="flex min-w-0 items-center gap-2.5" />

      <div className="ml-auto flex min-w-0 items-center gap-3">
        {hasSubscription && planLabel ? (
          <div className="flex shrink-0 flex-col items-end">
            <span className="whitespace-nowrap rounded-md border border-white/[0.12] bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] text-white/88">
              {planLabel}
            </span>
            {subscriptionExpiresLabel ? (
              <span className="mt-1 hidden whitespace-nowrap text-[11px] font-medium text-white/55 sm:block">
                {subscriptionExpiresLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        <Link
          href="/dashboard/finance"
          className="flex items-center gap-2 rounded-md border border-white/[0.12] bg-white/[0.03] px-3 py-2 text-[14px] font-medium text-white/88 transition-colors hover:border-white/[0.20] hover:bg-white/[0.05]"
        >
          <Wallet className="h-3.5 w-3.5 text-white/70" />
          <span className="font-medium">{balanceLabel}</span>
        </Link>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.05]"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <UserAvatar
              name={displayName}
              avatarUrl={user?.avatarUrl}
              size="sm"
              className="border-white/[0.10] bg-white/[0.08]"
            />
            <span className="min-w-0">
              <span className="block max-w-[160px] truncate text-[14px] font-medium text-white">
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

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] z-40 min-w-[180px] rounded-xl border border-white/[0.12] bg-[#141824]/95 p-1.5 shadow-[0_22px_44px_-24px_rgba(0,0,0,0.85)] backdrop-blur-xl"
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  import("next-auth/react").then((m) => m.signOut({ callbackUrl: "/login" }));
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                <span>Выход</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
