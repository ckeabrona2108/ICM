import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestArtistCollaborationContact } from "@/lib/artist-social-service";
import { getPublicArtistProfile } from "@/lib/artist-profile-service";
import { parseArtistProfileUserId } from "@/lib/artist-profile-shared";
import {
  assertSocialInteractionAllowed,
  SocialInteractionBlockedError,
  type SocialSafetyPrisma
} from "@/lib/social-safety-policy";

export async function POST(_request: Request, context: { params: { slug: string } }) {
  const session = await getServerSession(authOptions);
  const requesterUserId = session?.user?.id;
  if (!requesterUserId) {
    return NextResponse.json({ error: "Войдите, чтобы связаться" }, { status: 401 });
  }

  const limited = enforceRateLimit({
    key: `artist-collaboration-contact:${requesterUserId}`,
    limit: 12,
    windowMs: 60 * 60_000
  });
  if (limited) return limited;

  try {
    const profile = await getPublicArtistProfile(
      prisma,
      context.params.slug,
      undefined,
      { includeReleaseAnalytics: false }
    );
    const profileUserId = profile ? parseArtistProfileUserId(profile.slug) : null;
    if (
      profile
      && profileUserId
      && profile.collaboration.open
      && profileUserId !== requesterUserId
    ) {
      await assertSocialInteractionAllowed(
        prisma as unknown as Pick<SocialSafetyPrisma, "social_user_blocks">,
        requesterUserId,
        profileUserId
      );
    }
    return NextResponse.json(await requestArtistCollaborationContact({
      prisma,
      slug: context.params.slug,
      requesterUserId
    }));
  } catch (error) {
    if (error instanceof SocialInteractionBlockedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof Error && error.message === "ARTIST_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ARTIST_COLLABORATION_DISABLED") {
      return NextResponse.json({ error: "Этот профиль сейчас не принимает запросы на сотрудничество" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ARTIST_COLLABORATION_SELF_CONTACT") {
      return NextResponse.json({ error: "Нельзя отправить запрос самому себе" }, { status: 409 });
    }
    console.error("[artist-collaboration-contact] failed", error);
    return NextResponse.json({ error: "Не удалось отправить запрос. Повторите позже" }, { status: 500 });
  }
}
