import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { AnalyticsReleaseDetailsResponse } from "@/lib/api/contracts";
import { getAnalyticsReleaseDetails } from "@/lib/analytics-query-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysRaw) ? daysRaw : 30;

  const release = await getAnalyticsReleaseDetails(prisma, {
    user_id: session.user.id,
    release_id: params.id,
    days
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const payload: AnalyticsReleaseDetailsResponse = {
    release_id: release.release_id,
    title: release.title,
    artist: release.artist,
    upc: release.upc,
    total_streams: release.totalStreams,
    total_pay_streams: release.totalPayStreams,
    streams_change_percent: release.streamsChangePercent,
    pay_streams_change_percent: release.payStreamsChangePercent,
    latest_report_date: release.latestReportDate,
    countries_breakdown: release.countriesBreakdown.map((item) => ({
      country: item.country,
      streams: item.streams,
      pay_streams: item.pay_streams
    })),
    chart: release.chart.map((item) => ({
      date: item.date,
      streams: item.streams,
      pay_streams: item.pay_streams
    }))
  };

  return NextResponse.json(payload, { status: 200 });
}
