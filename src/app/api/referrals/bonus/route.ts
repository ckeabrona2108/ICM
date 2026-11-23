import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getReferralBonusBalance, settleReferralRewards } from "@/lib/referrals";
import { getUserReleaseQuota } from "@/lib/release-quota";

export const dynamic = "force-dynamic";

// For the release wizard: how many bonus releases are left and whether the subscription covers this one.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await settleReferralRewards(prisma, session.user.id).catch(() => undefined);
  const [balance, quota] = await Promise.all([
    getReferralBonusBalance(prisma, session.user.id).catch(() => 0),
    getUserReleaseQuota(session.user.id, prisma)
  ]);
  return NextResponse.json({ balance, subscriptionCovers: !quota.requiresPaymentForNextRelease });
}
