import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { ReferralPageClient } from "@/components/referrals/referral-page-client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REFERRAL_DISCOUNT_PERCENT } from "@/lib/referral-shared";
import { getReferralOverview, readReferralContractState } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login?callbackUrl=%2Fdashboard%2Freferrals");

  const contractState = await readReferralContractState(prisma, session.user.id).catch(() => "none" as const);
  const overview = await getReferralOverview(prisma, session.user.id, { canInvite: contractState === "approved" }).catch((error) => {
    console.error("[referrals] overview failed", error);
    return null;
  });

  return (
    <div className="space-y-5 pb-10">
      <PageHeader
        title="Пригласить друга"
        description={`Друг получает скидку ${REFERRAL_DISCOUNT_PERCENT}% на первую оплату. Ты — бесплатный релиз за каждого друга, который оплатит релиз или подписку.`}
      />
      {overview ? (
        <ReferralPageClient overview={overview} contractState={contractState} />
      ) : (
        <p className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-[14px] text-amber-100">
          Приглашения временно недоступны. Обновите страницу чуть позже.
        </p>
      )}
    </div>
  );
}
