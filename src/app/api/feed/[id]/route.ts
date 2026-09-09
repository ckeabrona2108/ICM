import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPublicFeedItemById } from "@/lib/public-feed-service";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const item = await getPublicFeedItemById({ prisma, userId: session?.user?.id ?? null, id: params.id });
  if (!item) return NextResponse.json({ error: "Материал не найден" }, { status: 404 });
  return NextResponse.json({ item });
}
