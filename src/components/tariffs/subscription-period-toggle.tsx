"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { SubscriptionBillingPeriod } from "@/lib/subscription-billing";

export function SubscriptionPeriodToggle({
  value,
  onChange,
  className
}: {
  value: SubscriptionBillingPeriod;
  onChange: (value: SubscriptionBillingPeriod) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] p-1.5",
        className
      )}
    >
      <ToggleButton active={value === "monthly"} onClick={() => onChange("monthly")}>
        Ежемесячно
      </ToggleButton>
      <ToggleButton active={value === "yearly"} onClick={() => onChange("yearly")}>
        Ежегодно
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-4 py-2 text-[13px] font-semibold transition-colors",
        active
          ? "bg-white text-[#111318]"
          : "text-white/72 hover:bg-white/[0.06] hover:text-white"
      )}
    >
      {children}
    </button>
  );
}
