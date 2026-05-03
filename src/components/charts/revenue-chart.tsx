"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatCurrency } from "@/lib/format";

interface RevenueChartProps {
  data: Array<{ period: string; amount: number }>;
}

function buildYAxisMax(maxValue: number): number {
  if (maxValue <= 0) return 1000;
  const valueWithHeadroom = maxValue * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(valueWithHeadroom));
  const normalized = valueWithHeadroom / magnitude;
  const niceMultiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceMultiplier * magnitude;
}

function formatYAxisTick(value: number): string {
  if (value >= 1000) {
    const compact = value / 1000;
    const formatted = Number.isInteger(compact)
      ? compact.toString()
      : compact.toFixed(1).replace(".", ",");
    return `${formatted} тыс.`;
  }

  return Math.round(value).toLocaleString("ru-RU");
}

function formatBarLabel(value: number): string {
  if (value >= 1000) {
    const compact = value / 1000;
    const formatted = Number.isInteger(compact)
      ? compact.toString()
      : compact.toFixed(1).replace(".", ",");
    return `${formatted}K`;
  }

  return value.toLocaleString("ru-RU");
}

export function RevenueChart({ data }: RevenueChartProps) {
  const maxValue = data.reduce((max, item) => Math.max(max, item.amount), 0);
  const total = data.reduce((sum, item) => sum + item.amount, 0);
  const averageValue = data.length > 0 ? total / data.length : 0;
  const yAxisMax = buildYAxisMax(maxValue);
  const hasValues = maxValue > 0;

  const chartData = data.map((item, index) => ({
    ...item,
    fill:
      index % 2 === 0
        ? "url(#revenueBarGradPrimary)"
        : "url(#revenueBarGradSecondary)"
  }));

  return (
    <div className="h-[300px] w-full rounded-2xl border border-white/10 bg-[#0e111f]/90 p-3 shadow-[0_16px_40px_-24px_rgba(2,6,23,0.8)] sm:h-[340px] sm:p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          barCategoryGap="24%"
          barSize={26}
          margin={{ top: 16, right: 16, left: 8, bottom: 8 }}
        >
          <defs>
            <linearGradient id="revenueBarGradPrimary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#98b6ff" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#8ca1ff" stopOpacity={0.78} />
            </linearGradient>
            <linearGradient id="revenueBarGradSecondary" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8db4ff" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#7b93ff" stopOpacity={0.72} />
            </linearGradient>
          </defs>

          <CartesianGrid
            vertical={false}
            strokeDasharray="4 5"
            stroke="rgba(255,255,255,0.12)"
          />
          <XAxis
            dataKey="period"
            stroke="rgba(255,255,255,0.45)"
            tickLine={false}
            axisLine={false}
            minTickGap={8}
            padding={{ left: 12, right: 12 }}
            tick={{ fontSize: 12, fill: "rgba(255,255,255,0.62)" }}
          />
          <YAxis
            width={58}
            domain={[0, yAxisMax]}
            tickCount={5}
            stroke="rgba(255,255,255,0.45)"
            tickLine={false}
            axisLine={false}
            tickMargin={9}
            tick={{ fontSize: 12, fill: "rgba(255,255,255,0.66)" }}
            tickFormatter={formatYAxisTick}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            formatter={(value: number | string, key) =>
              typeof value === "number"
                ? [formatCurrency(value, "RUB"), key === "amount" ? "Начисления" : "Средний уровень"]
                : value
            }
            labelFormatter={(label: string) => `Период: ${label}`}
            labelStyle={{ color: "rgba(255,255,255,0.92)" }}
            itemStyle={{ color: "rgba(255,255,255,0.9)" }}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(8, 12, 32, 0.95)",
              color: "#fff"
            }}
          />
          <ReferenceLine
            ifOverflow="extendDomain"
            y={averageValue}
            stroke="rgba(255,255,255,0.62)"
            strokeDasharray="8 6"
            strokeWidth={1.8}
          />
          <Bar
            dataKey="amount"
            radius={[10, 10, 0, 0]}
            maxBarSize={34}
            isAnimationActive
            animationDuration={950}
            animationEasing="ease-out"
            background={{ fill: "rgba(138, 160, 255, 0.14)", radius: 10 }}
          >
            {chartData.map((entry) => (
              <Cell key={`${entry.period}-bar`} fill={entry.fill} />
            ))}
            <LabelList
              dataKey="amount"
              content={({ x, y, value, index }) => {
                if (!hasValues || typeof value !== "number" || value <= 0 || typeof x !== "number" || typeof y !== "number") {
                  return null;
                }

                if (typeof index !== "number" || chartData.length > 8) {
                  return null;
                }

                return (
                  <text
                    x={x + 13}
                    y={y - 8}
                    fill="rgba(255,255,255,0.68)"
                    fontSize={11}
                    fontWeight={600}
                    textAnchor="middle"
                  >
                    {formatBarLabel(value)}
                  </text>
                );
              }}
            />
          </Bar>
          <Legend
            verticalAlign="bottom"
            align="left"
            iconType="circle"
            wrapperStyle={{ paddingTop: 8, fontSize: "12px", color: "rgba(255,255,255,0.72)" }}
            payload={[
              {
                value: "Начисления",
                type: "circle",
                color: "#98b6ff"
              },
              {
                value: "Средний уровень",
                type: "line",
                color: "rgba(255,255,255,0.62)"
              }
            ]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
