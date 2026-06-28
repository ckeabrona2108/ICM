import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaColumnMissingError } from "@/lib/prisma-errors";

export const dynamic = "force-dynamic";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  stageName: z.string().trim().max(120).optional(),
  email: z.string().email().transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
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

  const { email, password } = parsed.data;
  const profileName = (parsed.data.stageName || parsed.data.name).trim();

  const existing = await prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive"
      }
    },
    select: { id: true }
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
        password: passwordHash
      },
      select: {
        id: true,
        email: true,
        name: true
      }
    });
  } catch (error) {
    if (
      isAnyPrismaColumnMissingError(error, [
        "user.aiTokenBalance",
        "aiTokenBalance",
        "user.aiPendingTokenBalance",
        "aiPendingTokenBalance"
      ])
    ) {
      const rows = await prisma.$queryRaw<Array<{ id: string; email: string; name: string }>>(Prisma.sql`
        INSERT INTO "icecream"."user" ("email", "name", "password")
        VALUES (${email}, ${profileName}, ${passwordHash})
        RETURNING "id", "email", "name"
      `);

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
