import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { AnalyticsAIService } from "@/lib/analytics-ai-service";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        release_id?: string;
        releaseId?: string;
        artist_id?: string;
        artistId?: string;
        period_days?: number;
        periodDays?: number;
        platform?: string;
        question?: string;
        user_id?: string;
        userId?: string;
      }
    | null;

  const targetUserId = String(payload?.user_id ?? payload?.userId ?? "").trim() || undefined;
  if (targetUserId && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const releaseId = String(payload?.release_id ?? payload?.releaseId ?? "").trim() || undefined;
  const artistId = String(payload?.artist_id ?? payload?.artistId ?? "").trim() || undefined;

  const periodDaysRaw = Number(payload?.period_days ?? payload?.periodDays ?? 30);
  const periodDays = Number.isFinite(periodDaysRaw) ? periodDaysRaw : 30;
  const platform = String(payload?.platform ?? "").trim() || undefined;

  const questionRaw = payload?.question;
  const question = typeof questionRaw === "string" ? questionRaw : undefined;

  const analyticsAIService = new AnalyticsAIService(prisma);

  try {
    const result = await analyticsAIService.requestAnalysis({
      userId: session.user.id,
      role: session.user.role,
      targetUserId,
      releaseId,
      artistId,
      platform,
      periodDays,
      question
    });

    if (result.status === "rate_limited") {
      return NextResponse.json(
        {
          status: result.status,
          insight: result.insight,
          retry_after_seconds: result.retryAfterSeconds
        },
        {
          status: 429,
          headers: result.retryAfterSeconds
            ? {
                "Retry-After": String(result.retryAfterSeconds)
              }
            : undefined
        }
      );
    }

    return NextResponse.json(
      {
        status: result.status,
        insight: result.insight
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run AI analysis";
    if (
      message.includes("Для использования AI необходимо оформить подписку") ||
      message.includes("AI недоступен на текущем тарифе") ||
      message.includes("AI доступен только на тарифе PRO и выше") ||
      message.includes("Требуется подписка")
    ) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (
      message.includes("Лимит AI исчерпан") ||
      message.includes("достигли лимита AI")
    ) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    if (message.includes("not found for this user")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (message.includes("AI insights storage is unavailable")) {
      return NextResponse.json(
        {
          error:
            "AI DEMO временно недоступен: не применены миграции аналитики."
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
