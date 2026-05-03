"use client";

import * as React from "react";
import { Camera, DollarSign, Mic2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { IcmTariffTier } from "@/lib/icm-tariffs";

const ICONS = {
  mic2: Mic2,
  camera: Camera,
  dollar: DollarSign
} as const;

function IcmTariffCardBase({
  tier,
  className,
  ctaMode = "landing",
  ctaLabel,
  showTierBadge = true,
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
  const Icon = ICONS[tier.icon];
  const btnLabel =
    ctaLabel ?? (ctaMode === "dashboard" ? "Подключить" : tier.button.label);

  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-[24px] border bg-[#101012] p-7 transition-[transform,border-color] duration-200 sm:p-8",
        tier.popular
          ? "border-[#7b61ff]/30 shadow-[0_14px_36px_-28px_rgba(123,97,255,0.45)]"
          : "border-white/[0.06] hover:border-white/[0.12]",
        "hover:-translate-y-0.5",
        className
      )}
    >
      {showTierBadge ? (
        <div className="absolute right-5 top-5 flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
          <span className="text-[11px] font-medium text-white/70">{tier.badge}</span>
        </div>
      ) : null}
      {showCurrentPlanBadge ? (
        <div className="absolute left-5 top-5 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
          Текущий план
        </div>
      ) : null}

      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${tier.iconColor}15`, color: tier.iconColor }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </div>

      <h3 className="mt-5 text-[24px] font-bold text-white">{tier.title}</h3>
      <p className="mt-3 text-[13.5px] leading-relaxed text-white/55">{tier.description}</p>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-[36px] font-bold text-white">{tier.price}</span>
        <span className="text-[13px] text-white/45">{tier.period}</span>
      </div>

      <ul className="mt-6 space-y-3">
        {tier.features.map((f) => (
          <li key={f} className="text-[13.5px] leading-relaxed text-white/75">
            {f}
          </li>
        ))}
      </ul>

      <p className="mt-6 border-t border-white/[0.06] pt-5 text-[12.5px] leading-relaxed text-white/45">
        {tier.footer}
      </p>

      <button
        type="button"
        onClick={onCtaClick}
        disabled={ctaDisabled || ctaLoading}
        className={cn(
          "mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5",
          tier.button.className,
          (ctaDisabled || ctaLoading) &&
            "pointer-events-none opacity-60"
        )}
      >
        {ctaLoading ? "Переход к оплате..." : btnLabel}
      </button>
    </div>
  );
}

export const IcmTariffCard = React.memo(IcmTariffCardBase);
IcmTariffCard.displayName = "IcmTariffCard";
