import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { ExternalLink, Settings2 } from "lucide-react";

import { authOptions } from "@/lib/auth";
import { getSmartLinksByUser } from "@/lib/smart-link-service";
import { DashboardEmptyState, DashboardShell, PageSection } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { SmartLinkCopyButton } from "@/components/smart-link/smart-link-copy-button";

export const dynamic = "force-dynamic";

export default async function SmartLinksDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const smartLinks = await getSmartLinksByUser(session.user.id);

  return (
    <DashboardShell>
      <PageHeader
        title="Smart Links"
        description="Отдельный раздел для всех публичных ссылок релизов: открывайте, копируйте, отслеживайте переходы и переходите в тонкую настройку каждого smart link."
      />

      {smartLinks.length === 0 ? (
        <DashboardEmptyState
          title="Пока нет Smart Links"
          description="Smart Link создаётся автоматически для опубликованного релиза. Как только релиз будет готов, он появится здесь."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {smartLinks.map((item) => {
            const topPlatform = item.platforms.find((platform) => platform.status === "live")?.label ?? "Скоро";
            const publishedCount = item.platforms.filter((platform) => platform.status === "live").length;

            return (
              <PageSection key={item.releaseId} className="overflow-hidden">
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                    {item.coverUrl ? (
                      <img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-[0.24em] text-white/38">
                        No Cover
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xl font-semibold text-white">{item.title}</p>
                        <p className="mt-1 truncate text-sm font-medium text-white/62">{item.artist}</p>
                        <p className="mt-2 truncate text-sm text-white/46">{item.publicUrl}</p>
                      </div>

                      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-right">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/42">Дата</p>
                        <p className="mt-1 text-sm font-medium text-white/82">{item.releaseDate}</p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-3.5 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Просмотры</p>
                        <p className="mt-2 text-lg font-semibold text-white">{item.analytics.totalViews}</p>
                      </div>
                      <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-3.5 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Переходы</p>
                        <p className="mt-2 text-lg font-semibold text-white">{item.analytics.totalClicks}</p>
                      </div>
                      <div className="rounded-2xl border border-white/[0.08] bg-black/20 px-3.5 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/42">Площадки</p>
                        <p className="mt-2 text-sm font-semibold text-white">{publishedCount} live</p>
                        <p className="mt-1 text-xs text-white/50">{topPlatform}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <a
                        href={item.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3.5 text-sm font-medium text-white/82 transition hover:bg-white/[0.07] hover:text-white"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Открыть
                      </a>
                      <SmartLinkCopyButton url={item.publicUrl} />
                      <Link
                        href={`/dashboard/releases/${encodeURIComponent(item.releaseId)}/smart-link`}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-400/18 bg-violet-500/10 px-3.5 text-sm font-medium text-violet-100 transition hover:bg-violet-500/16"
                      >
                        <Settings2 className="h-4 w-4" />
                        Настроить
                      </Link>
                    </div>
                  </div>
                </div>
              </PageSection>
            );
          })}
        </div>
      )}
    </DashboardShell>
  );
}
