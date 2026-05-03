import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionOverview } from "@/lib/subscription-limits";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const overview = await getSubscriptionOverview(prisma, session.user.id);

  return NextResponse.json(
    {
      releases_used: overview.usage.releasesUsed,
      releases_limit: overview.limits.releasesLimit,
      ai_day_used: overview.usage.aiDayUsed,
      ai_day_limit: overview.limits.aiDayLimit,
      ai_month_used: overview.usage.aiMonthUsed,
      ai_month_limit: overview.limits.aiMonthLimit,
      plan: overview.plan
    },
    { status: 200 }
  );
}
