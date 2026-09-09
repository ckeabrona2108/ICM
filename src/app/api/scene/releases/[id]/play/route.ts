import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";
import { recordSceneReleasePlay } from "@/lib/scene-play-service";
import {
  hashSceneVisitorIp,
  normalizeSceneVisitorId,
  SCENE_VISITOR_COOKIE
} from "@/lib/scene-reaction-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) {
    return NextResponse.json({ error: "Некорректный релиз." }, { status: 400 });
  }
  const session = await getServerSession(authOptions);
  const anonymousVisitorId = normalizeSceneVisitorId(request.cookies.get(SCENE_VISITOR_COOKIE)?.value);
  const visitorId = session?.user?.id ?? anonymousVisitorId;
  const ip = getRequestIp(request);
  const limited = enforceRateLimit({
    key: `scene:play:${visitorId}`,
    limit: 120,
    windowMs: 60 * 60_000
  });
  if (limited) return limited;

  try {
    const result = await recordSceneReleasePlay({
      prisma,
      releaseId: context.params.id,
      visitorId,
      ipHash: hashSceneVisitorIp(ip)
    });
    const response = NextResponse.json({ ok: true, ...result });
    if (!session?.user?.id) {
      response.cookies.set(SCENE_VISITOR_COOKIE, anonymousVisitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 365 * 24 * 60 * 60
      });
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "SCENE_RELEASE_NOT_FOUND") {
      return NextResponse.json({ error: "Релиз не найден." }, { status: 404 });
    }
    if (error instanceof Error && error.message === "SCENE_PREVIEW_REQUIRED") {
      return NextResponse.json({ error: "Фрагмент релиза недоступен." }, { status: 409 });
    }
    console.error("[scene-play] failed", error);
    return NextResponse.json({ error: "Не удалось учесть прослушивание." }, { status: 500 });
  }
}
