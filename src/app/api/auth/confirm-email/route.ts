import { NextResponse } from "next/server";

import { confirmEmailToken, resolveAppBaseUrl } from "@/lib/account-security";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Opened from the confirmation email; the token alone proves the address, so no session is needed.
export async function GET(request: Request) {
  const baseUrl = resolveAppBaseUrl(request);
  const limited = enforceRateLimit({ key: `auth:confirm-email:${getRequestIp(request)}`, limit: 20, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const result = token ? await confirmEmailToken(token, baseUrl) : ({ ok: false, error: "invalid" } as const);
  const status = result.ok ? "confirmed" : result.error;
  return NextResponse.redirect(`${baseUrl}/dashboard/profile?email=${status}`);
}
