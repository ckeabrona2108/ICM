import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import type {
  CurrentUserProfileResponse,
  UpdateCurrentUserAvatarRequest
} from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";
import {
  updateUserAvatarSchema,
  validateAvatarDataUrl
} from "@/lib/user-profile-policy";

function isAvatarColumnMissingError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2022") return false;
  return String(error.message).toLowerCase().includes("avatarurl");
}

function toProfileResponse(data: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}): CurrentUserProfileResponse {
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    avatarUrl: data.avatarUrl
  };
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateUserAvatarSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const body: UpdateCurrentUserAvatarRequest = parsed.data;

  const avatarCheck = validateAvatarDataUrl(body.imageDataUrl);
  if (!avatarCheck.ok) {
    return NextResponse.json(
      { error: avatarCheck.error ?? "Некорректный аватар." },
      { status: 422 }
    );
  }

  try {
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        avatarUrl: body.imageDataUrl.trim()
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true
      }
    });

    return NextResponse.json(toProfileResponse(updated), { status: 200 });
  } catch (error) {
    if (isAvatarColumnMissingError(error)) {
      return NextResponse.json(
        { error: "В базе данных отсутствует поле avatarUrl. Выполните миграции Prisma и повторите попытку." },
        { status: 503 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Пользователь не найден." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Не удалось загрузить аватар." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        avatarUrl: null
      },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true
      }
    });

    return NextResponse.json(toProfileResponse(updated), { status: 200 });
  } catch (error) {
    if (isAvatarColumnMissingError(error)) {
      return NextResponse.json(
        { error: "В базе данных отсутствует поле avatarUrl. Выполните миграции Prisma и повторите попытку." },
        { status: 503 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Пользователь не найден." },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Не удалось удалить аватар." },
      { status: 500 }
    );
  }
}
