import { ReleaseStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listAnalyticsReleases } from "@/lib/analytics-query-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const country = url.searchParams.get("country") ?? undefined;
  const upc = url.searchParams.get("upc") ?? undefined;
  const platform = url.searchParams.get("platform") ?? undefined;

  try {
    const releases = await listAnalyticsReleases(prisma, {
      userId: session.user.id,
      country: country || undefined,
      upc: upc || undefined,
      platform: platform || undefined
    });

    return NextResponse.json(
      releases.map((item) => ({
        release_id: item.releaseId,
        title: item.title,
        artist: item.artist,
        upc: item.upc,
        streams: item.streams,
        pay_streams: item.payStreams,
        change_percent: item.changePercent,
        trend: item.trend
      })),
      { status: 200 }
    );
  } catch (error) {
    console.error("[analytics/releases] fallback due to query error", error);

    const upcFilter = (upc ?? "").trim();
    const fallbackReleases = await prisma.release.findMany({
      where: {
        userId: session.user.id,
        status: {
          in: [ReleaseStatus.APPROVED, ReleaseStatus.DISTRIBUTED]
        },
        ...(upcFilter
          ? {
              upc: {
                contains: upcFilter
              }
            }
          : {})
      },
      select: {
        id: true,
        title: true,
        upc: true,
        user: {
          select: {
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json(
      fallbackReleases.map((item) => ({
        release_id: item.id,
        title: item.title,
        artist: item.user.name,
        upc: item.upc ?? "",
        streams: 0,
        pay_streams: 0,
        change_percent: 0,
        trend: "flat" as const
      })),
      { status: 200 }
    );
  }
}
