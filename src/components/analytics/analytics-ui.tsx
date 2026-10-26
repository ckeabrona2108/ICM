"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

export const ANALYTICS_PURPLE = "#7b3df5";
export const ANALYTICS_MINT = "#4fffd2";

const PLATFORM_COLOR_RULES: Array<[RegExp, string]> = [
  [/яндекс|yandex/iu, "#ffcc00"],
  [/vk|вк|boom/iu, "#2787f5"],
  [/spotify/iu, "#1ed760"],
  [/apple|itunes/iu, "#fa4b6a"],
  [/youtube/iu, "#ff3b30"],
  [/zvuk|звук|сберзвук/iu, "#a855f7"],
  [/deezer/iu, "#a238ff"],
  [/tiktok/iu, "#25f4ee"]
];
const FALLBACK_PLATFORM_COLORS = ["#7b3df5", "#4fffd2", "#fb923c", "#38bdf8", "#e879f9", "#facc15"];

export function getPlatformColor(platform: string, index: number): string {
  const rule = PLATFORM_COLOR_RULES.find(([pattern]) => pattern.test(platform));
  return rule ? rule[1] : FALLBACK_PLATFORM_COLORS[index % FALLBACK_PLATFORM_COLORS.length];
}

let regionNames: Intl.DisplayNames | null = null;

export function formatCountryName(code: string): string {
  const trimmed = code.trim();
  const normalized = trimmed.toUpperCase();
  if (!/^[A-Z]{2}$/u.test(normalized)) {
    // Some reports carry full country names, often in upper case ("РОССИЯ").
    if (!trimmed) return "Неизвестно";
    const lower = trimmed.toLocaleLowerCase("ru-RU");
    return lower.charAt(0).toLocaleUpperCase("ru-RU") + lower.slice(1);
  }
  try {
    regionNames ??= new Intl.DisplayNames(["ru"], { type: "region" });
    return regionNames.of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

export function formatCount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString("ru-RU");
}

export function formatShare(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return value >= 10 ? `${Math.round(value)}%` : `${value.toFixed(1).replace(".", ",")}%`;
}

export function formatReportDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "UTC" });
}

export function DeltaBadge({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  const tone =
    rounded > 0
      ? "bg-emerald-400/12 text-emerald-300"
      : rounded < 0
        ? "bg-rose-400/12 text-rose-300"
        : "bg-white/[0.07] text-white/55";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-bold", tone, className)}>
      {rounded > 0 ? "▲ " : rounded < 0 ? "▼ " : ""}
      {Math.abs(rounded)}%
    </span>
  );
}

export function Sparkline({
  values,
  color,
  className
}: {
  values: number[];
  color: string;
  className?: string;
}) {
  if (values.length < 2) return <div className={cn("h-9", className)} />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 30 - ((value - min) / span) * 26;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={cn("h-9 w-full", className)} aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/[0.06]", className)} />;
}

export function AnalyticsCard({
  title,
  hint,
  children,
  className
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-white/[0.08] bg-[#13151d]/85 p-4 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)] backdrop-blur-xl sm:p-5",
        className
      )}
    >
      {title ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[17px] font-semibold text-white">{title}</h3>
          {hint ? <div className="text-[12px] font-medium text-white/50">{hint}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ShareRow({
  label,
  value,
  share,
  color,
  active,
  muted,
  hideValue,
  onClick
}: {
  label: string;
  value: number;
  share: number;
  color: string;
  active?: boolean;
  muted?: boolean;
  /** Show only the share, e.g. when the absolute value covers a different period than the totals. */
  hideValue?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate text-left text-[14px] font-semibold text-white">{label}</span>
      <span className="hidden h-1.5 w-[38%] overflow-hidden rounded-full bg-white/[0.07] sm:block">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, share))}%`, backgroundColor: color }}
        />
      </span>
      {hideValue ? (
        <span className="w-16 text-right text-[14px] font-bold text-white">{formatShare(share)}</span>
      ) : (
        <>
          <span className="w-16 text-right text-[14px] font-bold text-white">{formatCount(value)}</span>
          <span className="w-12 text-right text-[12px] font-medium text-white/50">{formatShare(share)}</span>
        </>
      )}
    </>
  );

  const className = cn(
    "flex w-full items-center gap-3 border-t border-white/[0.06] px-1 py-2.5 first:border-t-0",
    muted && "opacity-45",
    onClick && "rounded-lg transition hover:bg-white/[0.03]",
    active && "bg-white/[0.05]"
  );

  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={active} className={className}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}
