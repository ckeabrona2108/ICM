import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { resolveArtistProfileReferenceBySlug } from "@/lib/artist-profile-service";
import { toggleArtistProfileFollow } from "@/lib/artist-social-service";
import { prisma } from "@/lib/prisma";
import { isPrismaConnectionError, isPrismaTableMissingError } from "@/lib/prisma-errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

export async function POST(_request: Request, context: { params: { slug: string } }) {
  try {
    const session = await getServerSession(authOptions);
    const followerUserId = session?.user?.id;
    if (!followerUserId) return NextResponse.json({ error: "Войдите, чтобы подписаться" }, { status: 401 });
    const limited = enforceRateLimit({ key: `artist-follow:${followerUserId}`, limit: 40, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await resolveArtistProfileReferenceBySlug(prisma, context.params.slug);
    if (!profile) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });

    return NextResponse.json(await toggleArtistProfileFollow({
      prisma,
      profileUserId: profile.profileUserId,
      artistKey: profile.artistKey,
      profileSlug: profile.slug,
      followerUserId
    }));
  } catch (error) {
    if (error instanceof SocialInteractionBlockedError) {
      return NextResponse.json({ error: "SOCIAL_INTERACTION_BLOCKED" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "ARTIST_PROFILE_SELF_FOLLOW") {
      return NextResponse.json({ error: "Нельзя подписаться на собственный профиль" }, { status: 409 });
    }
    if (isPrismaTableMissingError(error, "artist_profile_followers")) {
      return NextResponse.json(
        { error: "Подписки временно недоступны. Повторите позже" },
        { status: 503 }
      );
    }
    if (isPrismaConnectionError(error)) {
      return NextResponse.json(
        { error: "База данных временно недоступна" },
        { status: 503 }
      );
    }
    console.error("[artist-follow] failed", error);
    return NextResponse.json({ error: "Не удалось подписаться. Повторите позже" }, { status: 500 });
  }
}
