import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import type {
  CurrentUserProfileResponse,
  UpdateCurrentUserProfileRequest
} from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";
import {
  updateUserProfileSchema
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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let user:
    | { id: string; name: string; email: string; avatarUrl: string | null }
    | null = null;

  try {
    user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true
      }
    });
  } catch (error) {
    if (isAvatarColumnMissingError(error)) {
      const fallback = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          id: true,
          name: true,
          email: true
        }
      });
      user = fallback ? { ...fallback, avatarUrl: null } : null;
    } else {
      throw error;
    }
  }

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(toProfileResponse(user), { status: 200 });
}

export async function PATCH(request: Request) {
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

  const parsed = updateUserProfileSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid request payload"
      },
      { status: 400 }
    );
  }

  const body: UpdateCurrentUserProfileRequest = parsed.data;

  try {
    const updatedBase = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        name: body.name.trim(),
        ...(body.email ? { email: body.email.toLowerCase().trim() } : {})
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    let avatarUrl: string | null = null;
    try {
      const withAvatar = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { avatarUrl: true }
      });
      avatarUrl = withAvatar?.avatarUrl ?? null;
    } catch (error) {
      if (!isAvatarColumnMissingError(error)) {
        throw error;
      }
    }

    const updated = { ...updatedBase, avatarUrl };
    return NextResponse.json(toProfileResponse(updated), { status: 200 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Пользователь с таким email уже существует." },
        { status: 409 }
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
      { error: "Не удалось обновить профиль." },
      { status: 500 }
    );
  }
}
