import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { getAiStudioEntitlements } from "@/lib/ai-studio";
import { PageHeader } from "@/components/layout/page-header";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { SubscriptionPurchaseStats } from "@/components/user/subscription-purchase-stats";
import { ProfileBalanceCards } from "@/components/user/profile-balance-cards";
import { UserProfileForm } from "@/components/user/user-profile-form";
import { authOptions } from "@/lib/auth";
import { getUserContractStatus } from "@/lib/contract-verification";
import { hasUserAiTokenBalanceColumn } from "@/lib/ai-token-balance-column";
import { prisma } from "@/lib/prisma";
import {
  calculateSubscriptionEndDate,
  getSubscriptionTariffConfig,
  normalizeSubscriptionBillingPeriod
} from "@/lib/subscription-billing";

type SubscriptionTariffId = "standard" | "pro" | "enterprise";

type SubscriptionPurchaseRow = {
  id: string;
  tariffLabel: string;
  amountRub: number;
  billingLabel: string;
  purchasedAt: string | null;
  endsAt: string | null;
  status: "paid" | "incomplete" | "canceled";
};

function readOrderMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeTariffId(value: unknown): SubscriptionTariffId {
  const tariffId = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (tariffId === "pro" || tariffId === "enterprise" || tariffId === "standard") {
    return tariffId;
  }
  return "standard";
}

function normalizeUserPlan(value: unknown): string | null {
  const plan = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!plan) return null;
  if (plan === "professional" || plan === "pro") return "PRO";
  if (plan === "enterprise") return "ENTERPRISE";
  if (plan === "premium") return "PREMIUM";
  if (plan === "standard") return "STANDARD";
  return plan.toUpperCase();
}

function normalizeOrderStatus(
  metadata: Record<string, unknown>,
  confirmed: boolean
): SubscriptionPurchaseRow["status"] {
  if (confirmed) return "paid";

  const rawStatus =
    metadata.status ??
    metadata.paymentStatus ??
    metadata.payment_status ??
    metadata.providerStatus ??
    metadata.provider_status ??
    metadata.yookassaStatus;
  const status = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";

  if (status === "canceled" || status === "cancelled" || status === "отменено") {
    return "canceled";
  }

  return "incomplete";
}

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const hasAiTokenBalanceColumn = await hasUserAiTokenBalanceColumn(prisma);

  const [contractStatus, subscriptionUser, subscriptionOrders] = await Promise.all([
    getUserContractStatus({
      prisma,
      userId: session.user.id
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: hasAiTokenBalanceColumn
        ? {
            isSubscribed: true,
            subscribeLevel: true,
            expiresAt: true,
            balance: true,
            aiTokenBalance: true
          }
        : {
            isSubscribed: true,
            subscribeLevel: true,
            expiresAt: true,
            balance: true
          }
    }),
    prisma.orders.findMany({
      where: {
        userId: session.user.id,
        type: "subscription"
      },
      select: {
        id: true,
        createdAt: true,
        confirmed: true,
        metadata: true
      },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);

  const purchases: SubscriptionPurchaseRow[] = subscriptionOrders.map((order) => {
    const metadata = readOrderMetadata(order.metadata);
    const tariffId = normalizeTariffId(metadata.tariffId);
    const billingPeriod = normalizeSubscriptionBillingPeriod(metadata.billingPeriod);
    const tariff =
      getSubscriptionTariffConfig(tariffId, billingPeriod) ??
      getSubscriptionTariffConfig("standard", billingPeriod);
    const purchasedAt = order.createdAt ?? null;
    const status = normalizeOrderStatus(metadata, order.confirmed);
    const explicitAmountRub = Number(metadata.amountRub);
    const amountRub =
      Number.isFinite(explicitAmountRub) && explicitAmountRub > 0
        ? explicitAmountRub
        : (tariff?.amountRub ?? 0);
    const endsAt =
      status === "paid" && purchasedAt
        ? calculateSubscriptionEndDate({
            billingPeriod,
            now: purchasedAt,
            currentEnd: null
          }).toISOString()
        : null;

    return {
      id: order.id,
      tariffLabel: tariff?.title ?? "STANDARD",
      amountRub,
      billingLabel: billingPeriod === "yearly" ? "Годовая оплата" : "Помесячная оплата",
      purchasedAt: purchasedAt?.toISOString() ?? null,
      endsAt,
      status
    };
  });

  const entitlements = getAiStudioEntitlements({
    isSubscribed: subscriptionUser?.isSubscribed ?? false,
    subscribeLevel: subscriptionUser?.subscribeLevel ?? null,
    expiresAt: subscriptionUser?.expiresAt ?? null
  });
  const aiTokenBalance = Number(
    subscriptionUser && hasAiTokenBalanceColumn && "aiTokenBalance" in subscriptionUser
      ? (subscriptionUser as { aiTokenBalance?: number }).aiTokenBalance ?? 0
      : 0
  );

  return (
    <DashboardShell>
      <PageHeader
        title="Персональные данные"
        description="Изменяйте имя, email и аватар. Обновления применяются во всех разделах кабинета."
      />
      <ProfileBalanceCards
        royaltyBalance={subscriptionUser?.balance ?? 0}
        aiTokenBalance={aiTokenBalance}
        monthlyBonusTokens={entitlements.monthlyBonusTokens}
      />
      <UserProfileForm contractStatus={contractStatus} />
      <SubscriptionPurchaseStats
        currentPlan={subscriptionUser?.isSubscribed ? normalizeUserPlan(subscriptionUser.subscribeLevel) : null}
        currentEndsAt={
          subscriptionUser?.isSubscribed ? subscriptionUser.expiresAt?.toISOString() ?? null : null
        }
        purchases={purchases}
      />
    </DashboardShell>
  );
}
