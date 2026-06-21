"use client";

import * as React from "react";
import dynamic from "next/dynamic";

import { DashboardShell, PageSection } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import {
  AnalyticsFilters,
  type AnalyticsFilterState
} from "@/components/analytics/analytics-filters";
import { AnalyticsOverviewCard } from "@/components/analytics/analytics-overview-card";
import { AnalyticsReleaseTable } from "@/components/analytics/analytics-release-table";
import { getCachedRequest } from "@/lib/client-request-cache";
import type {
  AnalyticsOverviewResponse,
  AnalyticsReleaseDetailsResponse,
  AnalyticsReleaseListItemResponse
} from "@/lib/api/contracts";

const AnalyticsLineChart = dynamic(
  () =>
    import("@/components/analytics/analytics-line-chart").then(
      (module) => module.AnalyticsLineChart
    ),
  {
    ssr: false,
    loading: () => <p className="text-[14px] font-medium text-white/70">Готовим график…</p>
  }
);

const AnalyticsPlatformsChart = dynamic(
  () =>
    import("@/components/analytics/analytics-platforms-chart").then(
      (module) => module.AnalyticsPlatformsChart
    ),
  {
    ssr: false,
    loading: () => <p className="text-[14px] font-medium text-white/70">Готовим график площадок…</p>
  }
);

function buildOverviewUrl(filters: AnalyticsFilterState): string {
  const params = new URLSearchParams();
  params.set("days", String(filters.days));
  if (filters.releaseId) params.set("release_id", filters.releaseId);
  if (filters.country.trim()) params.set("country", filters.country.trim());
  if (filters.upc.trim()) params.set("upc", filters.upc.trim());
  if (filters.platform.trim()) params.set("platform", filters.platform.trim());
  return `/api/analytics/overview?${params.toString()}`;
}

function buildReleasesUrl(filters: AnalyticsFilterState): string {
  const params = new URLSearchParams();
  if (filters.country.trim()) params.set("country", filters.country.trim());
  if (filters.upc.trim()) params.set("upc", filters.upc.trim());
  if (filters.platform.trim()) params.set("platform", filters.platform.trim());
  return `/api/analytics/releases?${params.toString()}`;
}

function buildReleaseDetailsUrl(releaseId: string, days: number): string {
  const params = new URLSearchParams();
  params.set("days", String(days));
  return `/api/analytics/releases/${releaseId}?${params.toString()}`;
}

