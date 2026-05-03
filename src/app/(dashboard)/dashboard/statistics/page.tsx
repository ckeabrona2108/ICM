import dynamic from "next/dynamic";

const AnalyticsPage = dynamic(
  () => import("@/components/analytics/analytics-page").then((module) => module.AnalyticsPage),
  {
    loading: () => (
      <div className="space-y-3">
        <div className="h-12 w-64 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="h-64 w-full animate-pulse rounded-2xl border border-white/[0.08] bg-white/[0.04]" />
      </div>
    )
  }
);

export default function StatisticsPage() {
  return <AnalyticsPage />;
}
