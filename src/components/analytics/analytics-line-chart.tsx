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

import type { AnalyticsOverviewChartPointResponse } from "@/lib/api/contracts";

const ANALYTICS_PURPLE = "#7b3df5";
const ANALYTICS_GREEN = "#4fffd2";

export interface AnalyticsLineChartProps {
  data: AnalyticsOverviewChartPointResponse[];
  days?: number;
}

interface TooltipDatum {
  dataKey?: string;
  value?: number | string;
}

interface TooltipContentInput {
  active?: boolean;
  payload?: TooltipDatum[];
  label?: string | number;
}

interface ActiveDotInput {
  cx?: number;
  cy?: number;
  stroke?: string;
}

export function buildActiveDotStyle(color?: string): {
  radius: number;
  strokeWidth: number;
  fill: string;
  stroke: string;
} {
  const resolvedColor = color && color.trim() ? color : ANALYTICS_GREEN;
  return {
    radius: 5,
    strokeWidth: 2.2,
    fill: "#ffffff",
    stroke: resolvedColor
  };
}

export function formatMetricValue(value: number | string | undefined): string {
  if (typeof value !== "number") return "—";
  return value.toLocaleString("ru-RU");
}

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

function AnalyticsTooltip({ active, payload, label }: TooltipContentInput) {
  if (!active || !payload?.length) return null;

  const streams = payload.find((item) => item.dataKey === "streams")?.value;
  const payStreams = payload.find((item) => item.dataKey === "pay_streams")?.value;

  return (
    <div
      className="rounded-xl border border-white/20 bg-[#0a1120]/80 px-3 py-2.5 text-white shadow-[0_10px_30px_rgba(5,15,30,0.55)] backdrop-blur-[10px]"
      style={{ transition: "opacity 180ms ease, transform 180ms ease" }}
    >
      <div className="text-[12px] text-white/90">Прослушивания:</div>
      <div className="text-[15px] font-semibold text-white">{formatMetricValue(streams)}</div>
      <div className="mt-2 text-[12px] text-white/90">Прослушивания &gt; 30 сек:</div>
      <div className="text-[15px] font-semibold text-white">{formatMetricValue(payStreams)}</div>
      <div className="mt-2 text-[12px] text-white/70">
        Дата: {typeof label === "string" ? formatDateToDayMonthYear(label) : "—"}
      </div>
    </div>
  );
}

function ActiveDotGlow({ cx, cy, stroke, glowFilterId }: ActiveDotInput & { glowFilterId: string }) {
  if (typeof cx !== "number" || typeof cy !== "number") return null;
  const dot = buildActiveDotStyle(stroke);
  return (
    <g
      style={{
        transformOrigin: `${cx}px ${cy}px`,
        animation: "analyticsDotPulse 180ms ease-out forwards"
      }}
    >
      <circle
        cx={cx}
        cy={cy}
        r={dot.radius + 2.2}
        fill={dot.stroke}
        opacity={0.36}
        filter={`url(#${glowFilterId})`}
      />
      <circle
        cx={cx}
        cy={cy}
        r={dot.radius}
        fill={dot.fill}
        stroke={dot.stroke}
        strokeWidth={dot.strokeWidth}
      />
    </g>
  );
}

function AnalyticsLineChartBase({ data, days: _days }: AnalyticsLineChartProps) {
  const dotFilterId = "analytics-dot-glow";

  return (
    <div className="h-[310px] w-full rounded-2xl border border-white/10 bg-black/20 p-3 sm:h-[340px] sm:p-4">
      <style>{`
        @keyframes analyticsDotPulse {
          from { opacity: 0.8; transform: scale(0.86); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 14, left: 14, bottom: 14 }}>
          <defs>
            <filter id={dotFilterId} x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="3.4" />
            </filter>
          </defs>

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

          <Tooltip
            cursor={false}
            content={<AnalyticsTooltip />}
            isAnimationActive
            animationDuration={180}
            wrapperStyle={{ outline: "none" }}
          />

          <Line
            type="monotone"
            dataKey="pay_streams"
            stroke={ANALYTICS_GREEN}
            strokeWidth={2.2}
            dot={{ r: 2.8 }}
            activeDot={(props: ActiveDotInput) => (
              <ActiveDotGlow {...props} glowFilterId={dotFilterId} />
            )}
          />
          <Line
            type="monotone"
            dataKey="streams"
            stroke={ANALYTICS_PURPLE}
            strokeWidth={2.2}
            dot={{ r: 2.8 }}
            activeDot={(props: ActiveDotInput) => (
              <ActiveDotGlow {...props} glowFilterId={dotFilterId} />
            )}
          />
          <Legend
            verticalAlign="bottom"
            align="left"
            wrapperStyle={{ paddingTop: 10 }}
            formatter={(value) =>
              value === "pay_streams" ? "Прослушивания больше 30 секунд" : "Все прослушивания"
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export const AnalyticsLineChart = React.memo(AnalyticsLineChartBase);
AnalyticsLineChart.displayName = "AnalyticsLineChart";
