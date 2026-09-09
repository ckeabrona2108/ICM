import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { feedReactionSchema, toggleReleaseLike } from "@/lib/artist-social-service";
import { resolveFeedReactionErrorResponse } from "@/lib/feed-reaction-errors";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите, чтобы поставить реакцию" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/iu.test(context.params.id)) return NextResponse.json({ error: "Некорректный релиз" }, { status: 400 });
  const limited = enforceRateLimit({ key: `release-like:${userId}`, limit: 80, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const parsed = feedReactionSchema.safeParse(body?.reaction ?? "heart");
  if (!parsed.success) return NextResponse.json({ error: "Некорректная реакция" }, { status: 400 });
  try {
    return NextResponse.json(await toggleReleaseLike({ prisma, releaseId: context.params.id, visitorId: userId, ipHash: null, reaction: parsed.data }));
  } catch (error) {
    if (error instanceof SocialInteractionBlockedError) return NextResponse.json({ error: "SOCIAL_INTERACTION_BLOCKED" }, { status: 403 });
    if (error instanceof Error && error.message === "PUBLIC_RELEASE_NOT_FOUND") return NextResponse.json({ error: "Релиз не найден" }, { status: 404 });
    if (error instanceof Error && error.message === "FEED_REACTION_INVALID") return NextResponse.json({ error: "Некорректная реакция" }, { status: 400 });
    const feedReactionError = resolveFeedReactionErrorResponse(error);
    if (feedReactionError) return NextResponse.json({ error: feedReactionError.error }, { status: feedReactionError.status });
    throw error;
  }
}
