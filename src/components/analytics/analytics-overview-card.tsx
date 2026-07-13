"use client";

import * as React from "react";

import type { AnalyticsOverviewResponse } from "@/lib/api/contracts";

function formatCount(value: number): string {
  return value.toLocaleString("ru-RU");
}

function AnalyticsOverviewValue({
  value,
  loading
}: {
  value: number | null | undefined;
  loading: boolean;
}) {
  if (loading) {
    return <span className="text-white/45">—</span>;
  }

  return <>{formatCount(value ?? 0)}</>;
}

function AnalyticsOverviewCardBase({
  data,
  loading = false
}: {
  data: AnalyticsOverviewResponse | null;
  loading?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.1] bg-[#13151d]/85 p-4 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)] backdrop-blur-xl sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold text-white">Прослушивания</h2>
          <p className="mt-1 text-[13px] font-medium text-white/60">
            {loading
              ? "Загружаем данные…"
              : data?.latest_report_date
              ? `Последний отчёт: ${data.latest_report_date}`
              : "Данных пока нет"}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#7b3df5]">
            Ваша топ площадка 🎉
          </p>
          <p className="mt-1 text-[14px] font-semibold text-white">
            {loading ? "Загрузка…" : (data?.top_platform ?? "—")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-white/10 bg-black/20 p-3.5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
            Прослушивания больше 30 секунд
          </p>
          <p className="mt-2 text-[clamp(1.1rem,2.2vw,1.55rem)] font-semibold leading-[1.15] text-white">
            <AnalyticsOverviewValue value={data?.total_pay_streams} loading={loading} />
          </p>
        </article>

        <article className="rounded-xl border border-white/10 bg-black/20 p-3.5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60">
            Все прослушивания
          </p>
          <p className="mt-2 text-[clamp(1.1rem,2.2vw,1.55rem)] font-semibold leading-[1.15] text-white">
            <AnalyticsOverviewValue value={data?.total_streams} loading={loading} />
          </p>
        </article>
      </div>
    </section>
  );
}

export const AnalyticsOverviewCard = React.memo(AnalyticsOverviewCardBase);
AnalyticsOverviewCard.displayName = "AnalyticsOverviewCard";
