"use client";

import * as React from "react";
import Link from "next/link";
import { Users } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * "Выпустить за бонус" on the review step: shown when the artist has bonus releases earned for
 * paying friends. On by default unless the subscription already covers this release.
 */
export function ReferralBonusOption({
  enabled,
  onChange
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const [status, setStatus] = React.useState<{ balance: number; subscriptionCovers: boolean } | null>(null);
  const touchedRef = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/referrals/bonus", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled) setStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = (status?.balance ?? 0) > 0;
  React.useEffect(() => {
    if (!available && enabled) onChange(false);
    else if (available && !status?.subscriptionCovers && !enabled && !touchedRef.current) onChange(true);
  }, [available, status?.subscriptionCovers, enabled, onChange]);

  if (!available || !status) return null;

  return (
    <section className="rounded-[26px] border border-emerald-400/25 bg-[linear-gradient(180deg,rgba(16,120,90,0.30),rgba(11,14,25,0.98))] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-emerald-400/15 text-emerald-200">
          <Users className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-white">Бонусный релиз за друзей</h3>
          <p className="mt-1 text-[13px] leading-6 text-white/60">
            Осталось: {status.balance}. Релиз уйдёт без оплаты; тексты, караоке и видео оплачиваются отдельно.{" "}
            <Link href="/dashboard/referrals" className="font-medium text-emerald-200 transition hover:text-white">
              Пригласить ещё
            </Link>
          </p>
        </div>
      </div>
      <label
        className={cn(
          "mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-[18px] border px-4 py-3 transition-colors",
          enabled ? "border-emerald-300/40 bg-emerald-400/[0.10]" : "border-white/[0.08] bg-black/20"
        )}
      >
        <span className="text-[13.5px] font-medium text-white">
          {status.subscriptionCovers ? "Использовать бонус вместо подписки" : "Выпустить этот релиз за бонус — 0 ₽"}
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            touchedRef.current = true;
            onChange(event.target.checked);
          }}
          className="h-5 w-5 accent-emerald-400"
        />
      </label>
    </section>
  );
}
