import Link from "next/link";
import dynamic from "next/dynamic";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapActivePlanToTariffId } from "@/lib/subscription-billing";
import { getSubscriptionOverview } from "@/lib/subscription-limits";

const SubscriptionTiersClient = dynamic(
  () =>
    import("@/components/tariffs/subscription-tiers-client").then(
      (module) => module.SubscriptionTiersClient
    ),
  {
    loading: () => (
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="h-[560px] animate-pulse rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
        <div className="h-[560px] animate-pulse rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
        <div className="h-[560px] animate-pulse rounded-[24px] border border-white/[0.08] bg-white/[0.03]" />
      </div>
    )
  }
);

export default async function SubscriptionPage({
  searchParams
}: {
  searchParams?: { payment?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const overview = await getSubscriptionOverview(prisma, session.user.id);
  const subscriptionStateText =
    overview.hasActiveSubscription
      ? overview.endsAt
        ? `Окончание: ${new Date(overview.endsAt).toLocaleDateString("ru-RU")}`
        : "Подписка активна"
      : "Подписка не активна";

  const currentTariffId = mapActivePlanToTariffId(overview.currentPlan);

  return (
    <DashboardShell>
      <PageHeader
        title="Тарифы"
        description="Управляйте подпиской, лимитами релизов и AI."
        actions={
          <Link
            href="/#pricing"
            className="text-[15px] font-medium text-white/62 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            На сайте
          </Link>
        }
      />

      <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[12px] uppercase tracking-wide text-white/55">
              {overview.hasActiveSubscription ? "Текущий тариф" : "Статус подписки"}
            </p>
            <h2 className="mt-1 text-[24px] font-semibold text-white">
              {overview.currentPlan ?? "Нет активной подписки"}
            </h2>
            <p className="mt-1 text-[13px] text-white/65">
              {subscriptionStateText}
              {overview.countdownDays != null ? ` · Осталось ${overview.countdownDays} дн.` : ""}
            </p>
            {overview.shouldNotifyExpiry ? (
              <p className="mt-2 inline-flex rounded-lg border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[12px] text-amber-200">
                Подписка закончится менее чем через 3 дня
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <a
              href="#tiers"
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[13px] font-semibold text-white hover:bg-white/15"
            >
              Обновить подписку
            </a>
            <a
              href="#tiers"
              className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-[13px] font-semibold text-emerald-100"
            >
              Повысить тариф
            </a>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-[12px] text-white/60">Включённые релизы</p>
            <p className="mt-1 text-[22px] font-semibold text-white">
              {overview.usage.releasesUsed} /{" "}
              {overview.limits.releasesLimit == null ? "∞" : overview.limits.releasesLimit}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <p className="text-[12px] text-white/60">AI запросы</p>
            <p className="mt-1 text-[15px] font-semibold text-white">
              {overview.limits.aiEnabled
                ? `${overview.usage.aiDayUsed} / ${overview.limits.aiDayLimit ?? "∞"} сегодня`
                : "Недоступен на текущем тарифе"}
            </p>
            <p className="mt-1 text-[13px] text-white/65">
              {overview.limits.aiEnabled
                ? `${overview.usage.aiMonthUsed} / ${overview.limits.aiMonthLimit ?? "∞"} за месяц`
                : "Для AI нужен PRO или ENTERPRISE"}
            </p>
          </div>
        </div>

        {overview.limits.releasesLimit != null &&
        overview.usage.releasesUsed >= overview.limits.releasesLimit ? (
          <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3">
            <p className="text-[13px] font-medium text-rose-200">
              Вы использовали все релизы за этот месяц
            </p>
            <p className="mt-1 text-[12px] text-rose-100/85">
              Можно оплатить релиз отдельно или перейти на PRO.
            </p>
          </div>
        ) : null}
      </section>

      {searchParams?.payment === "return" ? (
        <p className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-[14px] font-medium text-emerald-100/95">
          Возврат из платежного шлюза выполнен. Если оплата прошла успешно, тариф обновится в течение минуты.
        </p>
      ) : null}

      <div id="tiers" />
      <SubscriptionTiersClient
        hasActiveSubscription={overview.hasActiveSubscription}
        currentTariffId={currentTariffId}
      />

      <p className="mt-6 text-center text-[14px] font-medium text-white/56">
        Используется YooKassa (банковские карты, SberPay и другие способы, доступные в вашем аккаунте ЮKassa). По вопросам —{" "}
        <Link href="/dashboard/support" className="text-[#a78bfa] underline-offset-2 hover:underline">
          поддержка
        </Link>
        .
      </p>
    </DashboardShell>
  );
}
