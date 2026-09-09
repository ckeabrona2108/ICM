import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function buildPlaylistsResponse(params: {
  session: { user?: { id?: string | null } | null } | null;
  prismaClient?: typeof prisma;
}) {
  const { session, prismaClient = prisma } = params;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const placements = await prismaClient.playlist_placements.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ placements });
}
