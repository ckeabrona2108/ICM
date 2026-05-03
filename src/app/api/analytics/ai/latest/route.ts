import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { AnalyticsAIService } from "@/lib/analytics-ai-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);

  const targetUserId = (url.searchParams.get("user_id") ?? "").trim() || undefined;
  if (targetUserId && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = (url.searchParams.get("release_id") ?? "").trim() || undefined;
  const artistId = (url.searchParams.get("artist_id") ?? "").trim() || undefined;
  const platform = (url.searchParams.get("platform") ?? "").trim() || undefined;
  const question = (url.searchParams.get("question") ?? "").trim() || undefined;

  const periodDaysRaw = Number(url.searchParams.get("period_days") ?? "30");
  const periodDays = Number.isFinite(periodDaysRaw) ? periodDaysRaw : 30;

  const analyticsAIService = new AnalyticsAIService(prisma);

  try {
    const insight = await analyticsAIService.getLatestInsight({
      userId: targetUserId ?? session.user.id,
      releaseId,
      artistId,
      platform,
      periodDays,
      question
    });

    return NextResponse.json({ insight }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load AI insight";
    if (message.includes("not found for this user")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (message.includes("AI insights storage is unavailable")) {
      return NextResponse.json({ insight: null }, { status: 200 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
