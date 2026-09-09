import type { subscribe_level } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { hasAiStudioAccess } from "@/lib/ai-studio";
import { hasUserAiTokenBalanceColumn } from "@/lib/ai-token-balance-column";
import { getUserContractStatus } from "@/lib/contract-verification";
import { getUserBalanceTotals } from "@/lib/finance-service";
import { isAnyPrismaTableMissingError, isPrismaConnectionError } from "@/lib/prisma-errors";
import { prisma } from "@/lib/prisma";
import { resolveActiveSubscriptionPlan } from "@/lib/subscription-limits";
import { getAiTokenBalance } from "@/lib/ai-token-service";
import { normalizeArtistProfileType } from "@/lib/artist-profile-type";
import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import { findLegacyUserById, findLegacyUserByEmail, isMissingCanonicalUserTable } from "@/lib/legacy-user-store";
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

type CurrentUserProfileRow = {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
  balance: unknown;
  aiTokenBalance?: unknown;
  isSubscribed: boolean;
  subscribeLevel: subscribe_level | null;
  expiresAt: Date | null;
  artistProfileType?: unknown;
};

async function findCurrentUser(userId: string): Promise<CurrentUserProfileRow | null> {
  try {
    return (await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        balance: true,
        aiTokenBalance: true,
        isSubscribed: true,
        subscribeLevel: true,
        expiresAt: true,
        artistProfileType: true
      }
    })) as CurrentUserProfileRow | null;
  } catch (error) {
    if (isMissingCanonicalUserTable(error)) {
      const legacyUser = await findLegacyUserById(prisma, userId);
      return legacyUser
        ? {
            id: legacyUser.id,
            name: legacyUser.name,
            email: legacyUser.email,
            avatar: legacyUser.avatar,
            balance: 0,
            aiTokenBalance: legacyUser.aiTokenBalance,
            isSubscribed: false,
            subscribeLevel: null,
            expiresAt: null,
            artistProfileType: legacyUser.artistProfileType
          }
        : null;
    }
    if (!/artistProfileType|aiTokenBalance/iu.test(String(error))) throw error;

    const legacyUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        balance: true,
        isSubscribed: true,
        subscribeLevel: true,
        expiresAt: true
      }
    });
    return legacyUser as CurrentUserProfileRow | null;
  }
}

async function mapCurrentUserProfile(userId: string) {
  const hasAiTokenBalanceColumn = await hasUserAiTokenBalanceColumn(prisma);
  const [user, verification, balanceTotals] = await Promise.all([
    findCurrentUser(userId),
    getUserContractStatus({ prisma, userId }),
    getUserBalanceTotals(prisma, userId).catch((error) => {
      if (
        isAnyPrismaTableMissingError(error, [
          "FinanceReport",
          "PayoutRequest",
          "Transaction"
        ])
      ) {
        return null;
      }
      throw error;
    })
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
    avatarUrl: buildStoredFileRouteUrl(user.avatar),
    artistProfileType: normalizeArtistProfileType(user.artistProfileType),
    royaltyBalance: balanceTotals?.availableToWithdraw ?? Number(user.balance ?? 0),
    aiTokenBalance,
    hasActiveSubscription,
    currentPlan:
      resolveActiveSubscriptionPlan({
        isSubscribed: user.isSubscribed,
        subscribeLevel: user.subscribeLevel,
        expiresAt: user.expiresAt
      }) ?? "FREE",
    hasAiStudioAccess: hasAiStudioAccess({
      isSubscribed: user.isSubscribed,
      subscribeLevel: user.subscribeLevel,
      expiresAt: user.expiresAt
    }),
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
          email: {
            equals: email,
            mode: "insensitive"
          },
          id: { not: userId }
        },
        select: { id: true }
      }).catch(async (error) => {
        if (!isMissingCanonicalUserTable(error)) throw error;
        const legacyUser = await findLegacyUserByEmail(prisma, email);
        return legacyUser && legacyUser.id !== userId ? { id: legacyUser.id } : null;
      });
      if (duplicate) {
        return NextResponse.json({ error: "Этот email уже используется" }, { status: 409 });
      }
    }

    await prisma.user.updateMany({
      where: { id: userId },
      data: {
        name: parsed.data.name,
        ...(email ? { email } : {})
      }
    }).catch(async (error) => {
      if (!isMissingCanonicalUserTable(error)) throw error;
      await prisma.$executeRawUnsafe(
        `UPDATE "icecream"."User" SET "name" = $1, "email" = COALESCE($2, "email"), "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $3`,
        parsed.data.name,
        email ?? null,
        userId
      );
    });

    if (parsed.data.artistProfileType) {
      try {
        await prisma.user.updateMany({
          where: { id: userId },
          data: { artistProfileType: parsed.data.artistProfileType }
        });
      } catch (error) {
        if (isMissingCanonicalUserTable(error)) {
          await prisma.$executeRawUnsafe(
            `UPDATE "icecream"."User" SET "artistProfileType" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = $2`,
            parsed.data.artistProfileType === "producer" ? "artist" : parsed.data.artistProfileType,
            userId
          );
        } else if (!/artistProfileType|column .* does not exist/iu.test(String(error))) {
          throw error;
        }
      }
    }

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
