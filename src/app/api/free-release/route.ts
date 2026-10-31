import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getFreeReleaseStatus } from "@/lib/free-release";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { state, reason, steps, releaseId } = await getFreeReleaseStatus(prisma, session.user.id);
  return NextResponse.json({ state, reason, steps, releaseId }, { headers: { "cache-control": "no-store" } });
}
