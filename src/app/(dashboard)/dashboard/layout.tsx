import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import * as React from "react";

import { authOptions } from "@/lib/auth";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";
import { DashboardPrefetch } from "@/components/layout/dashboard-prefetch";
import { DashboardVerificationStatusModal } from "@/components/verification/dashboard-verification-status-modal";
import { getUserContractStatus } from "@/lib/contract-verification";
import { hasUserAiTokenBalanceColumn } from "@/lib/ai-token-balance-column";
import { formatRubCurrency } from "@/lib/currency-format";
import { getUserBalanceTotals } from "@/lib/finance-service";
import { prisma } from "@/lib/prisma";
import { isPrismaConnectionError, isPrismaPoolTimeoutError, isPrismaTableMissingError } from "@/lib/prisma-errors";
import { getReleaseSidebarCountsForUser } from "@/lib/release-counts";
import { getSubscriptionOverview } from "@/lib/subscription-limits";
import { getAiTokenBalance } from "@/lib/ai-token-service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

function isDashboardDataUnavailable(error: unknown): boolean {
  return (
    isPrismaConnectionError(error) ||
    isPrismaPoolTimeoutError(error) ||
    isPrismaTableMissingError(error, "icecream.user") ||
    isPrismaTableMissingError(error, "user")
  );
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const hasAiTokenBalanceColumn = await hasUserAiTokenBalanceColumn(prisma);
  const unavailableContractStatus = {
    status: "unavailable" as const,
    signed: false,
    isVerified: false,
    canSubmitReleases: false,
    canCreateRelease: false,
    signedAt: null,
    contractVersion: null,
    reason: "Статус верификации временно недоступен.",
    rejectionReason: null,
    rejectionKind: null,
    verificationId: null
  };

  const [releaseCounts, userProfile, balanceTotals, subscriptionOverview, contractStatus] = await Promise.all([
    getReleaseSidebarCountsForUser({
      userId: session.user.id,
      prisma
    }).catch((error) => {
      if (isDashboardDataUnavailable(error)) {
        return {
          all: 0,
          draft: 0,
          moderation: 0,
          changes_required: 0
        };
      }
      throw error;
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: hasAiTokenBalanceColumn
        ? {
            name: true,
            email: true,
            aiTokenBalance: true
          }
        : {
            name: true,
            email: true
          }
    }).catch((error) => {
      if (isDashboardDataUnavailable(error)) {
        return {
          name: session.user.name ?? "Пользователь",
          email: session.user.email ?? null,
          aiTokenBalance: 0
        };
      }
      throw error;
    }),
    getUserBalanceTotals(prisma, session.user.id)
      .catch((error) => {
        if (isDashboardDataUnavailable(error)) {
          return {
            agreedReportsBalance: 0,
            settlementDelta: 0,
            agreedBalance: 0,
            pendingBalance: 0,
            pendingPayout: 0,
            availableToWithdraw: 0
          };
        }
        if (
          isPrismaTableMissingError(error, "FinanceReport") ||
          isPrismaTableMissingError(error, "PayoutRequest") ||
          isPrismaTableMissingError(error, "Transaction")
        ) {
          return {
            agreedReportsBalance: 0,
            settlementDelta: 0,
            agreedBalance: 0,
            pendingBalance: 0,
            pendingPayout: 0,
            availableToWithdraw: 0
          };
        }
        throw error;
      }),
    getSubscriptionOverview(prisma, session.user.id).catch((error) => {
      if (isDashboardDataUnavailable(error)) {
        return {
          plan: "STANDARD" as const,
          currentPlan: null,
          hasActiveSubscription: false,
          status: "none" as const,
          startedAt: null,
          endsAt: null,
          countdownDays: null,
          shouldNotifyExpiry: false,
          usage: {
            periodStart: null,
            periodEnd: null,
            releasesUsed: 0,
            aiDayUsed: 0,
            aiMonthUsed: 0,
            lastAiResetDay: null
          },
          limits: {
            releasesLimit: 0,
            aiDayLimit: 0,
            aiMonthLimit: 0,
            aiEnabled: false
          },
          pricing: {
            release: 350,
            text: 75,
            karaokeText: 75,
            videoShot: 75,
            videoClip: 100
          }
        };
      }
      throw error;
    }),
    getUserContractStatus({
      prisma,
      userId: session.user.id
    }).catch((error) => {
      if (isDashboardDataUnavailable(error)) {
        return unavailableContractStatus;
      }
      throw error;
    })
  ]);

  const sidebarCounts = {
    totalReleases: releaseCounts.all,
    draftsCount: releaseCounts.draft,
    moderationCount: releaseCounts.moderation,
    changesCount: releaseCounts.changes_required,
    aiEnabled: subscriptionOverview.limits.aiEnabled
  };

  const balanceLabel = formatRubCurrency(balanceTotals.availableToWithdraw);
  const planLabel = subscriptionOverview.currentPlan ?? undefined;
  const hasSubscription = subscriptionOverview.hasActiveSubscription;
  const userName = userProfile?.name ?? session.user.name ?? "Пользователь";
  const userEmail = userProfile?.email ?? session.user.email ?? undefined;
  const aiTokenBalance = userProfile
    ? hasAiTokenBalanceColumn && "aiTokenBalance" in userProfile
      ? Number((userProfile as { aiTokenBalance?: number }).aiTokenBalance ?? 0)
      : await getAiTokenBalance(prisma, session.user.id).catch((error) => {
          if (
            isDashboardDataUnavailable(error) ||
            isPrismaTableMissingError(error, "icecream.user") ||
            isPrismaTableMissingError(error, "user")
          ) {
            return 0;
          }
          throw error;
        })
    : 0;
  const aiTokenBalanceLabel = aiTokenBalance.toLocaleString("ru-RU");

  return (
    <div className="dashboard-ui relative min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_top_right,rgba(123,97,255,0.16),transparent_34%),linear-gradient(180deg,#101322_0%,#0c1020_44%,#0b0f1a_100%)] text-white [--dashboard-mobile-bottom-nav-height:72px] [--dashboard-mobile-header-height:calc(72px+env(safe-area-inset-top))] [--dashboard-mobile-header-offset:calc(104px+env(safe-area-inset-top))]">
      {/* ambient corner glow (top-right) */}
      <div className="pointer-events-none absolute right-0 top-[-160px] h-[520px] w-[520px] translate-x-1/3 rounded-full bg-[#7b61ff]/[0.12] blur-[96px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-[360px] w-[360px] translate-x-1/4 rounded-full bg-[#3b1d75]/22 blur-[84px]" />

      <div className="relative h-screen min-w-0 overflow-hidden">
        <DashboardSidebar counts={sidebarCounts} contractStatus={contractStatus} />
        <div className="h-screen min-w-0 lg:pl-[258px]">
          <div className="perf-scroll-shell h-screen min-w-0 overflow-y-auto overflow-x-clip px-4 pb-[calc(var(--dashboard-mobile-bottom-nav-height)+env(safe-area-inset-bottom)+24px)] pt-[var(--dashboard-mobile-header-offset)] sm:px-6 lg:px-8 lg:pb-0 lg:pt-0">
            <DashboardPrefetch />
            <DashboardVerificationStatusModal initialStatus={contractStatus} />
            <DashboardTopbar
              userName={userName}
              userEmail={userEmail}
              planLabel={planLabel}
              balanceLabel={balanceLabel}
              aiTokenBalanceLabel={aiTokenBalanceLabel}
              hasSubscription={hasSubscription}
              subscriptionEndsAt={subscriptionOverview.endsAt}
              contractStatus={contractStatus}
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
