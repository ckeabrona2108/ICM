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
    ctaLabel ?? (ctaMode === "dashboard" ? "Подключить" : tier.button.label);
  const description = cleanLeadingDecor(tier.description);
  const features = tier.features.map(cleanLeadingDecor);
  const footer = cleanLeadingDecor(tier.footer);
  const aiGiftDescription = tier.aiGiftDescription
    ? cleanLeadingDecor(tier.aiGiftDescription)
    : null;
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
        "group relative flex h-full flex-col overflow-hidden rounded-[28px] border bg-[radial-gradient(circle_at_top,rgba(122,97,255,0.12),transparent_34%),linear-gradient(180deg,rgba(18,19,29,0.98),rgba(11,12,18,0.98))] p-6 transition-[transform,border-color,box-shadow] duration-200 sm:p-7",
        tier.popular
          ? "border-[#8a6bff]/70 shadow-[0_30px_90px_-42px_rgba(123,97,255,0.72)]"
          : "border-white/[0.07] shadow-[0_20px_70px_-52px_rgba(0,0,0,0.9)] hover:border-white/[0.12]",
        "hover:-translate-y-0.5 hover:shadow-[0_32px_90px_-55px_rgba(123,97,255,0.48)]",
        className
      )}
    >
      {tier.popular ? (
        <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(148,113,255,0.95),transparent)]" />
      ) : null}

      {(showTierBadge || showCurrentPlanBadge || tier.popular) ? (
        <div className="absolute right-5 top-5 flex max-w-[48%] flex-col items-end gap-2 sm:right-6 sm:top-6">
          {showTierBadge ? (
            <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
              <span className="text-[11px] font-medium text-white/70">{tier.badge}</span>
            </div>
          ) : null}
          {showCurrentPlanBadge ? (
            <div className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
              Текущий план
            </div>
          ) : null}
          {tier.popular ? (
            <div
              className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/12 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-100"
            >
              Самый популярный
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="pr-24 sm:pr-28">
        <h3 className="text-[25px] font-bold tracking-[-0.04em] text-white sm:text-[27px]">
          {tier.title}
        </h3>
        <p className="mt-3 max-w-[28ch] text-[14px] leading-[1.55] text-white/58 sm:text-[15px]">
          {description}
        </p>
      </div>

      {tier.promoBadge ? (
        <div
          className={cn(
            "mt-4 inline-flex w-fit max-w-full items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold sm:text-[12px]",
            tier.promoBadge.tone === "emerald"
              ? "border-emerald-400/30 bg-emerald-500/12 text-emerald-200"
              : "border-violet-400/30 bg-violet-500/12 text-violet-200"
          )}
        >
          {tier.promoBadge.label}
        </div>
      ) : null}

      <div className="mt-6 rounded-[22px] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
        <div className="flex flex-wrap items-end gap-x-2 gap-y-1">
          <span className="text-[41px] font-semibold tracking-[-0.06em] text-white sm:text-[44px]">
            {tier.price}
          </span>
          <span className="pb-1 text-[15px] font-medium text-white/48">{tier.period}</span>
        </div>
        {tier.secondaryPrice ? (
          <p className="mt-1 text-[13px] font-medium text-white/64 sm:text-[14px]">
            {tier.secondaryPrice.replace(/^или\s+/u, "≈ ").replace("/мес", " в месяц")}
          </p>
        ) : null}
      </div>

      {tier.savingsNote ? (
        <div className="mt-3 inline-flex w-fit items-center rounded-full border border-emerald-400/28 bg-emerald-500/12 px-3 py-1.5 text-[12px] font-semibold text-emerald-200">
          <span className="mr-2 h-2 w-2 rounded-full bg-emerald-300" />
          {tier.savingsNote}
        </div>
      ) : null}

      <div className="mt-5 h-px w-full bg-white/[0.08]" />

      {aiGiftDescription ? (
        <div className="mt-4 rounded-[18px] border border-white/[0.07] bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-white/72">
          {aiGiftDescription}
        </div>
      ) : null}

      <ul className="mt-4 space-y-3">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3 text-[14px] leading-relaxed text-white/78">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-violet-200">
              <Check className="h-3.5 w-3.5" strokeWidth={2.3} />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 text-[12.5px] leading-relaxed text-white/42">
        {footer}
      </div>

      <div className="mt-auto pt-5">
        <button
          type="button"
          onClick={handleCtaClick}
          disabled={ctaDisabled || ctaLoading}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#6848ff_0%,#7a5cff_52%,#9068ff_100%)] px-5 text-[14px] font-semibold text-white shadow-[0_18px_40px_-18px_rgba(123,97,255,0.95)] transition-all duration-200 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
            tier.popular &&
              "shadow-[0_24px_54px_-22px_rgba(123,97,255,1)]",
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
