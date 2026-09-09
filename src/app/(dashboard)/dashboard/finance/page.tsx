import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { FinancePageClient } from "@/components/finance/finance-page-client";
import { authOptions } from "@/lib/auth";
import { getFinanceDashboardViewData } from "@/lib/finance-dashboard-server";

export default async function FinancePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  let data;
  try {
    data = await getFinanceDashboardViewData(session.user.id);
  } catch {
    return (
      <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-6 text-amber-100">
        <h1 className="text-lg font-semibold">Финансовые данные временно недоступны</h1>
        <p className="mt-2 text-sm text-amber-100/80">Баланс и история операций не показаны, чтобы не отображать неверные нулевые значения.</p>
        <a className="mt-4 inline-block rounded-lg border border-amber-200/40 px-3 py-2 text-sm font-medium" href="/dashboard/finance">Повторить</a>
      </section>
    );
  }

  return (
    <FinancePageClient
      initialReports={data.reports}
      initialTransactions={data.transactions}
      initialAgreedBalance={data.agreedBalance}
      initialPendingPayout={data.pendingPayout}
      initialAccruals={data.accruals}
      initialAccrualSeries={data.accrualSeries}
      minimumPayoutAmount={data.minimumPayoutAmount}
      payoutWindow={data.payoutWindow}
    />
  );
}
