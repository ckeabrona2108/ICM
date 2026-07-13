import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { AnalyticsReleaseListItemResponse } from "@/lib/api/contracts";
import { listAnalyticsReleases } from "@/lib/analytics-query-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysRaw) ? daysRaw : 30;
  const countryRaw = (url.searchParams.get("country") ?? "").trim();
  const upcRaw = (url.searchParams.get("upc") ?? "").trim();
  const platformRaw = (url.searchParams.get("platform") ?? "").trim();
  const country = countryRaw.length > 0 ? countryRaw : undefined;
  const upc = upcRaw.length > 0 ? upcRaw : undefined;
  const platform = platformRaw.length > 0 ? platformRaw : undefined;

  let releases;
  try {
    releases = await listAnalyticsReleases(prisma, {
      user_id: session.user.id,
      days,
      country,
      upc,
      platform
    });
  } catch (error) {
    console.error("[analytics/releases] failed to load releases", error);
    return NextResponse.json([], { status: 200 });
  }

  const items: AnalyticsReleaseListItemResponse[] = releases.map((release) => ({
    release_id: release.release_id,
    title: release.title,
    artist: release.artist,
    upc: release.upc,
    streams: release.streams,
    pay_streams: release.pay_streams,
    change_percent: release.changePercent,
    trend: release.trend
  }));

  return NextResponse.json(items, { status: 200 });
}
