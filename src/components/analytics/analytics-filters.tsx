"use client";

import type { AnalyticsReleaseListItemResponse } from "@/lib/api/contracts";
import { ANALYTICS_PERIOD_OPTIONS, normalizeAnalyticsPeriodDays } from "@/lib/analytics-period";

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

const fieldClass =
  "h-10 w-full rounded-xl border border-white/[0.12] bg-black/25 px-3 text-[14px] font-medium text-white outline-none transition-colors placeholder:text-white/45 focus:border-[#7b3df5]/60";

export function AnalyticsFilters({
  value,
  releases,
  onChange
}: AnalyticsFiltersProps) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#13151d]/85 p-4 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)] backdrop-blur-xl">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
          Релиз
          <select
            className={`${fieldClass} mt-1.5`}
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
        </label>

        <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
          Страна
          <input
            className={`${fieldClass} mt-1.5`}
            placeholder="Напр. RU"
            value={value.country}
            onChange={(event) => onChange({ ...value, country: event.target.value.toUpperCase() })}
          />
        </label>

        <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
          UPC
          <input
            className={`${fieldClass} mt-1.5`}
            placeholder="UPC"
            value={value.upc}
            onChange={(event) => onChange({ ...value, upc: event.target.value })}
          />
        </label>

        <label className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
          Период
          <select
            className={`${fieldClass} mt-1.5`}
            value={value.days}
            onChange={(event) =>
              onChange({ ...value, days: normalizeAnalyticsPeriodDays(event.target.value) })
            }
          >
            {ANALYTICS_PERIOD_OPTIONS.map((option) => (
              <option key={option.days} value={option.days}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            className="h-10 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-[14px] font-semibold text-white transition hover:bg-white/10"
            onClick={() =>
              onChange({
                releaseId: "",
                country: "",
                upc: "",
                platform: "",
                days: 30
              })
            }
          >
            Сбросить фильтры
          </button>
        </div>
      </div>
    </section>
  );
}
