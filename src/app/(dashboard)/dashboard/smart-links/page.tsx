import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { getSmartLinkPlatformLabel } from "@/lib/smart-link-platforms";
import { getSmartLinksByUser, type SmartLinkOwnerView } from "@/lib/smart-link-service";
import { getSmartLinkCountDelta, getSmartLinkRateDelta, type SmartLinkDelta } from "@/lib/smart-link-stats";
import { safeSmartLinkHref } from "@/lib/smart-link-urls";
import { DashboardEmptyState, DashboardShell } from "@/components/layout/dashboard-shell";
import { SmartLinksTable, type SmartLinkTableItem } from "@/components/smart-link/smart-links-table";

export const dynamic = "force-dynamic";

function lastDayKeys(count: number, offset = 0): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset - (count - 1 - index));
    return date.toISOString().slice(0, 10);
  });
}

const DELTA_TONE_CLASS: Record<SmartLinkDelta["tone"], string> = {
  up: "bg-emerald-400/10 text-emerald-300",
  down: "bg-rose-400/10 text-rose-300",
  flat: "bg-zinc-800 text-zinc-400"
};

function sumDaily(items: SmartLinkOwnerView[], keys: string[], field: "views" | "clicks"): number {
  return items.reduce((total, item) => total + keys.reduce((sum, key) => sum + (item.analytics.daily[key]?.[field] ?? 0), 0), 0);
}

export default async function SmartLinksDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const smartLinks = await getSmartLinksByUser(session.user.id);
  const sparkKeys = lastDayKeys(14);
  const monthKeys = lastDayKeys(30);
  const previousMonthKeys = lastDayKeys(30, 30);

  const items: SmartLinkTableItem[] = smartLinks.map((item) => ({
    releaseId: item.releaseId,
    title: item.title,
    artist: item.artist,
    slug: item.publicSlug,
    publicUrl: item.publicUrl,
    coverUrl: item.coverUrl,
    livePlatformCodes: item.platforms
      .filter((platform) => platform.status === "live" && safeSmartLinkHref(platform.url))
      .map((platform) => platform.code),
    views: item.analytics.totalViews,
    clicks: item.analytics.totalClicks,
    dailyClicks: sparkKeys.map((key) => item.analytics.daily[key]?.clicks ?? 0)
  }));

  const totalViews = smartLinks.reduce((sum, item) => sum + item.analytics.totalViews, 0);
  const totalClicks = smartLinks.reduce((sum, item) => sum + item.analytics.totalClicks, 0);
  const platformTotals = new Map<string, number>();
  for (const item of smartLinks) {
    for (const [code, value] of Object.entries(item.analytics.platformClicks)) {
      platformTotals.set(code, (platformTotals.get(code) ?? 0) + value);
    }
  }
  const [topPlatform] = Array.from(platformTotals.entries()).sort((left, right) => right[1] - left[1]);
  const monthViews = sumDaily(smartLinks, monthKeys, "views");
  const monthClicks = sumDaily(smartLinks, monthKeys, "clicks");
  const previousViews = sumDaily(smartLinks, previousMonthKeys, "views");
  const previousClicks = sumDaily(smartLinks, previousMonthKeys, "clicks");
  const kpis: Array<{ label: string; value: string; hint: string; delta: SmartLinkDelta | null }> = [
    {
      label: "Просмотры страниц",
      value: totalViews.toLocaleString("ru-RU"),
      hint: `${monthViews.toLocaleString("ru-RU")} за 30 дней`,
      delta: getSmartLinkCountDelta(monthViews, previousViews)
    },
    {
      label: "Переходы на площадки",
      value: totalClicks.toLocaleString("ru-RU"),
      hint: `${monthClicks.toLocaleString("ru-RU")} за 30 дней`,
      delta: getSmartLinkCountDelta(monthClicks, previousClicks)
    },
    {
      label: "Конверсия в переход",
      value: `${totalViews > 0 ? Math.round((totalClicks / totalViews) * 100) : 0}%`,
      hint: "переходы / просмотры",
      delta: getSmartLinkRateDelta({ hits: monthClicks, total: monthViews }, { hits: previousClicks, total: previousViews })
    },
    {
      label: "Чаще всего выбирают",
      value: topPlatform ? getSmartLinkPlatformLabel(topPlatform[0]) : "—",
      hint: topPlatform && totalClicks > 0 ? `${Math.round((topPlatform[1] / totalClicks) * 100)}% переходов` : "пока нет данных",
      delta: null
    }
  ];

  return (
    <DashboardShell>
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-white">Smart Links</h1>
        <p className="mt-1.5 text-sm text-zinc-400">Одна ссылка на релиз для всех площадок. Создаётся сама, когда релиз одобрен.</p>
      </div>

      {smartLinks.length === 0 ? (
        <DashboardEmptyState
          title="Пока нет Smart Links"
          description="Smart Link создаётся автоматически для опубликованного релиза. Как только релиз будет готов, он появится здесь."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-[14px] border border-zinc-800 bg-zinc-950/60 px-4 py-4">
                <div className="text-[12.5px] text-zinc-400">{kpi.label}</div>
                <div className="mt-2 flex min-w-0 items-baseline gap-2">
                  <span className="truncate text-[24px] font-semibold tracking-[-0.03em] text-white">{kpi.value}</span>
                  {kpi.delta ? (
                    <span
                      title="Последние 30 дней к предыдущим 30"
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${DELTA_TONE_CLASS[kpi.delta.tone]}`}
                    >
                      {kpi.delta.text}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 text-xs text-zinc-500">{kpi.hint}</div>
              </div>
            ))}
          </div>
          <SmartLinksTable items={items} />
        </>
      )}
    </DashboardShell>
  );
}
