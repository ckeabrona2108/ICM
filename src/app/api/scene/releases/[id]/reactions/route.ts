import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";
import {
  getSceneReactionSummaries,
  hashSceneVisitorIp,
  normalizeSceneVisitorId,
  SCENE_VISITOR_COOKIE,
  toggleSceneReaction
} from "@/lib/scene-reaction-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reaction: z.enum(["playlist", "hit", "cover"])
});

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите, чтобы оставить реакцию" }, { status: 401 });
  const visitorId = userId;
  const ip = getRequestIp(request);
  const visitorLimited = enforceRateLimit({
    key: `scene:reaction:visitor:${visitorId}`,
    limit: 30,
    windowMs: 10 * 60_000
  });
  if (visitorLimited) return visitorLimited;
  const ipLimited = enforceRateLimit({
    key: `scene:reaction:ip:${hashSceneVisitorIp(ip) ?? ip}`,
    limit: 120,
    windowMs: 60 * 60_000
  });
  if (ipLimited) return ipLimited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !/^[0-9a-f-]{36}$/iu.test(context.params.id)) {
    return NextResponse.json({ error: "Некорректная реакция." }, { status: 400 });
  }

  try {
    const toggled = await toggleSceneReaction({
      prisma,
      releaseId: context.params.id,
      visitorId,
      reaction: parsed.data.reaction,
      ipHash: hashSceneVisitorIp(ip)
    });
    const summaries = await getSceneReactionSummaries({
      prisma,
      releaseIds: [context.params.id],
      visitorId
    });
    const response = NextResponse.json({
      ok: true,
      active: toggled.active,
      summary: summaries[context.params.id]
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "SCENE_RELEASE_NOT_FOUND") {
      return NextResponse.json({ error: "Релиз не найден на витрине." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "SCENE_PREVIEW_REQUIRED") {
      return NextResponse.json({ error: "Сначала послушайте доступный фрагмент." }, { status: 409 });
    }
    console.error("[scene-reactions] failed", error);
    return NextResponse.json({ error: "Не удалось сохранить реакцию." }, { status: 500 });
  }
}
