import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import * as React from "react";

import { authOptions } from "@/lib/auth";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";
import { DashboardPrefetch } from "@/components/layout/dashboard-prefetch";
import { DashboardVerificationStatusModal } from "@/components/verification/dashboard-verification-status-modal";
import { getUserContractStatus } from "@/lib/contract-verification";
import { formatRubCurrency } from "@/lib/currency-format";
import { getUserBalanceTotals } from "@/lib/finance-service";
import { prisma } from "@/lib/prisma";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import { getReleaseSidebarCountsForUser } from "@/lib/release-counts";
import { getSubscriptionOverview } from "@/lib/subscription-limits";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const [releaseCounts, userProfile, balanceTotals, subscriptionOverview, contractStatus] = await Promise.all([
    getReleaseSidebarCountsForUser({
      userId: session.user.id,
      prisma
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true
      }
    }),
    getUserBalanceTotals(prisma, session.user.id)
      .catch((error) => {
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
    getSubscriptionOverview(prisma, session.user.id),
    getUserContractStatus({
      prisma,
      userId: session.user.id
    })
  ]);

  const sidebarCounts = {
    totalReleases: releaseCounts.all,
    draftsCount: releaseCounts.draft,
    moderationCount: releaseCounts.moderation,
    changesCount: releaseCounts.changes_required,
    aiEnabled: subscriptionOverview.limits.aiEnabled
  };

  const balanceLabel = formatRubCurrency(balanceTotals.agreedBalance);
  const planLabel = subscriptionOverview.currentPlan ?? undefined;
  const hasSubscription = subscriptionOverview.hasActiveSubscription;
  const userName = userProfile?.name ?? session.user.name ?? "Пользователь";
  const userEmail = userProfile?.email ?? session.user.email ?? undefined;

  return (
    <div className="dashboard-ui relative min-h-screen overflow-x-clip bg-[#0a0b0f] text-white">
      {/* ambient corner glow (top-right) */}
      <div className="pointer-events-none absolute right-0 top-[-160px] h-[520px] w-[520px] translate-x-1/3 rounded-full bg-[#7b3df5]/[0.18] blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-40 h-[360px] w-[360px] translate-x-1/4 rounded-full bg-[#3b1d75]/30 blur-[120px]" />

      <div className="relative h-screen min-w-0 overflow-hidden">
        <DashboardSidebar counts={sidebarCounts} contractStatus={contractStatus} />
        <div className="h-screen min-w-0 lg:pl-[258px]">
          <div className="h-screen min-w-0 overflow-y-auto overflow-x-clip px-4 sm:px-6 lg:px-8">
            <DashboardPrefetch />
            <DashboardVerificationStatusModal initialStatus={contractStatus} />
            <DashboardTopbar
              userName={userName}
              userEmail={userEmail}
              planLabel={planLabel}
              balanceLabel={balanceLabel}
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
