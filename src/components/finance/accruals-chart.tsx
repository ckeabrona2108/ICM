"use client";

import * as React from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";

import { formatRubCurrency } from "@/lib/currency-format";
import type { FinanceReportClientItem } from "@/lib/finance-client";
import { cn } from "@/lib/utils";

type ChartView = "quarters" | "years";

type Bucket = {
  key: string;
  label: string;
  agreed: number;
  pending: number;
  total: number;
  cumulative: number;
};

const rubCompact = (value: number) =>
  value >= 1000
    ? `${(value / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} тыс`
    : Math.round(value).toLocaleString("ru-RU");

function reportQuarterYear(report: FinanceReportClientItem): { quarter: number; year: number } | null {
  if (report.quarter && report.year) return { quarter: report.quarter, year: report.year };
  const date = new Date(report.periodEnd || report.periodStart);
  if (Number.isNaN(date.getTime())) return null;
  return { quarter: Math.floor(date.getUTCMonth() / 3) + 1, year: date.getUTCFullYear() };
}

function toBuckets(
  entries: Array<{ key: string; label: string; reports: FinanceReportClientItem[] }>
): Bucket[] {
  let running = 0;
  return entries.map((entry) => {
    const agreed = entry.reports.filter((r) => r.status === "agreed").reduce((sum, r) => sum + r.amount, 0);
    const pending = entry.reports.filter((r) => r.status === "ready_to_confirm").reduce((sum, r) => sum + r.amount, 0);
    running += agreed + pending;
    return {
      key: entry.key,
      label: entry.label,
      agreed,
      pending,
      total: agreed + pending,
      cumulative: running
    };
  });
}

