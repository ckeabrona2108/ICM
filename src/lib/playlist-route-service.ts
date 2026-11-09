import { NextResponse } from "next/server";

import { getPlaylistMetaMap, type PlaylistMeta } from "@/lib/playlist-meta";
import { prisma } from "@/lib/prisma";

export async function buildPlaylistsResponse(params: {
  session: { user?: { id?: string | null } | null } | null;
  prismaClient?: typeof prisma;
  loadMeta?: (urls: string[]) => Promise<Map<string, PlaylistMeta | null>>;
}) {
  const { session, prismaClient = prisma, loadMeta = getPlaylistMetaMap } = params;

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prismaClient.playlist_placements.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { release: { select: { title: true, upc: true } } }
  });

  // Rows from reports without a UPC are keyed internally as "track:…": the artist sees the
  // release's own UPC instead, or nothing.
  const meta = await loadMeta(rows.map((row) => row.playlistUrl));
  const placements = rows.map(({ release, ...placement }) => ({
    ...placement,
    upc: release?.upc || (placement.upc.startsWith("track:") ? "" : placement.upc),
    releaseTitle: release?.title ?? null,
    playlistCoverUrl: meta.get(placement.playlistUrl)?.coverUrl ?? null,
    playlistFollowers: meta.get(placement.playlistUrl)?.followers ?? null
  }));

  return NextResponse.json({ placements });
}
