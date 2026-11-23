import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";
import { REFERRAL_COOKIE, REFERRAL_DISCOUNT_PERCENT } from "@/lib/referral-shared";
import { findReferrerByCode } from "@/lib/referrals";

export const dynamic = "force-dynamic";

// For the sign-up page: who invited (artist name only) and the friend's discount.
export async function GET(request: Request) {
  const limited = enforceRateLimit({ key: `referrals:inviter:${getRequestIp(request)}`, limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const code = new URL(request.url).searchParams.get("ref") || cookies().get(REFERRAL_COOKIE)?.value || null;
  const referrer = code ? await findReferrerByCode(prisma, code).catch(() => null) : null;
  if (!referrer) return NextResponse.json({ inviter: null });
  return NextResponse.json({ inviter: { nickname: referrer.nickname, discountPercent: REFERRAL_DISCOUNT_PERCENT } });
}
