import { NextResponse } from "next/server";

import { confirmEmailToken, resolveAppBaseUrl } from "@/lib/account-security";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";
import { holdNewCodeChannel, notifySecurityEvent } from "@/lib/security-codes";

export const dynamic = "force-dynamic";

// Opened from the confirmation email; the token alone proves the address, so no session is needed.
export async function GET(request: Request) {
  const baseUrl = resolveAppBaseUrl(request);
  const limited = enforceRateLimit({ key: `auth:confirm-email:${getRequestIp(request)}`, limit: 20, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const result = token ? await confirmEmailToken(token, baseUrl) : ({ ok: false, error: "invalid" } as const);
  if (result.ok && result.changed) {
    // A change made without a code (the cabinet had no channel) keeps its hold; the 48 hours
    // count from the moment the new address starts working, not from the request.
    const hold = await prisma.security_channel_holds
      .findUnique({ where: { user_id_channel: { user_id: result.userId, channel: "email" } }, select: { trusted_from: true } })
      .catch(() => null);
    if (hold && hold.trusted_from.getTime() > Date.now()) await holdNewCodeChannel(prisma, result.userId, "email");
    await notifySecurityEvent(prisma, {
      userId: result.userId,
      eventId: `email-changed-${Date.now()}`,
      title: "Почта кабинета изменена",
      message: `Новая почта для входа и кодов: ${result.email}.`,
      skip: ["email"]
    });
  }
  const status = result.ok ? "confirmed" : result.error;
  return NextResponse.redirect(`${baseUrl}/dashboard/profile?email=${status}`);
}
