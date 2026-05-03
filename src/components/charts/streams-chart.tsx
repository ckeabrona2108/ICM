"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import type { StatPoint } from "@/lib/types";

interface StreamsChartProps {
  data: StatPoint[];
}

export function StreamsChart({ data }: StreamsChartProps) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="streamsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.5} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="listenersGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" tickLine={false} axisLine={false} />
          <YAxis stroke="rgba(255,255,255,0.4)" tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(8, 12, 32, 0.95)",
              color: "#fff"
            }}
          />
          <Area type="monotone" dataKey="streams" stroke="#60a5fa" strokeWidth={2} fill="url(#streamsGradient)" />
          <Area type="monotone" dataKey="listeners" stroke="#22d3ee" strokeWidth={2} fill="url(#listenersGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
