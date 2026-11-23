import { NextResponse } from "next/server";

import { normalizeReferralCode, REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from "@/lib/referral-shared";

export const dynamic = "force-dynamic";

// icecreammusic.net/r/<code>: remembers who invited for 90 days and opens sign-up.
export function GET(request: Request, { params }: { params: { code: string } }) {
  const code = normalizeReferralCode(params.code);
  const target = new URL(code ? `/register?ref=${code}` : "/register", request.url);
  const response = NextResponse.redirect(target, 307);
  if (code) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      maxAge: REFERRAL_COOKIE_DAYS * 24 * 60 * 60,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/"
    });
  }
  return response;
}
