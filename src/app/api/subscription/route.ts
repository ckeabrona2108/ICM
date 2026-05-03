import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSubscriptionOverview } from "@/lib/subscription-limits";

function mapPlan(plan: "STANDARD" | "PRO" | "ENTERPRISE") {
  if (plan === "PRO") return "pro" as const;
  if (plan === "ENTERPRISE") return "enterprise" as const;
  return "standard" as const;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscription = await getSubscriptionOverview(prisma, session.user.id);
  return NextResponse.json(
    {
      has_active_subscription: subscription.hasActiveSubscription,
      current_plan: subscription.currentPlan ? mapPlan(subscription.currentPlan) : null,
      status: subscription.hasActiveSubscription ? "active" : "none",
      ends_at: subscription.endsAt,
      days_left: subscription.countdownDays,
      features: {
        releases_limit: subscription.limits.releasesLimit,
        ai_day_limit: subscription.limits.aiDayLimit,
        ai_month_limit: subscription.limits.aiMonthLimit,
        ai_enabled: subscription.limits.aiEnabled
      },
      subscription
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=30"
      }
    }
  );
}
