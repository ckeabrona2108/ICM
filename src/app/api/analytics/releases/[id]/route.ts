import { ReleaseStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getAnalyticsReleaseDetails } from "@/lib/analytics-query-service";
import { prisma } from "@/lib/prisma";

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

  try {
    const details = await getAnalyticsReleaseDetails(prisma, {
      userId: session.user.id,
      releaseId: params.id,
      days
    });

    if (!details) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        release_id: details.releaseId,
        title: details.title,
        artist: details.artist,
        upc: details.upc,
        total_streams: details.totalStreams,
        total_pay_streams: details.totalPayStreams,
        streams_change_percent: details.streamsChangePercent,
        pay_streams_change_percent: details.payStreamsChangePercent,
        latest_report_date: details.latestReportDate,
        countries_breakdown: details.countriesBreakdown.map((item) => ({
          country: item.country,
          streams: item.streams,
          pay_streams: item.payStreams
        })),
        chart: details.chart.map((point) => ({
          date: point.date,
          streams: point.streams,
          pay_streams: point.payStreams
        }))
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[analytics/releases/:id] fallback due to query error", error);

    const release = await prisma.release.findFirst({
      where: {
        id: params.id,
        userId: session.user.id,
        status: {
          in: [ReleaseStatus.APPROVED, ReleaseStatus.DISTRIBUTED]
        }
      },
      select: {
        id: true,
        title: true,
        upc: true,
        user: {
          select: { name: true }
        }
      }
    });

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        release_id: release.id,
        title: release.title,
        artist: release.user.name,
        upc: release.upc ?? "",
        total_streams: 0,
        total_pay_streams: 0,
        streams_change_percent: 0,
        pay_streams_change_percent: 0,
        latest_report_date: null,
        countries_breakdown: [],
        chart: []
      },
      { status: 200 }
    );
  }
}
