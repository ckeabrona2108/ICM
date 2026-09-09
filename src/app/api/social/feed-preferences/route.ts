import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  removeSocialFeedPreference,
  setSocialFeedPreference,
  SocialFeedPreferenceSelfActionError,
  SocialFeedPreferenceTargetNotFoundError,
  socialFeedPreferenceInputSchema,
  type SocialFeedPreferencePrisma
} from "@/lib/social-feed-preference-service";

async function parseRequest(request: Request) {
  return socialFeedPreferenceInputSchema.safeParse(await request.json().catch(() => null));
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const viewerUserId = session?.user?.id;
  if (!viewerUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({ key: `social-feed-preference:${viewerUserId}`, limit: 60, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const parsed = await parseRequest(request);
  if (!parsed.success) return NextResponse.json({ error: "Invalid preference" }, { status: 400 });
  try {
    return NextResponse.json(await setSocialFeedPreference(
      prisma as unknown as SocialFeedPreferencePrisma,
      viewerUserId,
      parsed.data
    ));
  } catch (error) {
    if (error instanceof SocialFeedPreferenceTargetNotFoundError) {
      return NextResponse.json({ error: "Target not found" }, { status: 404 });
    }
    if (error instanceof SocialFeedPreferenceSelfActionError) {
      return NextResponse.json({ error: "You cannot mute yourself" }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  const viewerUserId = session?.user?.id;
  if (!viewerUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = await parseRequest(request);
  if (!parsed.success) return NextResponse.json({ error: "Invalid preference" }, { status: 400 });
  return NextResponse.json(await removeSocialFeedPreference(
    prisma as unknown as SocialFeedPreferencePrisma,
    viewerUserId,
    parsed.data
  ));
}
