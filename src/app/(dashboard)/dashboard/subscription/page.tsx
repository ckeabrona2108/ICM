import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { SubscriptionTiersClient } from "@/components/tariffs/subscription-tiers-client";
import { authOptions } from "@/lib/auth";
import { confirmYooKassaOrderAfterReturn } from "@/lib/payment-order-service";
import { prisma } from "@/lib/prisma";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import { getUserReleaseQuota } from "@/lib/release-quota";
import { getSubscriptionOverview, type EffectivePlan } from "@/lib/subscription-limits";

type TariffId = "standard" | "pro" | "enterprise";

function mapPlanToTariffId(plan: EffectivePlan | null): TariffId | null {
  if (plan === "PRO") return "pro";
  if (plan === "ENTERPRISE") return "enterprise";
  if (plan === "STANDARD") return "standard";
  return null;
}

export default async function SubscriptionPage({
  searchParams
}: {
  searchParams?: { pay_order?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const payOrderId = searchParams?.pay_order?.trim();
  const paymentResult = payOrderId
    ? await confirmYooKassaOrderAfterReturn({
        prisma,
        userId: session.user.id,
        orderId: payOrderId
      }).catch((error) => {
        console.error("[subscription:return] failed to confirm payment", error);
        return null;
      })
    : null;

  const overview = await getSubscriptionOverview(prisma, session.user.id).catch((error) => {
    if (
      isPrismaTableMissingError(error, "subscription") ||
      isPrismaTableMissingError(error, "subscription_usage")
    ) {
      return {
        plan: "STANDARD" as const,
        hasActiveSubscription: false,
        currentPlan: null,
        status: "none" as const,
        startedAt: null,
        shouldNotifyExpiry: false,
        limits: {
          releasesLimit: 0,
          aiDayLimit: 0,
          aiMonthLimit: 0,
          aiEnabled: false
        },
        usage: {
          periodStart: null,
          periodEnd: null,
          releasesUsed: 0,
          aiDayUsed: 0,
          aiMonthUsed: 0,
          lastAiResetDay: null
        },
        pricing: {
          release: 350,
          text: 75,
          karaokeText: 75,
          videoShot: 75,
          videoClip: 100
        },
        countdownDays: null,
        endsAt: null
      };
    }
    throw error;
  });
  const releaseQuota = await getUserReleaseQuota(session.user.id, prisma);
  const currentTariffId = mapPlanToTariffId(overview.currentPlan);
  const quotaLimitLabel =
    releaseQuota.includedLimit == null ? "Безлимит" : String(releaseQuota.includedLimit);
  const quotaRemainingLabel =
    releaseQuota.remaining == null ? "Безлимит" : String(releaseQuota.remaining);

  return (
    <DashboardShell>
      <PageHeader
        title="Управление подпиской"
        description="Выберите тариф, чтобы увеличить лимиты релизов и открыть AI-функции."
      />

      <div className="mb-5 rounded-2xl border border-white/[0.08] bg-[#13151d]/92 p-4 text-[14px] text-white/78">
        {paymentResult?.applied ? (
          <p className="mb-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-emerald-100">
            Оплата подтверждена. Подписка обновлена.
          </p>
        ) : paymentResult && paymentResult.status !== "already_confirmed" ? (
          <p className="mb-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-amber-100">
            Платёж ещё не подтверждён YooKassa. Если деньги списались, обновите страницу через несколько секунд.
          </p>
        ) : null}
        <p>
          Текущий статус:{" "}
          <span className="font-semibold text-white">
            {overview.hasActiveSubscription ? "Активна" : "Не активна"}
          </span>
        </p>
        <p className="mt-1">
          Текущий план:{" "}
          <span className="font-semibold text-white">
            {overview.currentPlan ?? "STANDARD"}
          </span>
        </p>
        {overview.endsAt ? (
          <p className="mt-1">
            Действует до:{" "}
            <span className="font-semibold text-white">
              {new Date(overview.endsAt).toLocaleDateString("ru-RU")}
            </span>
          </p>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <QuotaCard label="Релизов по подписке" value={quotaLimitLabel} />
          <QuotaCard label="Использовано" value={String(releaseQuota.used)} />
          <QuotaCard label="Осталось" value={quotaRemainingLabel} />
          <QuotaCard
            label="Следующий релиз"
            value={releaseQuota.requiresPaymentForNextRelease ? "Платно" : "Включён"}
            tone={releaseQuota.requiresPaymentForNextRelease ? "warning" : "success"}
          />
        </div>
        {releaseQuota.requiresPaymentForNextRelease ? (
          <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-amber-100">
            Лимит подписки исчерпан или подписка не активна. Следующий релиз нужно оплатить отдельно.
          </p>
        ) : null}
      </div>

      <SubscriptionTiersClient
        hasActiveSubscription={overview.hasActiveSubscription}
        currentTariffId={currentTariffId}
      />
    </DashboardShell>
  );
}

function QuotaCard({
  label,
  value,
  tone = "default"
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/42">{label}</p>
      <p
        className={
          tone === "success"
            ? "mt-1 text-[18px] font-bold text-emerald-200"
            : tone === "warning"
              ? "mt-1 text-[18px] font-bold text-amber-200"
              : "mt-1 text-[18px] font-bold text-white"
        }
      >
        {value}
      </p>
    </div>
  );
}
