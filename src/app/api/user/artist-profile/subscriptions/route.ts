import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listFollowedArtistProfiles } from "@/lib/artist-social-service";
import { prisma } from "@/lib/prisma";
import { isPrismaConnectionError, isPrismaTableMissingError } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const subscriptions = await listFollowedArtistProfiles({ prisma, followerUserId: userId });
    return NextResponse.json({ subscriptions });
  } catch (error) {
    if (isPrismaTableMissingError(error, "artist_profile_followers")) {
      return NextResponse.json({ error: "Сервис подписок пока не настроен в базе данных" }, { status: 503 });
    }
    if (isPrismaConnectionError(error)) {
      return NextResponse.json({ error: "База данных временно недоступна" }, { status: 503 });
    }
    console.error("[artist-subscriptions] failed", error);
    return NextResponse.json({ error: "Не удалось загрузить подписки" }, { status: 500 });
  }
}
