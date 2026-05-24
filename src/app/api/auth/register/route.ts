import { NextResponse } from "next/server";
import { z } from "zod";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

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

  const user = await prisma.user.create({
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

  return NextResponse.json(
    {
      ok: true,
      user
    },
    { status: 201 }
  );
}
