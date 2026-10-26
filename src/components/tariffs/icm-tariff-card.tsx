"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import type { IcmTariffTier } from "@/lib/icm-tariffs";

function cleanLeadingDecor(value: string): string {
  return value.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function IcmTariffCardBase({
  tier,
  className,
  ctaMode = "landing",
  ctaLabel,
  showTierBadge = false,
  showCurrentPlanBadge,
  ctaDisabled,
  ctaLoading,
  onCtaClick
}: {
  tier: IcmTariffTier;
  className?: string;
  /** landing — текст с лендинга; dashboard — действие в ЛК */
  ctaMode?: "landing" | "dashboard";
  ctaLabel?: string;
  showTierBadge?: boolean;
  showCurrentPlanBadge?: boolean;
  ctaDisabled?: boolean;
  ctaLoading?: boolean;
  onCtaClick?: () => void;
}) {
  const btnLabel =
    ctaLabel ?? (ctaMode === "dashboard" ? "Подключить" : cleanLeadingDecor(tier.button.label));
  const description = cleanLeadingDecor(tier.description);
  const features = tier.features.map(cleanLeadingDecor);
  const footer = cleanLeadingDecor(tier.footer);
  const handleCtaClick = React.useCallback(() => {
    if (onCtaClick) {
      onCtaClick();
      return;
    }
    if (ctaMode === "landing" && typeof window !== "undefined") {
      window.location.href = "/register";
    }
  }, [ctaMode, onCtaClick]);

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-[28px] border p-6 transition-[transform,border-color,box-shadow] duration-200 sm:p-7",
        tier.popular
          ? "z-10 border-[#8a6bff]/80 bg-[radial-gradient(circle_at_top,rgba(122,97,255,0.28),transparent_45%),linear-gradient(180deg,rgba(24,22,42,0.98),rgba(12,12,20,0.98))] shadow-[0_0_0_6px_rgba(123,97,255,0.10),0_40px_110px_-40px_rgba(123,97,255,0.85)] lg:-my-4 lg:py-10"
          : "border-white/[0.07] bg-[linear-gradient(180deg,rgba(18,19,29,0.98),rgba(11,12,18,0.98))] shadow-[0_20px_70px_-52px_rgba(0,0,0,0.9)] hover:-translate-y-0.5 hover:border-white/[0.14]",
        className
      )}
    >
      {tier.popular ? (
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(168,140,255,1),transparent)]" />
      ) : null}

      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[24px] font-bold tracking-[-0.03em] text-white sm:text-[26px]">{tier.title}</h3>
        <div className="flex flex-col items-end gap-2">
          {tier.popular ? (
            <span className="inline-flex items-center rounded-full bg-[#7b61ff] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_8px_24px_-8px_rgba(123,97,255,0.9)]">
              Самый популярный
            </span>
          ) : null}
          {showCurrentPlanBadge ? (
            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
              Текущий план
            </span>
          ) : null}
          {showTierBadge ? (
            <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
              {tier.badge}
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-[14px] leading-[1.55] text-white/58 sm:text-[15px]">{description}</p>

      <div className="mt-6">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              "font-bold tracking-[-0.04em] text-white",
              tier.popular ? "text-[48px] sm:text-[52px]" : "text-[40px] sm:text-[44px]"
            )}
          >
            {tier.price}
          </span>
          <span className="text-[15px] font-medium text-white/48">{tier.period}</span>
        </div>
        <div className="mt-1 flex min-h-[24px] flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium sm:text-[14px]">
          {tier.secondaryPrice ? (
            <span className="text-white/60">
              {tier.secondaryPrice.replace(/^или\s+/u, "≈ ").replace("/мес", " в месяц")}
            </span>
          ) : null}
          {tier.savingsNote ? (
            <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[12px] font-semibold text-emerald-300">
              {tier.savingsNote}
            </span>
          ) : null}
        </div>
      </div>

      {tier.promoBadge ? (
        <div
          className={cn(
            "mt-4 inline-flex w-fit max-w-full items-center rounded-full border px-3 py-1.5 text-[12px] font-semibold",
            tier.promoBadge.tone === "emerald"
              ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
              : "border-violet-400/30 bg-violet-500/12 text-violet-200"
          )}
        >
          {tier.promoBadge.label}
        </div>
      ) : null}

      <div className="mt-5 h-px w-full bg-white/[0.08]" />

      <ul className="mt-5 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-[14px] leading-relaxed text-white/80">
            <span
              className={cn(
                "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                tier.popular ? "bg-[#7b61ff] text-white" : "border border-white/[0.1] bg-white/[0.04] text-violet-200"
              )}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={2.6} />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[12.5px] leading-relaxed text-white/42">{footer}</p>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={handleCtaClick}
          disabled={ctaDisabled || ctaLoading}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center rounded-2xl px-5 text-[15px] font-semibold transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
            tier.popular
              ? "bg-[linear-gradient(135deg,#6848ff_0%,#7a5cff_52%,#9068ff_100%)] text-white shadow-[0_24px_54px_-22px_rgba(123,97,255,1)] hover:brightness-110"
              : "border border-white/[0.14] bg-white/[0.04] text-white/90 hover:border-white/[0.24] hover:bg-white/[0.08]",
            (ctaDisabled || ctaLoading) && "pointer-events-none opacity-60"
          )}
        >
          {ctaLoading ? "Переход к оплате..." : btnLabel}
        </button>
      </div>
    </div>
  );
}

export const IcmTariffCard = React.memo(IcmTariffCardBase);
IcmTariffCard.displayName = "IcmTariffCard";
