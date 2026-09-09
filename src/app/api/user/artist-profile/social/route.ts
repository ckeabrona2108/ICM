import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getUserArtistProfileSettings } from "@/lib/artist-profile-service";
import { getOwnedArtistSocialDashboard } from "@/lib/artist-social-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const artistKey = request.nextUrl.searchParams.get("artistKey")?.trim() ?? "";
  const payload = await getUserArtistProfileSettings(prisma, userId);
  const profile = payload?.profiles.find((item) => item.artistKey === artistKey);
  if (!profile) return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
  return NextResponse.json(await getOwnedArtistSocialDashboard({
    prisma,
    userId,
    artistKey,
    releaseIds: profile.settings.catalogReleaseIds
  }));
}
