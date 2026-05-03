import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getReleaseSidebarCountsForUser } from "@/lib/release-counts";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const counts = await getReleaseSidebarCountsForUser({
    userId: session.user.id,
    prisma
  });

  return NextResponse.json(counts, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=30, stale-while-revalidate=30"
    }
  });
}
