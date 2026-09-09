import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  getSceneReactionSummaries,
  normalizeSceneVisitorId,
  SCENE_VISITOR_COOKIE
} from "@/lib/scene-reaction-service";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const visitorId = normalizeSceneVisitorId(request.cookies.get(SCENE_VISITOR_COOKIE)?.value);
  const limited = enforceRateLimit({
    key: `scene:summary:${visitorId}:${getRequestIp(request)}`,
    limit: 120,
    windowMs: 10 * 60_000
  });
  if (limited) return limited;

  const releaseIds = (request.nextUrl.searchParams.get("releaseIds") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f-]{36}$/iu.test(value))
    .slice(0, 48);

  const summaries = await getSceneReactionSummaries({ prisma, releaseIds, visitorId });
  const response = NextResponse.json({ summaries }, { status: 200 });
  response.cookies.set(SCENE_VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60
  });
  return response;
}