/** Accruals by quarter (within a year) or by year, built from the artist's reports. */
export function AccrualsChart({ reports }: { reports: FinanceReportClientItem[] }) {
  // Reports sent back for rework are not money yet.
  const counted = React.useMemo(
    () =>
      reports
        .filter((report) => report.status !== "changes_requested")
        .map((report) => ({ report, period: reportQuarterYear(report) }))
        .filter((entry): entry is { report: FinanceReportClientItem; period: { quarter: number; year: number } } =>
          Boolean(entry.period)
        ),
    [reports]
  );
  const years = React.useMemo(
    () => Array.from(new Set(counted.map((entry) => entry.period.year))).sort((a, b) => a - b),
    [counted]
  );
  const [view, setView] = React.useState<ChartView>("quarters");
  const [year, setYear] = React.useState<number>(() => years[years.length - 1] ?? new Date().getFullYear());

  const buckets = React.useMemo(() => {
    if (view === "years") {
      return toBuckets(
        years.map((value) => ({
          key: String(value),
          label: String(value),
          reports: counted.filter((entry) => entry.period.year === value).map((entry) => entry.report)
        }))
      );
    }
    return toBuckets(
      [1, 2, 3, 4].map((quarter) => ({
        key: `${year}-${quarter}`,
        label: `${quarter} кв`,
        reports: counted
          .filter((entry) => entry.period.year === year && entry.period.quarter === quarter)
          .map((entry) => entry.report)
      }))
    );
  }, [counted, view, year, years]);

  const headlineTotal = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  const previousYearTotal =
    view === "quarters"
      ? counted.filter((entry) => entry.period.year === year - 1).reduce((sum, entry) => sum + entry.report.amount, 0)
      : 0;
  const change = previousYearTotal > 0 ? ((headlineTotal - previousYearTotal) / previousYearTotal) * 100 : null;
  const reportsCount =
    view === "quarters" ? counted.filter((entry) => entry.period.year === year).length : counted.length;
  const yearIndex = years.indexOf(year);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold text-white/60">
            {view === "quarters" ? `Начисления за ${year} год` : "Начисления за всё время"}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="text-[34px] font-extrabold tracking-[-0.03em] text-white tabular-nums sm:text-[40px]">
              {formatRubCurrency(headlineTotal)}
            </span>
            {change != null ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-bold",
                  change >= 0 ? "bg-emerald-500/12 text-emerald-400" : "bg-rose-500/12 text-rose-400"
                )}
              >
                {change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {change >= 0 ? "+" : ""}
                {Math.round(change)}% к прошлому году
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-white/45">
            {reportsCount} {reportsCount % 10 === 1 && reportsCount % 100 !== 11 ? "отчёт" : reportsCount % 10 >= 2 && reportsCount % 10 <= 4 && (reportsCount % 100 < 12 || reportsCount % 100 > 14) ? "отчёта" : "отчётов"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {view === "quarters" && years.length > 1 ? (
            <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
              <button
                type="button"
                aria-label="Предыдущий год"
                disabled={yearIndex <= 0}
                onClick={() => setYear(years[yearIndex - 1])}
                className="grid h-7 w-7 place-items-center rounded-lg text-white/60 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1 text-[13px] font-semibold tabular-nums text-white">{year}</span>
              <button
                type="button"
                aria-label="Следующий год"
                disabled={yearIndex >= years.length - 1}
                onClick={() => setYear(years[yearIndex + 1])}
                className="grid h-7 w-7 place-items-center rounded-lg text-white/60 hover:bg-white/[0.06] hover:text-white disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <div className="inline-flex gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
            {(
              [
                { id: "quarters", label: "Кварталы" },
                { id: "years", label: "Годы" }
              ] as const
            ).map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setView(option.id)}
                className={cn(
                  "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  view === option.id ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={buckets} margin={{ top: 28, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <defs>
              <linearGradient id="accrualAgreed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a78bfa" />
                <stop offset="100%" stopColor="#6d4dff" />
              </linearGradient>
              <pattern id="accrualPending" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="rgba(251,191,36,0.18)" />
                <rect width="3" height="8" fill="rgba(251,191,36,0.5)" />
              </pattern>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 600 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
              tickFormatter={rubCompact}
            />
            <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<AccrualTooltip />} />
            <Bar dataKey="agreed" stackId="sum" fill="url(#accrualAgreed)" radius={[0, 0, 0, 0]} maxBarSize={110}>
              {buckets.map((bucket) => (
                <Cell key={bucket.key} radius={bucket.pending > 0 ? 0 : 12} />
              ))}
            </Bar>
            <Bar
              dataKey="pending"
              stackId="sum"
              fill="url(#accrualPending)"
              stroke="rgba(251,191,36,0.6)"
              radius={[12, 12, 0, 0]}
              maxBarSize={110}
            >
              <LabelList
                dataKey="total"
                position="top"
                formatter={(value: number) => (value > 0 ? formatRubCurrency(value).replace(",00", "") : "")}
                style={{ fill: "#fff", fontSize: 12.5, fontWeight: 700 }}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="#34d399"
              strokeWidth={2.5}
              strokeDasharray="6 5"
              dot={{ r: 3.5, fill: "#34d399", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#34d399", stroke: "#13151d", strokeWidth: 3 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] font-semibold text-white/60">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[#8b7bff]" />
          Согласовано
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-[repeating-linear-gradient(45deg,rgba(251,191,36,0.7)_0_3px,rgba(251,191,36,0.2)_3px_6px)]" />
          Ждёт согласования
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3.5 border-t-2 border-dashed border-emerald-400" />
          {view === "quarters" ? "Накоплено за год" : "Накоплено за всё время"}
        </span>
      </div>
    </div>
  );
}

function AccrualTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Bucket }> }) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket || bucket.total <= 0) return null;

  return (
    <div className="w-[230px] rounded-2xl border border-white/[0.12] bg-[#0d0e16]/95 px-3.5 py-3 shadow-[0_20px_50px_-20px_#000]">
      <p className="text-[12px] text-white/45">{bucket.label.includes("кв") ? bucket.label.replace("кв", "квартал") : `${bucket.label} год`}</p>
      <p className="mt-0.5 text-[20px] font-extrabold text-white tabular-nums">{formatRubCurrency(bucket.total)}</p>
      {bucket.agreed > 0 ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Согласовано {formatRubCurrency(bucket.agreed)}
        </p>
      ) : null}
      {bucket.pending > 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-[12px] font-semibold text-amber-300">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          Ждёт согласования {formatRubCurrency(bucket.pending)}
        </p>
      ) : null}
    </div>
  );
}
