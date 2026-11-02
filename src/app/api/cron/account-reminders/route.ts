import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runAccountReminders } from "@/lib/account-lifecycle-notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "").trim() ?? "";
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Run by an external scheduler every 10-15 minutes, next to /api/cron/release-payments:
 * sends the delayed account reminders (no track after signing up, abandoned draft, release out,
 * next release after the free one) to the cabinet, e-mail, push and VK. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runAccountReminders({ prisma });
  return NextResponse.json({
    ok: true,
    skipped: result.skipped ?? null,
    remindersSent: result.sent.length,
    errors: result.errors
  });
}
