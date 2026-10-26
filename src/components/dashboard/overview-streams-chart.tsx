"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";

function formatShortDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");
}

export function OverviewStreamsChart({ data }: { data: Array<{ date: string; streams: number }> }) {
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 6, left: 6, bottom: 0 }}>
          <defs>
            <linearGradient id="overviewStreamsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7b61ff" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#7b61ff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatShortDate}
            stroke="rgba(255,255,255,0.4)"
            tickLine={false}
            axisLine={false}
            minTickGap={40}
            fontSize={12}
          />
          <Tooltip
            labelFormatter={(value) => formatShortDate(String(value))}
            formatter={(value) => [new Intl.NumberFormat("ru-RU").format(Number(value)), "Прослушивания"]}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(13,14,22,0.96)",
              color: "#fff"
            }}
          />
          <Area type="monotone" dataKey="streams" stroke="#8b7bff" strokeWidth={2.5} fill="url(#overviewStreamsGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
