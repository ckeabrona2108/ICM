import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  blockSocialUser,
  SocialSafetySelfActionError,
  SocialSafetyTargetNotFoundError,
  type SocialSafetyPrisma,
  unblockSocialUser
} from "@/lib/social-safety-policy";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function POST(_request: Request, context: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  const actorUserId = session?.user?.id;
  if (!actorUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_PATTERN.test(context.params.userId)) return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  const limited = enforceRateLimit({ key: `social-block:${actorUserId}`, limit: 30, windowMs: 60 * 60_000 });
  if (limited) return limited;
  try {
    return NextResponse.json(await blockSocialUser(
      prisma as unknown as SocialSafetyPrisma,
      actorUserId,
      context.params.userId
    ));
  } catch (error) {
    if (error instanceof SocialSafetyTargetNotFoundError) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (error instanceof SocialSafetySelfActionError) {
      return NextResponse.json({ error: "You cannot block yourself" }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, context: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  const actorUserId = session?.user?.id;
  if (!actorUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!UUID_PATTERN.test(context.params.userId)) return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  return NextResponse.json(await unblockSocialUser(
    prisma as unknown as SocialSafetyPrisma,
    actorUserId,
    context.params.userId
  ));
}
