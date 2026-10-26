"use client";

import * as React from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AnalyticsReleaseListItemResponse } from "@/lib/api/contracts";
import { normalizeAnalyticsPeriodDays } from "@/lib/analytics-period";

export interface AnalyticsFilterState {
  releaseId: string;
  country: string;
  upc: string;
  platform: string;
  days: number;
}

interface AnalyticsFiltersProps {
  value: AnalyticsFilterState;
  releases: AnalyticsReleaseListItemResponse[];
  onChange: (next: AnalyticsFilterState) => void;
}

const PERIOD_CHIPS = [
  { days: 7, label: "Неделя" },
  { days: 30, label: "30 дней" },
  { days: 180, label: "6 месяцев" },
  { days: 365, label: "Год" }
] as const;

const fieldClass =
  "h-10 w-full rounded-xl border border-white/[0.1] bg-black/25 px-3 text-[13px] font-medium text-white outline-none transition-colors placeholder:text-white/40 focus:border-[#7b3df5]/60";

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilterState = {
  releaseId: "",
  country: "",
  upc: "",
  platform: "",
  days: 30
};

export function AnalyticsFilters({ value, releases, onChange }: AnalyticsFiltersProps) {
  const extraFiltersCount = (value.country.trim() ? 1 : 0) + (value.upc.trim() ? 1 : 0);
  const [extraOpen, setExtraOpen] = React.useState(extraFiltersCount > 0);
  const isDefault =
    !value.releaseId && !value.country && !value.upc && !value.platform && value.days === DEFAULT_ANALYTICS_FILTERS.days;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.04] p-1" role="tablist" aria-label="Период">
          {PERIOD_CHIPS.map((chip) => {
            const active = value.days === chip.days;
            return (
              <button
                key={chip.days}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChange({ ...value, days: normalizeAnalyticsPeriodDays(chip.days) })}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition",
                  active
                    ? "bg-[#7b3df5] text-white shadow-[0_6px_18px_-6px_rgba(123,61,245,0.8)]"
                    : "text-white/55 hover:text-white"
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <select
            aria-label="Релиз"
            className="h-10 appearance-none rounded-xl border border-white/[0.1] bg-black/25 pl-3 pr-9 text-[13px] font-semibold text-white outline-none focus:border-[#7b3df5]/60"
            value={value.releaseId}
            onChange={(event) => onChange({ ...value, releaseId: event.target.value })}
          >
            <option value="">Все релизы</option>
            {releases.map((release) => (
              <option key={release.release_id} value={release.release_id}>
                {release.title}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
        </div>

        <button
          type="button"
          onClick={() => setExtraOpen((prev) => !prev)}
          aria-expanded={extraOpen}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold transition",
            extraOpen || extraFiltersCount > 0
              ? "border-[#7b3df5]/40 bg-[#7b3df5]/15 text-white"
              : "border-white/[0.1] bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Фильтры{extraFiltersCount > 0 ? ` · ${extraFiltersCount}` : ""}
        </button>

        {!isDefault ? (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_ANALYTICS_FILTERS)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold text-white/55 transition hover:text-white"
          >
            <X className="h-4 w-4" />
            Сбросить
          </button>
        ) : null}
      </div>

      {extraOpen ? (
        <div className="grid max-w-xl gap-3 sm:grid-cols-2">
          <label className="text-[12px] font-semibold text-white/55">
            Страна
            <input
              className={`${fieldClass} mt-1.5`}
              placeholder="Код страны, например RU"
              value={value.country}
              onChange={(event) => onChange({ ...value, country: event.target.value.toUpperCase() })}
            />
          </label>
          <label className="text-[12px] font-semibold text-white/55">
            UPC
            <input
              className={`${fieldClass} mt-1.5`}
              placeholder="UPC релиза"
              value={value.upc}
              onChange={(event) => onChange({ ...value, upc: event.target.value })}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
