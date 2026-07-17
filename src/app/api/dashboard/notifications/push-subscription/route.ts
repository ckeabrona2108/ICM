import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  keys: z.object({
    p256dh: z.string().min(1).max(2048),
    auth: z.string().min(1).max(2048)
  })
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const count = await prisma.push_subscriptions.count({
    where: { user_id: session.user.id }
  });

  return NextResponse.json({
    enabled: count > 0,
    publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректная push-подписка." }, { status: 400 });
  }

  await prisma.push_subscriptions.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: {
      user_id: session.user.id,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth
    },
    update: {
      user_id: session.user.id,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth
    }
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = z.object({ endpoint: z.string().url().max(4096) }).safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректная push-подписка." }, { status: 400 });
  }

  await prisma.push_subscriptions.deleteMany({
    where: { user_id: session.user.id, endpoint: parsed.data.endpoint }
  });
  return NextResponse.json({ ok: true });
}
