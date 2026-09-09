import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/password";
import { createLegacyUser, findLegacyUserByEmail, isMissingCanonicalUserTable } from "@/lib/legacy-user-store";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaColumnMissingError } from "@/lib/prisma-errors";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";
import { ARTIST_PROFILE_TYPES } from "@/lib/artist-profile-type";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  stageName: z.string().trim().max(120).optional(),
  artistProfileType: z.enum(ARTIST_PROFILE_TYPES).default("artist"),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  const limited = enforceRateLimit({
    key: `auth:register:${getRequestIp(request)}`,
    limit: 5,
    windowMs: 60 * 60_000
  });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте заполнение полей" }, { status: 400 });
  }

  const { email, password, artistProfileType } = parsed.data;
  const profileName = (parsed.data.stageName || parsed.data.name).trim();

  const existing = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive"
      }
    },
    select: { id: true }
  }).catch(async (error) => {
    if (!isMissingCanonicalUserTable(error)) throw error;
    const legacyUser = await findLegacyUserByEmail(prisma, email);
    return legacyUser ? { id: legacyUser.id } : null;
  });
  if (existing) {
    return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  let user: { id: string; email: string; name: string };
  try {
    user = await prisma.user.create({
      data: {
        email,
        name: profileName,
        password: passwordHash,
        artistProfileType
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });
  } catch (error) {
    if (isMissingCanonicalUserTable(error)) {
      try {
        const legacyUser = await createLegacyUser(prisma, {
          email,
          name: profileName,
          passwordHash,
          artistProfileType
        });
        user = {
          id: legacyUser.id,
          email: legacyUser.email,
          name: legacyUser.name
        };
      } catch (legacyError) {
        if (
          legacyError instanceof Prisma.PrismaClientKnownRequestError &&
          legacyError.code === "P2002"
        ) {
          return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
        }
        throw legacyError;
      }
    } else if (
      isAnyPrismaColumnMissingError(error, [
        "user.artistProfileType",
        "artistProfileType",
        "user.aiTokenBalance",
        "aiTokenBalance",
        "user.aiPendingTokenBalance",
        "aiPendingTokenBalance"
      ])
    ) {
      let rows: Array<{ id: string; email: string; name: string }>;
      try {
        rows = await prisma.$queryRaw<Array<{ id: string; email: string; name: string }>>(Prisma.sql`
          INSERT INTO "icecream"."user" ("email", "name", "password", "artistProfileType")
          VALUES (${email}, ${profileName}, ${passwordHash}, ${artistProfileType})
          RETURNING "id", "email", "name"
        `);
      } catch (artistProfileTypeError) {
        if (
          !isAnyPrismaColumnMissingError(artistProfileTypeError, [
            "user.artistProfileType",
            "artistProfileType"
          ])
        ) {
          throw artistProfileTypeError;
        }
        rows = await prisma.$queryRaw<Array<{ id: string; email: string; name: string }>>(Prisma.sql`
          INSERT INTO "icecream"."user" ("email", "name", "password")
          VALUES (${email}, ${profileName}, ${passwordHash})
          RETURNING "id", "email", "name"
        `);
      }

      const createdUser = rows[0];
      if (!createdUser) {
        return NextResponse.json({ error: "Не удалось создать аккаунт" }, { status: 500 });
      }
      user = createdUser;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
    } else {
      console.error("[auth/register] create failed", error);
      return NextResponse.json({ error: "Не удалось создать аккаунт" }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      user
    },
    { status: 201 }
  );
}
