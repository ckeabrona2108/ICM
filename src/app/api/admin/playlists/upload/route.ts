import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as xlsx from "xlsx";

import { authOptions } from "@/lib/auth";
import {
  detectPlaylistPlatform,
  matchPlaylistRowToRelease,
  parsePlaylistReportRow,
  placementTrackKey
} from "@/lib/playlist-import";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const selectedPlatform = String(formData.get("platform") ?? "").trim();
    // "Full report": placements of this platform that are not in the file have left their playlists.
    const removeMissing = formData.get("removeMissing") === "1";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Не выбран файл" }, { status: 400 });
    }

    const workbook = xlsx.read(await file.arrayBuffer(), { type: "array" });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]!];
    const rawRows = worksheet ? xlsx.utils.sheet_to_json<Record<string, unknown>>(worksheet) : [];

    let skipped = 0;
    let added = 0;
    let updated = 0;
    const unmatched: Array<{ artistName: string; trackTitle: string; playlistName: string }> = [];
    const seen = new Map<string, Set<string>>();

    for (const raw of rawRows) {
      const row = parsePlaylistReportRow(raw);
      const platform = selectedPlatform || (row ? detectPlaylistPlatform(row.playlistUrl) : null);
      if (!row || !platform) {
        skipped++;
        continue;
      }

      const match = await matchPlaylistRowToRelease(prisma, row);
      if (!match) {
        unmatched.push({ artistName: row.artistName, trackTitle: row.trackTitle, playlistName: row.playlistName });
      }

      const key = placementTrackKey(row);
      const data = {
        artistName: row.artistName || null,
        trackTitle: row.trackTitle || null,
        position: row.position || null,
        playlistName: row.playlistName,
        releaseId: match?.releaseId ?? null,
        userId: match?.userId ?? null
      };

      try {
        const existing = await prisma.playlist_placements.findUnique({
          where: { platform_upc_playlistUrl: { platform, upc: key, playlistUrl: row.playlistUrl } },
          select: { id: true, releaseId: true, userId: true }
        });
        if (existing) {
          await prisma.playlist_placements.update({
            where: { id: existing.id },
            // A placement the admin tied by hand keeps that link when the file finds nothing.
            data: match ? data : { ...data, releaseId: existing.releaseId, userId: existing.userId }
          });
          updated++;
        } else {
          await prisma.playlist_placements.create({
            data: { ...data, platform, upc: key, playlistUrl: row.playlistUrl }
          });
          added++;
        }
        const ids = seen.get(platform) ?? new Set<string>();
        ids.add(`${key}\u0000${row.playlistUrl}`);
        seen.set(platform, ids);
      } catch (error) {
        console.error("[playlists] Failed to save placement", error);
        skipped++;
      }
    }

    let removed = 0;
    if (removeMissing) {
      for (const [platform, keep] of seen) {
        const current = await prisma.playlist_placements.findMany({
          where: { platform },
          select: { id: true, upc: true, playlistUrl: true }
        });
        const stale = current.filter((item) => !keep.has(`${item.upc}\u0000${item.playlistUrl}`)).map((item) => item.id);
        if (stale.length > 0) {
          const result = await prisma.playlist_placements.deleteMany({ where: { id: { in: stale } } });
          removed += result.count;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      added,
      updated,
      removed,
      skipped,
      unmatched,
      // Kept for older clients of this endpoint.
      successCount: added + updated,
      errorCount: skipped
    });
  } catch (error) {
    console.error("[playlists] Upload error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке" }, { status: 500 });
  }
}
