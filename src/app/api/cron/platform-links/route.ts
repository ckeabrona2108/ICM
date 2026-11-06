import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { runDailyPlatformLinkJob } from "@/lib/platform-link-discovery-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/iu, "").trim() ?? "";
  const expected = Buffer.from(secret);
  const actual = Buffer.from(provided);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Run by an external scheduler once a day: finds links of new releases and checks saved links still open. */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDailyPlatformLinkJob();
  return NextResponse.json({ ok: true, ...result });
}
