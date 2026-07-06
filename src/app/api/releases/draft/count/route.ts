import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getReleaseSidebarCountsForUser } from "@/lib/release-counts";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const draftsCount = (
    await getReleaseSidebarCountsForUser({
      userId: session.user.id,
      prisma
    })
  ).draft;

  return NextResponse.json({ draftsCount }, { status: 200 });
}
