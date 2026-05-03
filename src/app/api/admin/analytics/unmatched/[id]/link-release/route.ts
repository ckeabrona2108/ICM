import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { linkUnmatchedRowToRelease } from "@/lib/admin-analytics-service";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await request.json().catch(() => null)) as
    | { release_id?: string; releaseId?: string }
    | null;

  const releaseId = String(payload?.release_id ?? payload?.releaseId ?? "").trim();
  if (!releaseId) {
    return NextResponse.json({ error: "release_id is required" }, { status: 400 });
  }

  try {
    const result = await linkUnmatchedRowToRelease({
      prisma,
      unmatchedId: params.id,
      releaseId,
      adminId: session.user.id
    });

    return NextResponse.json({ ok: true, result }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to link unmatched row";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
