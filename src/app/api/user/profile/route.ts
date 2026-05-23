import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getUserContractStatus } from "@/lib/contract-verification";
import { isPrismaConnectionError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { updateUserProfileSchema } from "@/lib/user-profile-policy";

export const dynamic = "force-dynamic";

const uuidV4LikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getSessionUserId(session: Awaited<ReturnType<typeof getServerSession>>): string | null {
  const user =
    session && typeof session === "object" && "user" in session ? session.user : null;
  const userId =
    user && typeof user === "object" && "id" in user && typeof user.id === "string"
      ? user.id.trim()
      : "";
  if (!userId) return null;
  return uuidV4LikePattern.test(userId) ? userId : null;
}

async function mapCurrentUserProfile(userId: string) {
  const [user, verification] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true
      }
    }),
    getUserContractStatus({ prisma, userId })
  ]);

  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar,
    verification
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const profile = await mapCurrentUserProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateUserProfileSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400 }
    );
  }

  try {
    const email = parsed.data.email?.trim().toLowerCase();
    if (email) {
      const duplicate = await prisma.user.findFirst({
        where: {
          email,
          id: { not: userId }
        },
        select: { id: true }
      });
      if (duplicate) {
        return NextResponse.json({ error: "Этот email уже используется" }, { status: 409 });
      }
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        name: parsed.data.name,
        ...(email ? { email } : {})
      }
    });

    const profile = await mapCurrentUserProfile(userId);
    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(profile, { status: 200 });
  } catch (error) {
    if (isPrismaConnectionError(error)) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    throw error;
  }
}
