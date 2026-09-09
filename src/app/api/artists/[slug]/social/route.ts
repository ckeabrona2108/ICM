import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { getPublicArtistProfile } from "@/lib/artist-profile-service";
import { parseArtistProfileUserId } from "@/lib/artist-profile-shared";
import { getArtistSocialSnapshot } from "@/lib/artist-social-service";
import {
  resolveCommunityCoverUrl,
  resolveCommunityTrackAudio
} from "@/lib/dashboard-community-service";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { prisma } from "@/lib/prisma";
import { normalizeSceneVisitorId, SCENE_VISITOR_COOKIE } from "@/lib/scene-reaction-service";
import { SocialInteractionBlockedError } from "@/lib/social-safety-policy";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: { slug: string } }) {
  const profile = await getPublicArtistProfile(prisma, context.params.slug, undefined, {
    includeReleaseAnalytics: false,
    resolveCoverUrl: async (source) => resolveCommunityCoverUrl(source),
    resolvePreviewAudioUrl: async (state) =>
      state.enabled && state.previewAsset ? buildStoredFileRouteUrl(state.previewAsset.storageKey) : null,
    resolveTrackAudio: resolveCommunityTrackAudio
  });
  const profileUserId = parseArtistProfileUserId(context.params.slug);
  if (!profile || !profileUserId) {
    return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  }
  const visitorId = normalizeSceneVisitorId(request.cookies.get(SCENE_VISITOR_COOKIE)?.value);
  const session = await getServerSession(authOptions);
  let snapshot;
  try {
    snapshot = await getArtistSocialSnapshot({
      prisma,
      profileUserId,
      artistKey: profile.artistKey,
      releaseIds: profile.releases.map((release) => release.id),
      visitorId,
      viewerUserId: session?.user?.id ?? null
    });
  } catch (error) {
    if (error instanceof SocialInteractionBlockedError) {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }
    console.error("[artist-social] Public snapshot is unavailable", error);
    snapshot = {
      posts: [],
      releases: Object.fromEntries(profile.releases.map((release) => [release.id, {
        likes: 0,
        liked: false,
        comments: []
      }])),
      stats: {
        followers: 0,
        likes: 0,
        following: false,
        authenticated: Boolean(session?.user?.id),
        ownProfile: session?.user?.id === profileUserId
      },
      socialUnavailable: true
    };
  }
  const response = NextResponse.json(snapshot);
  response.cookies.set(SCENE_VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60
  });
  return response;
}
