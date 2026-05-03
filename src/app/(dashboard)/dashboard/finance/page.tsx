import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { FinancePageClient } from "@/components/finance/finance-page-client";
import { authOptions } from "@/lib/auth";
import { getFinanceDashboardViewData } from "@/lib/finance-dashboard-server";

export default async function FinancePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const data = await getFinanceDashboardViewData(session.user.id);

  return (
    <FinancePageClient
      initialReports={data.reports}
      initialAgreedBalance={data.agreedBalance}
      initialPendingPayout={data.pendingPayout}
      initialAccruals={data.accruals}
      initialAccrualSeries={data.accrualSeries}
      minimumPayoutAmount={data.minimumPayoutAmount}
    />
  );
}
