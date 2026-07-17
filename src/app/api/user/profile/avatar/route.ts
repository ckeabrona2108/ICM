import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { hasAiStudioAccess } from "@/lib/ai-studio";
import { hasUserAiTokenBalanceColumn } from "@/lib/ai-token-balance-column";
import { getUserContractStatus } from "@/lib/contract-verification";
import { isPrismaConnectionError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { uploadObjectToStorage } from "@/lib/s3";
import { resolveActiveSubscriptionPlan } from "@/lib/subscription-limits";
import { getAiTokenBalance } from "@/lib/ai-token-service";
import { updateUserAvatarSchema, validateAvatarDataUrl } from "@/lib/user-profile-policy";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const uuidV4LikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseAvatarDataUrl(dataUrl: string): { mimeType: string; body: Buffer; extension: string } {
  const match = /^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/u.exec(dataUrl.trim());
  if (!match) {
    throw new Error("Некорректный аватар");
  }

  const mimeType = match[1].toLowerCase();
  const extension =
    mimeType === "image/jpeg" || mimeType === "image/jpg"
      ? "jpg"
      : mimeType === "image/png"
        ? "png"
        : mimeType === "image/webp"
          ? "webp"
          : null;

  if (!extension) {
    throw new Error("Некорректный аватар");
  }

  return {
    mimeType,
    body: Buffer.from(match[2], "base64"),
    extension
  };
}

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
  const hasAiTokenBalanceColumn = await hasUserAiTokenBalanceColumn(prisma);
  const [user, verification] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: hasAiTokenBalanceColumn
        ? {
            id: true,
            name: true,
            email: true,
            avatar: true,
            balance: true,
            aiTokenBalance: true,
            isSubscribed: true,
            subscribeLevel: true,
            expiresAt: true
          }
        : {
            id: true,
            name: true,
            email: true,
            avatar: true,
            balance: true,
            isSubscribed: true,
            subscribeLevel: true,
            expiresAt: true
          }
    }),
    getUserContractStatus({ prisma, userId })
  ]);

  if (!user) return null;
  const aiTokenBalance = hasAiTokenBalanceColumn
    ? Number(("aiTokenBalance" in user ? user.aiTokenBalance : 0) ?? 0)
    : await getAiTokenBalance(prisma, userId);
  const hasActiveSubscription = Boolean(
    user.isSubscribed && (!user.expiresAt || user.expiresAt.getTime() > Date.now())
  );

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatar,
    royaltyBalance: user.balance,
    aiTokenBalance,
    currentPlan:
      resolveActiveSubscriptionPlan({
        isSubscribed: user.isSubscribed,
        subscribeLevel: user.subscribeLevel,
        expiresAt: user.expiresAt
      }) ?? "FREE",
    hasActiveSubscription,
    hasAiStudioAccess: hasAiStudioAccess({
      isSubscribed: user.isSubscribed,
      subscribeLevel: user.subscribeLevel,
      expiresAt: user.expiresAt
    }),
    verification
  };
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({
    key: `profile:avatar:${userId}`,
    limit: 10,
    windowMs: 60 * 60_000
  });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateUserAvatarSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректный аватар" }, { status: 400 });
  }

  const validation = validateAvatarDataUrl(parsed.data.imageDataUrl);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error ?? "Некорректный аватар" }, { status: 400 });
  }

  try {
    const avatarAsset = parseAvatarDataUrl(parsed.data.imageDataUrl);
    const storageKey = `avatars/${userId}.${avatarAsset.extension}`;
    let avatarValue: string;
    try {
      const uploaded = await uploadObjectToStorage({
        key: storageKey,
        body: avatarAsset.body,
        contentType: avatarAsset.mimeType
      });
      avatarValue = uploaded.key;
    } catch (storageError) {
      console.error("[avatar-upload] storage upload failed", {
        userId,
        message: storageError instanceof Error ? storageError.message : String(storageError)
      });
      return NextResponse.json(
        { error: "Хранилище изображений временно недоступно. Повторите загрузку позже." },
        { status: 503 }
      );
    }

    await prisma.user.updateMany({
      where: { id: userId },
      data: {
        avatar: avatarValue
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

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const userId = getSessionUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    await prisma.user.updateMany({
      where: { id: userId },
      data: {
        avatar: null
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
