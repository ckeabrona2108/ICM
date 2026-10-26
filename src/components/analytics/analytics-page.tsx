"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { BarChart3, Clock3 } from "lucide-react";

import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import {
  AnalyticsFilters,
  DEFAULT_ANALYTICS_FILTERS,
  type AnalyticsFilterState
} from "@/components/analytics/analytics-filters";
import { AnalyticsOverviewCard } from "@/components/analytics/analytics-overview-card";
import { AnalyticsReleaseTable } from "@/components/analytics/analytics-release-table";
import {
  ANALYTICS_MINT,
  ANALYTICS_PURPLE,
  AnalyticsCard,
  ShareRow,
  SkeletonBlock,
  formatCountryName,
  formatReportDate,
  getPlatformColor
} from "@/components/analytics/analytics-ui";
import type {
  AnalyticsCountriesResponse,
  AnalyticsOverviewChartPointResponse,
  AnalyticsOverviewResponse,
  AnalyticsReleaseListItemResponse
} from "@/lib/api/contracts";

const AnalyticsLineChart = dynamic(
  () =>
    import("@/components/analytics/analytics-line-chart").then(
      (module) => module.AnalyticsLineChart
    ),
  {
    ssr: false,
    loading: () => <SkeletonBlock className="h-[260px] w-full sm:h-[300px]" />
  }
);

const STALE_REPORT_DAYS = 7;

function buildQuery(filters: AnalyticsFilterState, options: { withRelease: boolean }): string {
  const params = new URLSearchParams();
  params.set("days", String(filters.days));
  if (options.withRelease && filters.releaseId) params.set("release_id", filters.releaseId);
  if (filters.country.trim()) params.set("country", filters.country.trim());
  if (filters.upc.trim()) params.set("upc", filters.upc.trim());
  if (filters.platform.trim()) params.set("platform", filters.platform.trim());
  return params.toString();
}

/** Loads JSON with a timeout; keeps the previous fetch logic of the page in one place. */
function useAnalyticsResource<T>(url: string | null, validate: (payload: unknown) => payload is T, errorText: string) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(Boolean(url));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!url) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 15_000);
    setLoading(true);
    setError(null);
    setData(null);

    void (async () => {
      try {
        const response = await fetch(url, { method: "GET", signal: controller.signal });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok || !validate(payload)) throw new Error(errorText);
        if (!cancelled) setData(payload);
      } catch (fetchError) {
        if (cancelled) return;
        setError(
          fetchError instanceof DOMException && fetchError.name === "AbortError"
            ? "Загрузка заняла слишком много времени. Обновите страницу."
            : errorText
        );
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [errorText, url, validate]);

  return { data, loading, error };
}

const isOverview = (payload: unknown): payload is AnalyticsOverviewResponse =>
  Boolean(payload && typeof payload === "object" && !Array.isArray(payload) && "chart" in payload);
const isReleaseList = (payload: unknown): payload is AnalyticsReleaseListItemResponse[] => Array.isArray(payload);
const isCountries = (payload: unknown): payload is AnalyticsCountriesResponse =>
  Boolean(payload && typeof payload === "object" && "countries_breakdown" in payload);

function daysSince(dateKey: string | null | undefined): number | null {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
}

