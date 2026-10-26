import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { runReleasePaymentFollowup } from "@/lib/release-payment-followup";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "").trim() ?? "";
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Run by an external scheduler every 10-15 minutes:
 * confirms release payments YooKassa already charged and sends 1h / 24h / 3d payment reminders. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runReleasePaymentFollowup({ prisma });
  return NextResponse.json({
    ok: true,
    reconciledOrders: result.reconciledOrders.length,
    remindersSent: result.remindersSent.length,
    errors: result.errors
  });
}
