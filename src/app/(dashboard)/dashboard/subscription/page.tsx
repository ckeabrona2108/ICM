import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { SubscriptionPaymentStatusNotice } from "@/components/tariffs/subscription-payment-status-notice";
import { SubscriptionTiersClient } from "@/components/tariffs/subscription-tiers-client";
import { formatAiTokenAmount } from "@/lib/ai-studio";
import { authOptions } from "@/lib/auth";
import { confirmYooKassaOrderAfterReturn } from "@/lib/payment-order-service";
import { prisma } from "@/lib/prisma";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import { getUserReleaseQuota } from "@/lib/release-quota";
import { RELEASE_BASE_PRICE_RUB } from "@/lib/release-pricing";
import { getSubscriptionOverview, type EffectivePlan } from "@/lib/subscription-limits";
import { ReleaseShareBadge } from "@/components/releases/release-share-badge";
import { getCabinetReleasesByUser } from "@/lib/cabinet-release-queries";
import { RELEASE_SHARE_PERCENTS, type ReleaseShare, type ReleaseSharePercent } from "@/lib/release-share";

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
    redirect("/login?callbackUrl=%2Fdashboard%2Fsubscription");
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
          release: RELEASE_BASE_PRICE_RUB,
          text: 75,
          karaokeText: 75,
          videoShot: 0,
          videoClip: 150
        },
        countdownDays: null,
        endsAt: null
      };
    }
    throw error;
  });
  const releaseQuota = await getUserReleaseQuota(session.user.id, prisma);
  const shareGroups = await loadReleaseShareGroups(session.user.id).catch((error) => {
    console.error("[subscription] release shares failed", error);
    return [];
  });
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

      <div className="ux-surface-soft mb-5 rounded-[24px] p-4 text-[14px] leading-6 text-white/74 sm:p-5">
        {paymentResult ? (
          <SubscriptionPaymentStatusNotice
            status={paymentResult.status}
            applied={paymentResult.applied}
            tokensSummary={
              paymentResult.paymentSummary?.totalTokens
                ? `Начислено ${formatAiTokenAmount(paymentResult.paymentSummary.totalTokens)} AI-токенов.`
                : null
            }
          />
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
          <p className="mt-3 rounded-[18px] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-amber-100">
            Лимит подписки исчерпан или подписка не активна. Следующий релиз нужно оплатить отдельно.
          </p>
        ) : null}
      </div>

      {shareGroups.length > 0 ? (
        <ReleaseSharesBlock groups={shareGroups} currentPlan={overview.hasActiveSubscription ? overview.currentPlan : null} />
      ) : null}

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
    <div className="ux-surface-soft rounded-[20px] px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/42">{label}</p>
      <p
        className={
          tone === "success"
            ? "mt-1 text-[18px] font-semibold text-emerald-200"
            : tone === "warning"
              ? "mt-1 text-[18px] font-semibold text-amber-200"
              : "mt-1 text-[18px] font-semibold text-white"
        }
      >
        {value}
      </p>
    </div>
  );
}

interface ReleaseShareGroup {
  share: ReleaseShare;
  count: number;
}

/** Sent releases grouped by "Ваша доля"; drafts have no share yet. */
async function loadReleaseShareGroups(userId: string): Promise<ReleaseShareGroup[]> {
  const releases = await getCabinetReleasesByUser(userId);
  const groups = new Map<ReleaseSharePercent, ReleaseShareGroup>();
  for (const release of releases) {
    if (release.status === "draft" || !release.share) continue;
    const group = groups.get(release.share.percent);
    if (group) group.count += 1;
    else groups.set(release.share.percent, { share: release.share, count: 1 });
  }
  return RELEASE_SHARE_PERCENTS.flatMap((percent) => {
    const group = groups.get(percent);
    return group ? [group] : [];
  });
}

function releasesLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} релиз`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} релиза`;
  return `${count} релизов`;
}

function ReleaseSharesBlock({ groups, currentPlan }: { groups: ReleaseShareGroup[]; currentPlan: EffectivePlan | null }) {
  const upsell =
    currentPlan === "ENTERPRISE"
      ? null
      : currentPlan === "PRO"
        ? "На ENTERPRISE новые релизы будут приносить вам 100% дохода."
        : "На PRO новые релизы будут приносить вам 95% дохода, на ENTERPRISE — 100%.";
  return (
    <div className="mb-5 rounded-[24px] border border-[#7b61ff]/35 bg-[#7b61ff]/[0.08] p-4 sm:p-5">
      <p className="text-[15px] font-bold text-white">Ваша доля дохода по релизам</p>
      <p className="mt-0.5 text-[13px] text-white/60">Доля закрепляется за релизом в момент отправки.</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
        {groups.map((group) => (
          <div key={group.share.percent} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3">
            <ReleaseShareBadge share={group.share} align="left" />
            <p className="mt-2 text-[20px] font-bold text-white">{releasesLabel(group.count)}</p>
          </div>
        ))}
      </div>
      {upsell ? <p className="mt-3 text-[13px] text-[#c4b5fd]">{upsell}</p> : null}
    </div>
  );
}