export function AnalyticsPage() {
  const [filters, setFilters] = React.useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTERS);
  const [focusedPlatform, setFocusedPlatform] = React.useState("");

  const overviewUrl = `/api/analytics/overview?${buildQuery(filters, { withRelease: true })}`;
  const releasesUrl = `/api/analytics/releases?${buildQuery(filters, { withRelease: false })}`;
  const countriesUrl = `/api/analytics/countries?${buildQuery(
    { ...DEFAULT_ANALYTICS_FILTERS, days: filters.days, releaseId: filters.releaseId },
    { withRelease: true }
  )}`;

  const overviewState = useAnalyticsResource(overviewUrl, isOverview, "Не удалось загрузить аналитику");
  const releasesState = useAnalyticsResource(releasesUrl, isReleaseList, "Не удалось загрузить список релизов");
  const countriesState = useAnalyticsResource(countriesUrl, isCountries, "Не удалось загрузить страны");

  const overview = overviewState.data;
  const releases = React.useMemo(() => releasesState.data ?? [], [releasesState.data]);
  const platforms = React.useMemo(() => overview?.platforms_breakdown ?? [], [overview]);

  React.useEffect(() => {
    if (!filters.releaseId || releasesState.loading) return;
    if (releases.some((release) => release.release_id === filters.releaseId)) return;
    setFilters((prev) => (prev.releaseId ? { ...prev, releaseId: "" } : prev));
  }, [filters.releaseId, releases, releasesState.loading]);

  React.useEffect(() => {
    if (focusedPlatform && !platforms.some((item) => item.platform === focusedPlatform)) {
      setFocusedPlatform("");
    }
  }, [focusedPlatform, platforms]);

  const handleSelectRelease = React.useCallback((releaseId: string) => {
    setFilters((prev) => ({ ...prev, releaseId: prev.releaseId === releaseId ? "" : releaseId }));
  }, []);

  const platformColor = React.useCallback(
    (platform: string) => getPlatformColor(platform, Math.max(0, platforms.findIndex((item) => item.platform === platform))),
    [platforms]
  );

  const chartData = React.useMemo<AnalyticsOverviewChartPointResponse[]>(() => {
    if (!overview) return [];
    if (!focusedPlatform) return overview.chart;
    return overview.platforms_chart.map((point) => {
      const value = point.values.find((item) => item.platform === focusedPlatform);
      return { date: point.date, streams: value?.streams ?? 0, pay_streams: value?.pay_streams ?? 0 };
    });
  }, [focusedPlatform, overview]);

  const countryRows = countriesState.data?.countries_breakdown ?? [];
  const countryTotal = countryRows.reduce((sum, item) => sum + item.streams, 0);
  const reportAge = daysSince(overview?.latest_report_date);
  const latestReportLabel = formatReportDate(overview?.latest_report_date);
  const hasData = Boolean(overview && (overview.total_streams > 0 || overview.chart.length > 0));

  return (
    <DashboardShell>
      {/* Filters live on their own row so the header does not jump when "Сбросить" appears. */}
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-white">Аналитика</h1>
          <p className="mt-1 text-[14px] text-white/55">Прослушивания ваших релизов на всех площадках</p>
          {latestReportLabel ? (
            <p
              className={cn(
                "mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] font-medium",
                reportAge != null && reportAge > STALE_REPORT_DAYS
                  ? "border-amber-300/30 bg-amber-400/10 text-amber-200"
                  : "border-white/[0.08] bg-white/[0.04] text-white/60"
              )}
            >
              <Clock3 className="h-3.5 w-3.5" />
              Последний отчёт площадок — {latestReportLabel}. Отчёты приходят с задержкой 2–5 дней
            </p>
          ) : null}
        </div>
        <AnalyticsFilters value={filters} releases={releases} onChange={setFilters} />
      </div>

      {overviewState.error ? (
        <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-200">
          {overviewState.error}
        </p>
      ) : null}

      {!overviewState.loading && !overviewState.error && !hasData ? (
        <AnalyticsCard className="py-12 text-center">
          <BarChart3 className="mx-auto h-10 w-10 text-white/30" />
          <p className="mt-4 text-[18px] font-semibold text-white">Данных пока нет</p>
          <p className="mx-auto mt-2 max-w-md text-[14px] text-white/55">
            Статистика появится после первого отчёта площадок. Обычно это 2–5 дней после выхода релиза.
          </p>
        </AnalyticsCard>
      ) : (
        <>
          <AnalyticsOverviewCard data={overview} countries={countriesState.data} loading={overviewState.loading} />

          <AnalyticsCard
            title={focusedPlatform ? `Динамика · ${focusedPlatform}` : "Динамика прослушиваний"}
            hint={
              <span className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: focusedPlatform ? platformColor(focusedPlatform) : ANALYTICS_PURPLE }}
                  />
                  Все
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ANALYTICS_MINT }} />
                  Больше 30 сек
                </span>
                {focusedPlatform ? (
                  <button
                    type="button"
                    onClick={() => setFocusedPlatform("")}
                    className="font-semibold text-[#b79bff] hover:text-white"
                  >
                    Все площадки
                  </button>
                ) : null}
              </span>
            }
          >
            {overviewState.loading ? (
              <SkeletonBlock className="h-[260px] w-full sm:h-[300px]" />
            ) : chartData.length < 2 ? (
              <p className="py-16 text-center text-[14px] text-white/55">
                График появится после нескольких ежедневных отчётов.
              </p>
            ) : (
              <AnalyticsLineChart
                data={chartData}
                primaryColor={focusedPlatform ? platformColor(focusedPlatform) : ANALYTICS_PURPLE}
              />
            )}
          </AnalyticsCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <AnalyticsCard title="Площадки" hint="Нажмите, чтобы показать на графике">
              {overviewState.loading ? (
                <div className="space-y-2">
                  <SkeletonBlock className="h-3 w-full rounded-full" />
                  <SkeletonBlock className="h-9 w-full" />
                  <SkeletonBlock className="h-9 w-full" />
                </div>
              ) : platforms.length === 0 ? (
                <p className="text-[14px] text-white/55">По площадкам пока нет данных.</p>
              ) : (
                <>
                  <div className="mb-3 flex h-3 gap-[3px] overflow-hidden rounded-full">
                    {platforms.map((item) => (
                      <span
                        key={item.platform}
                        className={cn(
                          "h-full transition-opacity",
                          focusedPlatform && focusedPlatform !== item.platform && "opacity-30"
                        )}
                        style={{ flexGrow: Math.max(item.share_percent, 0.5), backgroundColor: platformColor(item.platform) }}
                      />
                    ))}
                  </div>
                  {platforms.map((item) => (
                    <ShareRow
                      key={item.platform}
                      label={item.platform}
                      value={item.streams}
                      share={item.share_percent}
                      color={platformColor(item.platform)}
                      active={focusedPlatform === item.platform}
                      onClick={() => setFocusedPlatform((prev) => (prev === item.platform ? "" : item.platform))}
                    />
                  ))}
                </>
              )}
            </AnalyticsCard>

            <AnalyticsCard title="Страны" hint="Доля прослушиваний по последнему отчёту">
              {countriesState.loading ? (
                <div className="space-y-2">
                  <SkeletonBlock className="h-9 w-full" />
                  <SkeletonBlock className="h-9 w-full" />
                </div>
              ) : countriesState.error ? (
                <p className="text-[14px] text-rose-300">{countriesState.error}</p>
              ) : countryRows.length === 0 ? (
                <p className="text-[14px] text-white/55">По странам пока нет данных.</p>
              ) : (
                countryRows.slice(0, 8).map((item) => (
                  <ShareRow
                    key={item.country}
                    label={formatCountryName(item.country)}
                    value={item.streams}
                    share={countryTotal > 0 ? (item.streams / countryTotal) * 100 : 0}
                    color={ANALYTICS_PURPLE}
                    hideValue
                  />
                ))
              )}
            </AnalyticsCard>
          </div>

          <AnalyticsReleaseTable
            releases={releases}
            selectedReleaseId={filters.releaseId}
            onSelectRelease={handleSelectRelease}
            loading={releasesState.loading}
            error={releasesState.error}
          />
        </>
      )}
    </DashboardShell>
  );
}
