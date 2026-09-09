import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  artistProfileUpdateSchema,
  getUserArtistProfileSettings,
  saveUserArtistProfileSettings
} from "@/lib/artist-profile-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function requireUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function GET() {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getUserArtistProfileSettings(prisma, userId);
  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(profile);
}

export async function PATCH(request: Request) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await request.json().catch(() => null);
  const parsed = artistProfileUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Проверьте данные профиля" },
      { status: 400 }
    );
  }
  try {
    return NextResponse.json(await saveUserArtistProfileSettings(
      prisma,
      userId,
      parsed.data.artistKey,
      parsed.data.settings
    ));
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    if (error.message === "ARTIST_PROFILE_RELEASE_REQUIRED") {
      return NextResponse.json(
        { error: "Публичный профиль станет доступен после создания первого релиза" },
        { status: 409 }
      );
    }
    if (error.message === "ARTIST_PROFILE_OWN_RELEASES_ONLY") {
      return NextResponse.json(
        { error: "Профиль артиста может содержать только релизы этого исполнителя" },
        { status: 400 }
      );
    }
    if (error.message === "ARTIST_PROFILE_GROUP_LIMIT") {
      return NextResponse.json(
        { error: "В каталоге группы может быть не больше 10 разных артистов" },
        { status: 400 }
      );
    }
    if (error.message === "ARTIST_PROFILE_RELEASE_NOT_OWNED") {
      return NextResponse.json({ error: "Один из релизов не принадлежит вашему аккаунту" }, { status: 403 });
    }
    if (error.message === "ARTIST_PROFILE_INVALID_AVATAR") {
      return NextResponse.json({ error: "Аватар профиля нужно загрузить через личный кабинет" }, { status: 400 });
    }
    if (error.message === "ARTIST_PROFILE_INVALID_BACKGROUND") {
      return NextResponse.json({ error: "Фон профиля нужно загрузить через личный кабинет" }, { status: 400 });
    }
    throw error;
  }
}
