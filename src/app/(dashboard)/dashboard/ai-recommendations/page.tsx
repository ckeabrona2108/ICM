import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";

import { AnalyticsAiInsights } from "@/components/analytics/analytics-ai-insights";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { PageHeader } from "@/components/layout/page-header";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionOverview } from "@/lib/subscription-limits";

export default async function AiRecommendationsPage() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/login");
  }

  const subscriptionOverview = await getSubscriptionOverview(prisma, session.user.id);

  const filters = {
    releaseId: "",
    country: "",
    upc: "",
    platform: "",
    days: 30
  } as const;

  return (
    <DashboardShell>
      <PageHeader
        title="AI Monitoring"
        description="Демо-раздел персональных AI-подсказок по вашей статистике."
      />

      {!subscriptionOverview.limits.aiEnabled ? (
        <section className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-5">
          <p className="text-[16px] font-semibold text-amber-100">
            Для доступа к AI Monitoring необходимо обновить подписку.
          </p>
          <p className="mt-2 text-[13px] text-amber-100/85">
            AI доступен на тарифах PRO и ENTERPRISE.
          </p>
          <Link
            href="/dashboard/subscription"
            className="mt-4 inline-flex rounded-lg border border-amber-300/35 bg-amber-400/15 px-3 py-2 text-[13px] font-semibold text-amber-100 transition hover:bg-amber-400/25"
          >
            Обновить подписку
          </Link>
        </section>
      ) : (
        <AnalyticsAiInsights filters={filters} />
      )}
    </DashboardShell>
  );
}
