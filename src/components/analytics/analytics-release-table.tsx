"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import type { AnalyticsReleaseListItemResponse } from "@/lib/api/contracts";
import {
  AnalyticsCard,
  DeltaBadge,
  SkeletonBlock,
  formatCount,
  formatShare
} from "@/components/analytics/analytics-ui";

function AnalyticsReleaseTableBase({
  releases,
  selectedReleaseId,
  onSelectRelease,
  loading = false,
  error = null
}: {
  releases: AnalyticsReleaseListItemResponse[];
  selectedReleaseId: string;
  onSelectRelease: (releaseId: string) => void;
  loading?: boolean;
  error?: string | null;
}) {
  const sorted = React.useMemo(
    () => [...releases].sort((a, b) => b.streams - a.streams),
    [releases]
  );
  const total = sorted.reduce((sum, release) => sum + release.streams, 0);

  return (
    <AnalyticsCard title="Релизы" hint="Нажмите на релиз, чтобы показать только его">
      {loading ? (
        <div className="space-y-2">
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-12 w-full" />
        </div>
      ) : error ? (
        <p className="text-[14px] font-medium text-rose-300">{error}</p>
      ) : sorted.length === 0 ? (
        <p className="text-[14px] text-white/55">Пока нет релизов с данными по прослушиваниям.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          {/* Fixed column widths keep headers right above their numbers. */}
          <table className="w-full min-w-[560px] table-fixed border-collapse text-left">
            <colgroup>
              <col />
              <col className="w-[120px]" />
              <col className="w-[150px]" />
              <col className="w-[110px]" />
              <col className="w-[130px]" />
            </colgroup>
            <thead>
              <tr className="text-[12px] font-semibold text-white/55">
                <th className="px-3 py-2.5">Релиз</th>
                <th className="px-3 py-2.5 text-right">Все</th>
                <th className="px-3 py-2.5 text-right">Больше 30 сек</th>
                <th className="px-3 py-2.5 text-right">Доля</th>
                <th className="px-3 py-2.5 text-right">Изменение</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((release) => {
                const isActive = selectedReleaseId === release.release_id;
                return (
                  <tr
                    key={release.release_id}
                    onClick={() => onSelectRelease(release.release_id)}
                    className={cn(
                      "cursor-pointer border-t border-white/[0.06] transition hover:bg-white/[0.03]",
                      isActive && "bg-[#7b3df5]/10"
                    )}
                  >
                    <td className="px-3 py-3">
                      <p className="truncate text-[14px] font-semibold text-white">{release.title}</p>
                      <p className="mt-0.5 truncate text-[12px] text-white/45">UPC {release.upc || "—"}</p>
                    </td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-white">{formatCount(release.streams)}</td>
                    <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums text-white">{formatCount(release.pay_streams)}</td>
                    <td className="px-3 py-3 text-right text-[14px] font-medium tabular-nums text-white/60">
                      {total > 0 ? formatShare((release.streams / total) * 100) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {release.change_percent == null ? (
                        <span className="text-[12px] text-white/35">—</span>
                      ) : (
                        <DeltaBadge value={release.change_percent} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AnalyticsCard>
  );
}

export const AnalyticsReleaseTable = React.memo(AnalyticsReleaseTableBase);
AnalyticsReleaseTable.displayName = "AnalyticsReleaseTable";
