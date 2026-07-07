import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import * as xlsx from "xlsx";

import { authOptions } from "@/lib/auth";
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
    const file = formData.get("file") as File;
    const platform = formData.get("platform") as string;

    if (!file || !platform) {
      return NextResponse.json({ error: "Не указан файл или площадка" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = xlsx.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows: any[] = xlsx.utils.sheet_to_json(worksheet);

    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      const upcRaw = row["UPC"] || row["ISRC"] || "";
      const upc = String(upcRaw).trim();
      const artistName = String(row["Артист"] || "").trim();
      const trackTitle = String(row["Наименование"] || row["Трек"] || "").trim();
      const position = String(row["Позиция"] || "").trim();
      const playlistName = String(row["Плейлист"] || "").trim();
      const playlistUrl = String(row["Ссылка на"] || row["Ссылка"] || row["Ссылка на плейлист"] || "").trim();

      if (!upc || !playlistName || !playlistUrl) {
        errorCount++;
        continue;
      }

      // Находим релиз по UPC для привязки к пользователю
      const release = await prisma.release.findFirst({
        where: { upc: upc },
        select: { id: true, userId: true }
      });

      try {
        // @ts-ignore: модель будет добавлена пользователем
        await prisma.playlist_placements.upsert({
          where: {
            platform_upc_playlistUrl: {
              platform: platform,
              upc: upc,
              playlistUrl: playlistUrl
            }
          },
          update: {
            artistName,
            trackTitle,
            position,
            playlistName,
            releaseId: release?.id || null,
            userId: release?.userId || null
          },
          create: {
            platform,
            upc,
            artistName,
            trackTitle,
            position,
            playlistName,
            playlistUrl,
            releaseId: release?.id || null,
            userId: release?.userId || null
          }
        });
        successCount++;
      } catch (e) {
        console.error("[playlists] Failed to insert placement", e);
        errorCount++;
      }
    }

    return NextResponse.json({ ok: true, successCount, errorCount });
  } catch (error) {
    console.error("[playlists] Upload error:", error);
    return NextResponse.json({ error: "Ошибка при загрузке" }, { status: 500 });
  }
}
