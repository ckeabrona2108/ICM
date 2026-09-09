import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { artistPostSchema, createArtistProfilePost } from "@/lib/artist-social-service";
import { PERSONAL_ARTIST_PROFILE_KEY } from "@/lib/artist-profile-shared";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  const limited = enforceRateLimit({ key: `artist-post:${userId}`, limit: 12, windowMs: 60 * 60_000 });
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  const parsed = artistPostSchema.safeParse({
    ...(body && typeof body === "object" ? body : {}),
    artistKey: PERSONAL_ARTIST_PROFILE_KEY
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Проверьте публикацию" }, { status: 400 });
  }
  try {
    return NextResponse.json(await createArtistProfilePost({
      prisma,
      userId,
      ...parsed.data,
      artistKey: PERSONAL_ARTIST_PROFILE_KEY,
      idempotencyKey: request.headers.get("Idempotency-Key")
    }), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "ARTIST_PROFILE_NOT_FOUND") {
      return NextResponse.json({ error: "Профиль не найден" }, { status: 404 });
    }
    if (error instanceof Error && error.message === "ARTIST_PROFILE_DISABLED") {
      return NextResponse.json({ error: "Сначала включите публичный профиль" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ARTIST_COLLABORATION_DISABLED") {
      return NextResponse.json({ error: "Сначала включите статус сотрудничества в настройках профиля" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ARTIST_SOCIAL_INVALID_MEDIA") {
      return NextResponse.json({ error: "Вложение не принадлежит вашему аккаунту" }, { status: 403 });
    }
    if (error instanceof Error && error.message === "ARTIST_POST_INVALID_RELEASE") {
      return NextResponse.json({ error: "Релиз не найден в каталоге выбранного профиля" }, { status: 400 });
    }
    if (error instanceof Error && error.message === "SOCIAL_IDEMPOTENCY_KEY_INVALID") {
      return NextResponse.json({ error: "Некорректный Idempotency-Key" }, { status: 400 });
    }
    throw error;
  }
}
