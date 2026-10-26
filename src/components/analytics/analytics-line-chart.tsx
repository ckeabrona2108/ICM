"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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
  /** Color of the "all streams" series, e.g. a focused platform color. */
  primaryColor?: string;
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
      <div className="text-[12px] text-white/60">
        {typeof label === "string" ? formatDateToDayMonthYear(label) : "—"}
      </div>
      <div className="mt-1.5 text-[13px] text-white/80">
        Все: <span className="font-semibold text-white">{formatMetricValue(streams)}</span>
      </div>
      <div className="text-[13px] text-white/80">
        Больше 30 сек: <span className="font-semibold text-white">{formatMetricValue(payStreams)}</span>
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

function formatAxisDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

function AnalyticsLineChartBase({ data, primaryColor = ANALYTICS_PURPLE }: AnalyticsLineChartProps) {
  const dotFilterId = "analytics-dot-glow";
  const streamsFillId = "analytics-streams-fill";
  const payFillId = "analytics-pay-fill";

  return (
    <div className="h-[260px] w-full sm:h-[300px]">
      <style>{`
        @keyframes analyticsDotPulse {
          from { opacity: 0.8; transform: scale(0.86); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <filter id={dotFilterId} x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="3.4" />
            </filter>
            <linearGradient id={streamsFillId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={primaryColor} stopOpacity={0.42} />
              <stop offset="100%" stopColor={primaryColor} stopOpacity={0} />
            </linearGradient>
            <linearGradient id={payFillId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={ANALYTICS_GREEN} stopOpacity={0.26} />
              <stop offset="100%" stopColor={ANALYTICS_GREEN} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            stroke="rgba(255,255,255,0.4)"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={formatAxisDate}
            minTickGap={28}
            tickMargin={10}
          />
          <YAxis
            stroke="rgba(255,255,255,0.4)"
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            tickFormatter={formatYAxisValue}
          />

          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.12)" }}
            content={<AnalyticsTooltip />}
            isAnimationActive
            animationDuration={180}
            wrapperStyle={{ outline: "none" }}
          />

          <Area
            type="linear"
            dataKey="streams"
            stroke={primaryColor}
            strokeWidth={2.4}
            fill={`url(#${streamsFillId})`}
            dot={false}
            activeDot={(props: ActiveDotInput) => (
              <ActiveDotGlow {...props} glowFilterId={dotFilterId} />
            )}
          />
          <Area
            type="linear"
            dataKey="pay_streams"
            stroke={ANALYTICS_GREEN}
            strokeWidth={2.4}
            fill={`url(#${payFillId})`}
            dot={false}
            activeDot={(props: ActiveDotInput) => (
              <ActiveDotGlow {...props} glowFilterId={dotFilterId} />
            )}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const AnalyticsLineChart = React.memo(AnalyticsLineChartBase);
AnalyticsLineChart.displayName = "AnalyticsLineChart";
