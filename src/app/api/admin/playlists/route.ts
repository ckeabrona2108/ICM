import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Every playlist placement with the cabinet and release it is shown in. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const placements = await prisma.playlist_placements.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 2000,
    select: {
      id: true,
      platform: true,
      artistName: true,
      trackTitle: true,
      position: true,
      playlistName: true,
      playlistUrl: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, name: true, email: true } },
      release: { select: { id: true, title: true } }
    }
  });

  return NextResponse.json({
    placements: placements.map((item) => ({
      ...item,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString()
    }))
  });
}