export function AnalyticsPage() {
  const [filters, setFilters] = React.useState<AnalyticsFilterState>({
    releaseId: "",
    country: "",
    upc: "",
    platform: "",
    days: 30
  });
  const [focusedPlatform, setFocusedPlatform] = React.useState("");

  const [overview, setOverview] = React.useState<AnalyticsOverviewResponse | null>(null);
  const [releases, setReleases] = React.useState<AnalyticsReleaseListItemResponse[]>([]);
  const [releaseDetails, setReleaseDetails] = React.useState<AnalyticsReleaseDetailsResponse | null>(
    null
  );

  const [loadingOverview, setLoadingOverview] = React.useState(true);
  const [loadingReleases, setLoadingReleases] = React.useState(true);
  const [loadingDetails, setLoadingDetails] = React.useState(false);

  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const [releasesError, setReleasesError] = React.useState<string | null>(null);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const releasesUrl = React.useMemo(
    () => buildReleasesUrl(filters),
    [filters.country, filters.platform, filters.upc]
  );
  const overviewUrl = React.useMemo(
    () => buildOverviewUrl(filters),
    [filters.country, filters.days, filters.platform, filters.releaseId, filters.upc]
  );
  const detailsUrl = React.useMemo(
    () =>
      filters.releaseId
        ? buildReleaseDetailsUrl(filters.releaseId, filters.days)
        : null,
    [filters.days, filters.releaseId]
  );
  const handleSelectRelease = React.useCallback((releaseId: string) => {
    setFilters((prev) => {
      const nextReleaseId = prev.releaseId === releaseId ? "" : releaseId;
      if (prev.releaseId === nextReleaseId) return prev;
      return {
        ...prev,
        releaseId: nextReleaseId
      };
    });
  }, []);
  const handleSelectPlatform = React.useCallback((platform: string) => {
    setFocusedPlatform((prev) => (prev === platform ? "" : platform));
  }, []);
  const platformOptions = React.useMemo(
    () => overview?.platforms_breakdown.map((item) => item.platform) ?? [],
    [overview]
  );

  React.useEffect(() => {
    if (!focusedPlatform) return;
    if (platformOptions.includes(focusedPlatform)) return;
    setFocusedPlatform("");
  }, [focusedPlatform, platformOptions]);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadingReleases(true);
      setReleasesError(null);
      try {
        const payload = await getCachedRequest(
          `analytics:releases:${releasesUrl}`,
          30_000,
          async () => {
            const response = await fetch(releasesUrl, { method: "GET" });
            const parsed = (await response.json().catch(() => null)) as
              | AnalyticsReleaseListItemResponse[]
              | { error?: string }
              | null;
            if (!response.ok || !Array.isArray(parsed)) {
              throw new Error(
                parsed && !Array.isArray(parsed) && "error" in parsed
                  ? parsed.error || "Не удалось загрузить список релизов"
                  : "Не удалось загрузить список релизов"
              );
            }
            return parsed;
          }
        );

        if (!Array.isArray(payload)) {
          throw new Error("Не удалось загрузить список релизов");
        }

        if (cancelled) return;
        setReleases(payload);
      } catch (error) {
        if (cancelled) return;
        setReleasesError(error instanceof Error ? error.message : "Ошибка загрузки релизов");
      } finally {
        if (!cancelled) setLoadingReleases(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [releasesUrl]);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoadingOverview(true);
      setOverviewError(null);

      try {
        const payload = await getCachedRequest(
          `analytics:overview:${overviewUrl}`,
          30_000,
          async () => {
            const response = await fetch(overviewUrl, { method: "GET" });
            const parsed = (await response.json().catch(() => null)) as
              | AnalyticsOverviewResponse
              | { error?: string }
              | null;

            if (!response.ok || !parsed || Array.isArray(parsed) || !("chart" in parsed)) {
              throw new Error(
                parsed && !Array.isArray(parsed) && "error" in parsed
                  ? parsed.error || "Не удалось загрузить аналитику"
                  : "Не удалось загрузить аналитику"
              );
            }
            return parsed;
          }
        );
        if (!payload || Array.isArray(payload) || !("chart" in payload)) {
          throw new Error("Не удалось загрузить аналитику");
        }

        if (cancelled) return;
        setOverview(payload);
      } catch (error) {
        if (cancelled) return;
        setOverviewError(error instanceof Error ? error.message : "Ошибка загрузки аналитики");
      } finally {
        if (!cancelled) setLoadingOverview(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [overviewUrl]);

  React.useEffect(() => {
    if (!detailsUrl) {
      setReleaseDetails(null);
      setDetailsError(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoadingDetails(true);
      setDetailsError(null);
      try {
        const payload = await getCachedRequest(
          `analytics:details:${detailsUrl}`,
          30_000,
          async () => {
            const response = await fetch(detailsUrl, {
              method: "GET"
            });
            const parsed = (await response.json().catch(() => null)) as
              | AnalyticsReleaseDetailsResponse
              | { error?: string }
              | null;

            if (!response.ok || !parsed || Array.isArray(parsed) || !("release_id" in parsed)) {
              throw new Error(
                parsed && !Array.isArray(parsed) && "error" in parsed
                  ? parsed.error || "Не удалось загрузить детали релиза"
                  : "Не удалось загрузить детали релиза"
              );
            }
            return parsed;
          }
        );
        if (!payload || Array.isArray(payload) || !("release_id" in payload)) {
          throw new Error("Не удалось загрузить детали релиза");
        }

        if (cancelled) return;
        setReleaseDetails(payload);
      } catch (error) {
        if (cancelled) return;
        setDetailsError(error instanceof Error ? error.message : "Ошибка загрузки деталей релиза");
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [detailsUrl]);

  return (
    <DashboardShell>
      <PageHeader
        title="Аналитика"
        description="История ежедневных snapshot-отчётов агрегатора по прослушиваниям."
      />

      <AnalyticsFilters
        value={filters}
        releases={releases}
        platforms={platformOptions}
        onChange={setFilters}
      />

      <div className="mt-4 space-y-4">
        <AnalyticsOverviewCard data={overview} />

        <PageSection>
          {loadingOverview ? (
            <p className="text-[14px] font-medium text-white/70">Загружаем график…</p>
          ) : overviewError ? (
            <p className="text-[14px] font-medium text-rose-300">{overviewError}</p>
          ) : !overview || overview.chart.length === 0 ? (
            <p className="text-[14px] font-medium text-white/65">Данные аналитики пока не загружены.</p>
          ) : (
            <>
              <AnalyticsLineChart data={overview.chart} days={filters.days} />
              {overview.chart.length < 2 ? (
                <p className="mt-3 text-[13px] font-medium text-white/60">
                  История графика появится после нескольких ежедневных импортов.
                </p>
              ) : null}
            </>
          )}
        </PageSection>

        <AnalyticsReleaseTable
          releases={releases}
          selectedReleaseId={filters.releaseId}
          onSelectRelease={handleSelectRelease}
        />

        {loadingReleases ? (
          <p className="text-[14px] font-medium text-white/65">Загружаем список релизов…</p>
        ) : null}
        {releasesError ? (
          <p className="text-[14px] font-medium text-rose-300">{releasesError}</p>
        ) : null}

        <PageSection>
          <h3 className="text-[18px] font-semibold text-white">Площадки</h3>
          {!overview || overview.platforms_breakdown.length === 0 ? (
            <p className="mt-2 text-[14px] text-white/65">По площадкам пока нет данных.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {overview.platforms_chart.length > 0 ? (
                <AnalyticsPlatformsChart
                  data={overview.platforms_chart}
                  platforms={overview.platforms_breakdown.map((item) => item.platform)}
                  selectedPlatform={focusedPlatform}
                  onSelectPlatform={handleSelectPlatform}
                />
              ) : null}
              <div className="grid gap-2 lg:grid-cols-2">
                {overview.platforms_breakdown.map((item) => {
                  const active = focusedPlatform === item.platform;
                  return (
                    <button
                      key={item.platform}
                      type="button"
                      onClick={() => handleSelectPlatform(active ? "" : item.platform)}
                      className={`rounded-xl border p-3 text-left transition ${
                        active
                          ? "border-[#7b3df5]/40 bg-[#7b3df5]/12"
                          : "border-white/10 bg-black/20 hover:bg-black/28"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[14px] font-semibold text-white">{item.platform}</p>
                        <span className="text-[11px] font-medium text-white/55">
                          {active ? "Выбрано" : "Открыть"}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-white/70">
                        {item.streams.toLocaleString("ru-RU")} streams ·{" "}
                        {item.pay_streams.toLocaleString("ru-RU")} pay streams
                      </p>
                      <p className="mt-1 text-[12px] text-white/60">{item.share_percent.toFixed(1)}%</p>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-[#7b3df5]"
                          style={{ width: `${Math.max(0, Math.min(100, item.share_percent))}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </PageSection>

        {filters.releaseId ? (
          <PageSection>
            <h3 className="text-[18px] font-semibold text-white">Страны (текущий отчёт)</h3>
            {loadingDetails ? (
              <p className="mt-2 text-[14px] text-white/70">Загружаем детализацию релиза…</p>
            ) : detailsError ? (
              <p className="mt-2 text-[14px] text-rose-300">{detailsError}</p>
            ) : !releaseDetails || releaseDetails.countries_breakdown.length === 0 ? (
              <p className="mt-2 text-[14px] text-white/65">По выбранному релизу пока нет данных по странам.</p>
            ) : (
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
                <table className="w-full border-collapse text-left text-[14px]">
                  <thead className="bg-white/[0.03] text-white/65">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Страна</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Streams</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Pay streams</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releaseDetails.countries_breakdown.map((item) => (
                      <tr key={item.country} className="border-t border-white/10">
                        <td className="px-3 py-2.5">{item.country}</td>
                        <td className="px-3 py-2.5 text-right">{item.streams.toLocaleString("ru-RU")}</td>
                        <td className="px-3 py-2.5 text-right">{item.pay_streams.toLocaleString("ru-RU")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PageSection>
        ) : null}
      </div>
    </DashboardShell>
  );
}
