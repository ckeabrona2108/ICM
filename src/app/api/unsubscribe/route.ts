import { NextResponse } from "next/server";

import { findUnsubscribeUser, optOutOfCampaignLetters } from "@/lib/marketing-optout";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// One-click unsubscribe: mail apps POST here from their own "Unsubscribe" button (RFC 8058), and the
// page button posts here too. A GET (someone opened the address) goes to the page with the button,
// so link scanners that open every URL in a letter do not unsubscribe anyone.
export async function POST(request: Request) {
  const limited = enforceRateLimit({ key: `unsubscribe:${getRequestIp(request)}`, limit: 30, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const url = new URL(request.url);
  try {
    const userId = await findUnsubscribeUser(prisma, url.searchParams.get("t"));
    if (!userId) return NextResponse.json({ error: "Ссылка недействительна." }, { status: 400 });
    await optOutOfCampaignLetters(prisma, userId);
  } catch (error) {
    console.error("[unsubscribe] failed", error);
    return NextResponse.json({ error: "Не получилось отписаться. Попробуйте позже." }, { status: 500 });
  }

  const wantsPage = request.headers.get("accept")?.includes("text/html");
  if (wantsPage) {
    const back = new URL("/unsubscribe", url);
    back.searchParams.set("done", "1");
    return NextResponse.redirect(back, 303);
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const page = new URL("/unsubscribe", url);
  page.search = url.search;
  return NextResponse.redirect(page, 302);
}
