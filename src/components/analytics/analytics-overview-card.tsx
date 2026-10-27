"use client";

import * as React from "react";

import type { AnalyticsCountriesResponse, AnalyticsOverviewResponse } from "@/lib/api/contracts";
import {
  ANALYTICS_MINT,
  ANALYTICS_PURPLE,
  DeltaBadge,
  SkeletonBlock,
  Sparkline,
  formatCount,
  formatCountryName,
  formatShare,
  getPlatformColor
} from "@/components/analytics/analytics-ui";

interface RankedEntry {
  label: string;
  streams: number;
  share: number;
  color: string;
}

function KpiTile({
  label,
  children,
  footer,
  loading
}: {
  label: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  loading: boolean;
}) {
  return (
    <article className="flex h-full min-h-[168px] flex-col rounded-[24px] border border-white/[0.09] bg-[#13151d] p-4 shadow-[0_16px_44px_-28px_rgba(11,14,24,0.95)]">
      <p className="text-[12px] font-semibold text-white/55">{label}</p>
      {loading ? (
        <div className="mt-3 space-y-3">
          <SkeletonBlock className="h-8 w-24" />
          <SkeletonBlock className="h-6 w-full" />
        </div>
      ) : (
        <>
          <div className="mt-2 flex-1">{children}</div>
          {footer ? <p className="mt-2 text-[12px] font-medium text-white/45">{footer}</p> : null}
        </>
      )}
    </article>
  );
}

function pluralizePlays(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "прослушивание";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "прослушивания";
  return "прослушиваний";
}

/** Leader with a share bar plus the runners-up, so the tile is informative instead of half empty. */
function RankedTileBody({ entries, unit }: { entries: RankedEntry[]; unit: string }) {
  const [leader, ...rest] = entries;
  if (!leader) return <p className="mt-1 text-[20px] font-bold text-white/40">—</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[18px] font-bold text-white">{leader.label}</p>
        <span className="shrink-0 text-[13px] font-bold text-[#b9a8ff]">{formatShare(leader.share)}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, Math.min(100, leader.share))}%`, backgroundColor: leader.color }}
        />
      </div>
      <p className="mt-1.5 text-[11px] font-medium text-white/40">
        {formatCount(leader.streams)} {pluralizePlays(leader.streams)} {unit}
      </p>
      {rest.length > 0 ? (
        <ul className="mt-auto space-y-1 border-t border-white/[0.06] pt-2">
          {rest.slice(0, 2).map((entry, index) => (
            <li key={entry.label} className="flex items-center gap-2 text-[12px]">
              <span className="w-3 text-white/35">{index + 2}</span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="min-w-0 flex-1 truncate font-medium text-white/70">{entry.label}</span>
              <span className="shrink-0 font-semibold text-white/55">{formatShare(entry.share)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-auto border-t border-white/[0.06] pt-2 text-[12px] text-white/35">Других пока нет</p>
      )}
    </div>
  );
}

function AnalyticsOverviewCardBase({
  data,
  countries,
  loading = false
}: {
  data: AnalyticsOverviewResponse | null;
  countries: AnalyticsCountriesResponse | null;
  loading?: boolean;
}) {
  const chart = data?.chart ?? [];
  const totalStreams = data?.total_streams ?? 0;
  const totalPayStreams = data?.total_pay_streams ?? 0;
  const payShare = totalStreams > 0 ? (totalPayStreams / totalStreams) * 100 : 0;
  const platforms = data?.platforms_breakdown ?? [];
  const topPlatform = platforms.find((item) => item.platform === data?.top_platform) ?? platforms[0] ?? null;
  const countryRows = countries?.countries_breakdown ?? [];
  const countryTotal = countryRows.reduce((sum, item) => sum + item.streams, 0);
  const platformEntries: RankedEntry[] = [...platforms]
    .sort((a, b) => (a.platform === topPlatform?.platform ? -1 : b.platform === topPlatform?.platform ? 1 : b.streams - a.streams))
    .map((item, index) => ({
      label: item.platform,
      streams: item.streams,
      share: item.share_percent,
      color: getPlatformColor(item.platform, index)
    }));
  const countryEntries: RankedEntry[] = countryRows.map((item) => ({
    label: formatCountryName(item.country),
    streams: item.streams,
    share: countryTotal > 0 ? (item.streams / countryTotal) * 100 : 0,
    color: "#7b61ff"
  }));

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiTile label="Все прослушивания" loading={loading} footer="Изменение — к прошлому отчёту">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[30px] font-bold leading-none tracking-tight text-white">{formatCount(totalStreams)}</span>
          <DeltaBadge value={data?.streams_change_percent} />
        </div>
        <Sparkline className="mt-3" values={chart.map((point) => point.streams)} color={ANALYTICS_PURPLE} />
      </KpiTile>

      <KpiTile
        label="Оплачиваемые (больше 30 сек)"
        loading={loading}
        footer={totalStreams > 0 && payShare <= 100 ? `${formatShare(payShare)} от всех прослушиваний` : undefined}
      >
        <div className="flex items-baseline gap-2.5">
          <span className="text-[30px] font-bold leading-none tracking-tight text-white">{formatCount(totalPayStreams)}</span>
          <DeltaBadge value={data?.pay_streams_change_percent} />
        </div>
        <Sparkline className="mt-3" values={chart.map((point) => point.pay_streams)} color={ANALYTICS_MINT} />
      </KpiTile>

      <KpiTile label="Топ площадки" loading={loading}>
        <RankedTileBody entries={platformEntries} unit="за период" />
      </KpiTile>

      <KpiTile label="Топ страны" loading={loading}>
        <RankedTileBody entries={countryEntries} unit="за период" />
      </KpiTile>
    </div>
  );
}

export const AnalyticsOverviewCard = React.memo(AnalyticsOverviewCardBase);
AnalyticsOverviewCard.displayName = "AnalyticsOverviewCard";
