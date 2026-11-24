import { NextResponse } from "next/server";

import { normalizeReferralCode, REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from "@/lib/referral-shared";

export const dynamic = "force-dynamic";

// The public address of the site. Inside the container request.url carries the container's own
// host (e.g. https://5f98722dd874:3000), so a redirect built from it leads nowhere.
function publicBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

// icecreammusic.net/r/<code>: remembers who invited for 90 days and opens sign-up.
export function GET(request: Request, { params }: { params: { code: string } }) {
  const code = normalizeReferralCode(params.code);
  const target = `${publicBaseUrl(request)}${code ? `/register?ref=${code}` : "/register"}`;
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
