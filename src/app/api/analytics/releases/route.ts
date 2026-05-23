import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { AnalyticsReleaseListItemResponse } from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const upcRaw = (url.searchParams.get("upc") ?? "").trim();
  const upc = upcRaw.length > 0 ? upcRaw : undefined;

  const releases = await prisma.release.findMany({
    where: {
      userId: session.user.id,
      confirmed: true,
      status: "approved",
      ...(upc
        ? {
            upc: {
              contains: upc,
              mode: "insensitive"
            }
          }
        : {})
    },
    orderBy: { date: "desc" },
    select: {
      id: true,
      title: true,
      upc: true,
      performer: true,
      feat: true,
      user: {
        select: {
          name: true
        }
      }
    },
    take: 500
  });

  const items: AnalyticsReleaseListItemResponse[] = releases.map((release) => ({
    release_id: release.id,
    title: release.title,
    artist:
      release.performer?.trim() ||
      release.feat?.trim() ||
      release.user.name ||
      "Unknown Artist",
    upc: release.upc ?? "",
    streams: 0,
    pay_streams: 0,
    change_percent: null,
    trend: "flat"
  }));

  return NextResponse.json(items, { status: 200 });
}
