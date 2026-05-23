import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserReleaseQuota } from "@/lib/release-quota";
import { getSubscriptionOverview } from "@/lib/subscription-limits";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [overview, releaseQuota] = await Promise.all([
    getSubscriptionOverview(prisma, session.user.id),
    getUserReleaseQuota(session.user.id, prisma)
  ]);

  return NextResponse.json(
    {
      releases_used: releaseQuota.used,
      releases_limit: releaseQuota.includedLimit,
      releases_remaining: releaseQuota.remaining,
      requires_payment_for_next_release: releaseQuota.requiresPaymentForNextRelease,
      ai_day_used: overview.usage.aiDayUsed,
      ai_day_limit: overview.limits.aiDayLimit,
      ai_month_used: overview.usage.aiMonthUsed,
      ai_month_limit: overview.limits.aiMonthLimit,
      plan: overview.plan
    },
    { status: 200 }
  );
}
