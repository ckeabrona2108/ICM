import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { discoverReleaseLinks, getReleaseLinksOverview } from "@/lib/platform-link-discovery-service";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** "Найти мои релизы": searches every released release and returns the refreshed table. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = enforceRateLimit({ key: `platform-links-discover:${session.user.id}`, limit: 3, windowMs: 10 * 60_000 });
  if (limited) return limited;

  try {
    const results = await discoverReleaseLinks({ userId: session.user.id });
    const overview = await getReleaseLinksOverview(session.user.id);
    return NextResponse.json({
      ...overview,
      added: results.reduce((sum, result) => sum + result.added.length, 0)
    });
  } catch (error) {
    console.error("[platform-links] discover failed", error);
    return NextResponse.json({ error: "Не удалось выполнить поиск. Попробуйте позже." }, { status: 500 });
  }
}
