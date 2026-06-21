"use client";

import * as React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { AnalyticsPlatformsChartPointResponse } from "@/lib/api/contracts";

const PLATFORM_COLORS = [
  "#facc15",
  "#3b82f6",
  "#f43f5e",
  "#22c55e",
  "#a855f7",
  "#fb923c",
  "#38bdf8",
  "#e879f9"
];

function formatDateToDayMonthYear(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}.${month}.${year}`;
}

function formatYAxisValue(value: number): string {
  if (value >= 1000) {
    const compact = value / 1000;
    const formatted = Number.isInteger(compact)
      ? compact.toString()
      : compact.toFixed(1).replace(".", ",");
    return `${formatted} тыс.`;
  }
  return value.toLocaleString("ru-RU");
}

type ChartRow = { date: string } & Record<string, string | number>;

interface AnalyticsPlatformsChartProps {
  data: AnalyticsPlatformsChartPointResponse[];
  platforms: string[];
  selectedPlatform: string;
  onSelectPlatform: (platform: string) => void;
}

type MetricMode = "streams" | "pay_streams";

interface TooltipEntry {
  dataKey?: string;
  color?: string;
  value?: number | string;
}

function PlatformsTooltip({
  active,
  label,
  payload
}: {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload?.length) return null;

  const rows = payload
    .filter((item): item is Required<Pick<TooltipEntry, "dataKey" | "color" | "value">> =>
      Boolean(item.dataKey && item.color && typeof item.value === "number")
    )
    .sort((left, right) => Number(right.value) - Number(left.value));

  if (rows.length === 0) return null;

  return (
    <div className="min-w-[220px] rounded-2xl border border-white/15 bg-[#0a1120]/88 px-3 py-3 text-white shadow-[0_14px_40px_rgba(3,10,24,0.48)] backdrop-blur-xl">
      <p className="text-[12px] font-medium text-white/70">
        {typeof label === "string" ? formatDateToDayMonthYear(label) : "—"}
      </p>
      <div className="mt-2 space-y-2">
        {rows.map((item) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-4 text-[13px]">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span className="truncate text-white/88">{item.dataKey}</span>
            </div>
            <span className="font-semibold text-white">
              {Number(item.value).toLocaleString("ru-RU")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsPlatformsChart({
  data,
  platforms,
  selectedPlatform,
  onSelectPlatform
}: AnalyticsPlatformsChartProps) {
  const [metricMode, setMetricMode] = React.useState<MetricMode>("streams");
  const visibleChartPlatforms = React.useMemo(() => platforms.slice(0, 8), [platforms]);

  const chartData = React.useMemo<ChartRow[]>(() => {
    return data.map((point) => {
      const row: ChartRow = { date: point.date };
      for (const value of point.values) {
        row[value.platform] = metricMode === "streams" ? value.streams : value.pay_streams;
      }
      return row;
    });
  }, [data, metricMode]);

  const colorByPlatform = React.useMemo(() => {
    return new Map(
      platforms.map((platform, index) => [platform, PLATFORM_COLORS[index % PLATFORM_COLORS.length]])
    );
  }, [platforms]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectPlatform("")}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
              selectedPlatform
                ? "border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.07]"
                : "border-[#7b3df5]/40 bg-[#7b3df5]/18 text-white"
            }`}
          >
            Все
          </button>
          {platforms.map((platform) => {
            const active = platform === selectedPlatform;
            return (
              <button
                key={platform}
                type="button"
                onClick={() => onSelectPlatform(active ? "" : platform)}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition ${
                  active
                    ? "border-[#7b3df5]/45 bg-[#7b3df5]/18 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/78 hover:bg-white/[0.07]"
                }`}
              >
                {platform}
              </button>
            );
          })}
        </div>

        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
          <button
            type="button"
            onClick={() => setMetricMode("streams")}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              metricMode === "streams"
                ? "bg-[#7b3df5]/20 text-white"
                : "text-white/65 hover:text-white"
            }`}
          >
            Streams
          </button>
          <button
            type="button"
            onClick={() => setMetricMode("pay_streams")}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              metricMode === "pay_streams"
                ? "bg-[#7b3df5]/20 text-white"
                : "text-white/65 hover:text-white"
            }`}
          >
            Pay streams
          </button>
        </div>
      </div>

      <div className="h-[320px] w-full rounded-2xl border border-white/10 bg-black/20 p-3 sm:h-[360px] sm:p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 16, left: 8, bottom: 12 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              stroke="rgba(255,255,255,0.45)"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12 }}
              minTickGap={20}
              padding={{ left: 10, right: 10 }}
            />
            <YAxis
              stroke="rgba(255,255,255,0.45)"
              tickLine={false}
              axisLine={false}
              width={62}
              tickMargin={8}
              tick={{ fontSize: 12 }}
              tickFormatter={formatYAxisValue}
            />
            <Tooltip content={<PlatformsTooltip />} cursor={false} />
            {visibleChartPlatforms.map((platform) => (
              <Line
                key={platform}
                type="monotone"
                dataKey={platform}
                name={platform}
                isAnimationActive={false}
                stroke={colorByPlatform.get(platform) ?? "#7b3df5"}
                strokeWidth={
                  selectedPlatform ? (platform === selectedPlatform ? 3.2 : 1.7) : 2.2
                }
                strokeOpacity={
                  selectedPlatform ? (platform === selectedPlatform ? 1 : 0.24) : 0.92
                }
                dot={false}
                activeDot={{
                  r: selectedPlatform && platform === selectedPlatform ? 5 : 4,
                  strokeWidth: 2,
                  fill: "#ffffff"
                }}
                connectNulls
              />
            ))}
            <Legend
              verticalAlign="bottom"
              align="left"
              wrapperStyle={{ paddingTop: 10 }}
              formatter={(value) => <span className="text-white/70">{value}</span>}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
