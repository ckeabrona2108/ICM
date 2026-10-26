import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Disc3,
  Headphones,
  Newspaper,
  Pin,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet
} from "lucide-react";

import { OverviewStreamsChart } from "@/components/dashboard/overview-streams-chart";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { GlazePluginsBanner } from "@/components/plugins/glaze-plugins-banner";
import { StatusBadge } from "@/components/releases/status-badge";
import { authOptions } from "@/lib/auth";
import { formatRubCurrency } from "@/lib/currency-format";
import { getDashboardOverview } from "@/lib/dashboard-overview";

const TILE =
  "rounded-[24px] border border-white/[0.09] bg-[#13151d] p-5 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)]";

const numberFormat = new Intl.NumberFormat("ru-RU");

function formatNewsDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

function pluralizeReleases(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "релиз";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "релиза";
  return "релизов";
}

function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("ru-RU", { hour: "numeric", hour12: false, timeZone: "Europe/Moscow" }).format(new Date())
  );
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  if (session.user.role === "ADMIN") {
    redirect("/admin");
  }

  const overview = await getDashboardOverview(session.user.id);
  const firstName = session.user.name?.trim().split(/\s+/)[0];
  const streams = overview.streams;
  const releases = overview.releases;
  const changePercent = streams?.changePercent ?? null;

  return (
    <DashboardShell>
      <PageHeader
        caption={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        title="Обзор"
        actions={
          <Link
            href="/dashboard/releases/new"
            className="ux-button-primary inline-flex h-11 items-center gap-2 rounded-[18px] px-4 text-[15px] font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Новый релиз
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/dashboard/finance" className={`${TILE} transition-colors hover:border-white/[0.16]`}>
          <p className="flex items-center gap-2 text-[13.5px] font-medium text-white/55">
            <Wallet className="h-4 w-4" /> Баланс
          </p>
          <p className="mt-3 text-[30px] font-bold tracking-[-0.02em] text-white">
            {overview.availableBalance == null ? "—" : formatRubCurrency(overview.availableBalance)}
          </p>
          <p className="mt-2 text-[13.5px] font-semibold text-[#a78bfa]">Вывести средства →</p>
        </Link>

        <Link href="/dashboard/statistics" className={`${TILE} transition-colors hover:border-white/[0.16]`}>
          <p className="flex items-center gap-2 text-[13.5px] font-medium text-white/55">
            <Headphones className="h-4 w-4" /> Прослушивания · 30 дней
          </p>
          <p className="mt-3 text-[30px] font-bold tracking-[-0.02em] text-white">
            {streams ? numberFormat.format(streams.total) : "—"}
          </p>
          {changePercent != null ? (
            <span
              className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                changePercent >= 0 ? "bg-emerald-500/12 text-emerald-400" : "bg-rose-500/12 text-rose-400"
              }`}
            >
              {changePercent >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {changePercent >= 0 ? "+" : ""}
              {Math.round(changePercent)}%
            </span>
          ) : (
            <p className="mt-2 text-[13.5px] font-medium text-white/45">Подробная аналитика →</p>
          )}
        </Link>

        <Link href="/dashboard/releases" className={`${TILE} transition-colors hover:border-white/[0.16]`}>
          <p className="flex items-center gap-2 text-[13.5px] font-medium text-white/55">
            <Disc3 className="h-4 w-4" /> Релизы
          </p>
          <p className="mt-3 text-[30px] font-bold tracking-[-0.02em] text-white">{releases ? releases.total : "—"}</p>
          <p className="mt-2 text-[13.5px] font-medium text-white/45">
            {releases ? `${releases.live} на площадках · ${releases.moderation} на модерации` : "Все релизы →"}
          </p>
        </Link>

        {releases && releases.changesRequired > 0 ? (
          <Link
            href="/dashboard/changes-required"
            className="rounded-[24px] border border-amber-400/35 bg-[linear-gradient(180deg,rgba(251,191,36,0.07),#13151d)] p-5 transition-colors hover:border-amber-400/55"
          >
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-amber-400">
              <AlertTriangle className="h-4 w-4" /> Требует внимания
            </p>
            <p className="mt-3 text-[30px] font-bold tracking-[-0.02em] text-amber-200">
              {releases.changesRequired} {pluralizeReleases(releases.changesRequired)}
            </p>
            <p className="mt-2 text-[13.5px] font-semibold text-amber-400">Исправить замечания →</p>
          </Link>
        ) : (
          <Link href="/dashboard/releases/new" className={`${TILE} transition-colors hover:border-white/[0.16]`}>
            <p className="flex items-center gap-2 text-[13.5px] font-medium text-emerald-400">
              <Sparkles className="h-4 w-4" /> Всё в порядке
            </p>
            <p className="mt-3 text-[22px] font-bold leading-tight tracking-[-0.02em] text-white">
              Замечаний по релизам нет
            </p>
            <p className="mt-2 text-[13.5px] font-semibold text-[#a78bfa]">Выпустить новый →</p>
          </Link>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className={TILE}>
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-white">Прослушивания</h2>
            <Link href="/dashboard/statistics" className="text-[13.5px] font-semibold text-white/45 hover:text-white">
              Аналитика →
            </Link>
          </div>
          {streams && streams.chart.length > 1 ? (
            <div className="mt-4">
              <OverviewStreamsChart data={streams.chart} />
            </div>
          ) : (
            <div className="mt-4 grid h-[240px] place-items-center rounded-2xl border border-dashed border-white/10 text-center text-[14px] text-white/45">
              <p className="max-w-xs">
                График появится, когда придут первые отчёты площадок по вашим релизам.
              </p>
            </div>
          )}
        </section>

        <section className={TILE}>
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-white">Мои релизы</h2>
            <Link href="/dashboard/releases" className="text-[13.5px] font-semibold text-white/45 hover:text-white">
              Все →
            </Link>
          </div>
          {releases && releases.recent.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {releases.recent.map((release) => (
                <li key={release.id}>
                  <Link
                    href={`/dashboard/releases/${release.id}`}
                    className="flex items-center gap-3.5 rounded-2xl p-1.5 transition-colors hover:bg-white/[0.03]"
                  >
                    {release.coverSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={release.coverSrc}
                        alt=""
                        className="h-[52px] w-[52px] shrink-0 rounded-xl border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
                        <Disc3 className="h-5 w-5 text-white/35" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-white">{release.title}</span>
                      <span className="block truncate text-[13px] text-white/45">{release.artist}</span>
                    </span>
                    <StatusBadge status={release.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-4 grid h-[240px] place-items-center rounded-2xl border border-dashed border-white/10 text-center">
              <div>
                <p className="text-[14px] text-white/55">У вас пока нет отправленных релизов.</p>
                <Link
                  href="/dashboard/releases/new"
                  className="mt-3 inline-flex items-center gap-2 text-[14px] font-semibold text-[#a78bfa]"
                >
                  Выпустить первый релиз <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className={TILE}>
          <div className="flex items-center justify-between">
            <h2 className="text-[17px] font-semibold text-white">Новости</h2>
            <Link href="/dashboard/news" className="text-[13.5px] font-semibold text-white/45 hover:text-white">
              Все новости →
            </Link>
          </div>
          {overview.news.length > 0 ? (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {overview.news.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/dashboard/news/${item.slug}`}
                    className="group flex items-center gap-4 py-3.5 transition-colors"
                  >
                    {item.cover_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.cover_image}
                        alt=""
                        className="h-14 w-20 shrink-0 rounded-xl border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="grid h-14 w-20 shrink-0 place-items-center rounded-xl border border-[#7b61ff]/25 bg-[radial-gradient(circle_at_top,rgba(167,139,250,0.28),transparent_65%),#171a24]">
                        <Newspaper className="h-6 w-6 text-[#c4b5fd]" strokeWidth={1.7} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-[12px] text-white/45">
                        {formatNewsDate(item.published_at)}
                        {item.is_pinned ? (
                          <span className="inline-flex items-center gap-1 text-amber-200">
                            <Pin className="h-3 w-3" /> Закреплено
                          </span>
                        ) : null}
                        {item.is_new ? (
                          <span className="rounded-full bg-[#7b61ff]/20 px-2 py-0.5 font-semibold text-[#d8c5ff]">Новое</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-[15px] font-semibold text-white/90 group-hover:text-white">
                        {item.title}
                      </span>
                      {item.excerpt ? (
                        <span className="mt-0.5 block truncate text-[13px] text-white/45">{item.excerpt}</span>
                      ) : null}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-white/30 transition-transform group-hover:translate-x-0.5 group-hover:text-white/70" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[14px] text-white/45">Новостей пока нет.</p>
          )}
        </section>

        <GlazePluginsBanner />
      </div>
    </DashboardShell>
  );
}
