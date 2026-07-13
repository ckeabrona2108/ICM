import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  getAnalyticsOverview,
  listAnalyticsAccessibleReleaseIds
} from "@/lib/analytics-query-service";
import { prisma } from "@/lib/prisma";

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

const MAX_READABLE_CHANGE_PERCENT = 150;

function clampReadableChangePercent(value: number): number {
  return Math.max(-MAX_READABLE_CHANGE_PERCENT, Math.min(MAX_READABLE_CHANGE_PERCENT, value));
}

function sqlUuid(value: string): Prisma.Sql {
  return Prisma.sql`${value}::uuid`;
}

function sqlUuidList(values: string[]): Prisma.Sql {
  return Prisma.join(values.map((value) => sqlUuid(value)));
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Number.isFinite(daysRaw) ? daysRaw : 30;

  const releaseId = url.searchParams.get("release_id") ?? undefined;
  const country = url.searchParams.get("country") ?? undefined;
  const upc = url.searchParams.get("upc") ?? undefined;
  const platform = url.searchParams.get("platform") ?? undefined;
  const approvedReleaseIds = await listAnalyticsAccessibleReleaseIds(prisma, {
    user_id: session.user.id,
    ...(releaseId ? { release_id: releaseId } : {})
  });

  if (approvedReleaseIds.length === 0) {
    return NextResponse.json(
      {
        total_streams: 0,
        total_pay_streams: 0,
        streams_change_percent: 0,
        pay_streams_change_percent: 0,
        latest_report_date: null,
        top_platform: null,
        platforms_count: 0,
        platforms_breakdown: [],
        chart: [],
        platforms_chart: []
      },
      { status: 200 }
    );
  }

  try {
    const data = await getAnalyticsOverview(prisma, {
      user_id: session.user.id,
      release_id: releaseId || undefined,
      country: country || undefined,
      upc: upc || undefined,
      platform: platform || undefined,
      days
    });

    return NextResponse.json(
      {
        total_streams: data.totalStreams,
        total_pay_streams: data.totalPayStreams,
        streams_change_percent: data.streamsChangePercent,
        pay_streams_change_percent: data.payStreamsChangePercent,
        latest_report_date: data.latestReportDate,
        top_platform: data.topPlatform,
        platforms_count: data.platforms_count,
        platforms_breakdown: data.platformsBreakdown.map((item) => ({
          platform: item.platform,
          streams: item.streams,
          pay_streams: item.pay_streams,
          share_percent: item.sharePercent,
          change_percent: item.changePercent
        })),
        chart: data.chart.map((point) => ({
          date: point.date,
          streams: point.streams,
          pay_streams: point.pay_streams
        })),
        platforms_chart: data.platformsChart.map((point) => ({
          date: point.date,
          values: point.values.map((item) => ({
            platform: item.platform,
            streams: item.streams,
            pay_streams: item.pay_streams
          }))
        }))
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[analytics/overview] fallback due to query error", error);

    const normalizedCountry = country?.trim().toUpperCase() || undefined;
    const normalizedUpc = upc?.trim() || undefined;
    const normalizedPlatform = platform?.trim() || undefined;

    try {
      const conditions: Prisma.Sql[] = [Prisma.sql`"user_id" = ${sqlUuid(session.user.id)}`];
      conditions.push(Prisma.sql`"period_days" = ${days}`);
      if (releaseId) conditions.push(Prisma.sql`"release_id" = ${sqlUuid(releaseId)}`);
      if (!releaseId) {
        conditions.push(Prisma.sql`"release_id" IN (${sqlUuidList(approvedReleaseIds)})`);
      }
      if (normalizedCountry) conditions.push(Prisma.sql`"country" = ${normalizedCountry}`);
      if (normalizedUpc) conditions.push(Prisma.sql`"upc" = ${normalizedUpc}`);
      if (normalizedPlatform) conditions.push(Prisma.sql`"platform" = ${normalizedPlatform}`);

      const latestRows = await prisma.$queryRaw<
        Array<{ report_date: Date; streams: bigint | number | null; pay_streams: bigint | number | null }>
      >(Prisma.sql`
        SELECT
          "report_date" AS "report_date",
          SUM("streams")::bigint AS "streams",
          SUM("pay_streams")::bigint AS "pay_streams"
        FROM "analytics_report_snapshots"
        WHERE ${Prisma.join(conditions, " AND ")}
        GROUP BY "report_date"
        ORDER BY "report_date" DESC
        LIMIT 2
      `);

      const current = latestRows[0];
      const previous = latestRows[1];
      if (!current?.report_date) {
        return NextResponse.json(
          {
            total_streams: 0,
            total_pay_streams: 0,
            streams_change_percent: 0,
            pay_streams_change_percent: 0,
            latest_report_date: null,
            top_platform: null,
            platforms_count: 0,
            platforms_breakdown: [],
            chart: [],
            platforms_chart: []
          },
          { status: 200 }
        );
      }

      const currentStreams = Number(current.streams ?? 0);
      const currentPayStreams = Number(current.pay_streams ?? 0);
      const previousStreams = Number(previous?.streams ?? 0);
      const previousPayStreams = Number(previous?.pay_streams ?? 0);
      const calcChange = (now: number, prev: number) => {
        if (prev === 0) return now > 0 ? null : 0;
        return Number(clampReadableChangePercent(((now - prev) / prev) * 100).toFixed(2));
      };

      const rangeStart = new Date(current.report_date);
      rangeStart.setUTCHours(0, 0, 0, 0);
      rangeStart.setUTCDate(rangeStart.getUTCDate() - Math.max(1, days) + 1);

      const chartRows = await prisma.$queryRaw<
        Array<{ report_date: Date; streams: bigint | number | null; pay_streams: bigint | number | null }>
      >(Prisma.sql`
        SELECT
          "report_date" AS "report_date",
          SUM("streams")::bigint AS "streams",
          SUM("pay_streams")::bigint AS "pay_streams"
        FROM "analytics_report_snapshots"
        WHERE ${Prisma.join([...conditions, Prisma.sql`"report_date" >= ${rangeStart}`], " AND ")}
        GROUP BY "report_date"
        ORDER BY "report_date" ASC
      `);
      const periodStreams = chartRows.reduce((sum, row) => sum + Number(row.streams ?? 0), 0);
      const periodPayStreams = chartRows.reduce((sum, row) => sum + Number(row.pay_streams ?? 0), 0);

      let platformsBreakdown: Array<{
        platform: string;
        streams: number;
        pay_streams: number;
        share_percent: number;
        change_percent: number | null;
      }> = [];

      try {
        const platformRows = await prisma.$queryRaw<
          Array<{ platform: string | null; streams: bigint | number | null; pay_streams: bigint | number | null }>
        >(Prisma.sql`
          SELECT
            "platform",
            SUM("streams")::bigint AS "streams",
            SUM("pay_streams")::bigint AS "pay_streams"
          FROM "analytics_report_snapshots"
          WHERE ${Prisma.join(conditions, " AND ")}
          GROUP BY "platform"
          ORDER BY SUM("streams") DESC
        `);

        const allTimeStreams = platformRows.reduce((sum, row) => sum + Number(row.streams ?? 0), 0);

        platformsBreakdown = platformRows.map((row) => {
          const name = row.platform ?? "Unknown";
          const streamsValue = Number(row.streams ?? 0);
          return {
            platform: name,
            streams: streamsValue,
            pay_streams: Number(row.pay_streams ?? 0),
            share_percent:
              allTimeStreams > 0 ? Number(((streamsValue / allTimeStreams) * 100).toFixed(3)) : 0,
            change_percent: null
          };
        });
      } catch {
        if (currentStreams > 0 || currentPayStreams > 0) {
          platformsBreakdown = [
            {
              platform: "Unknown",
              streams: currentStreams,
              pay_streams: currentPayStreams,
              share_percent: 100,
              change_percent: null
            }
          ];
        }
      }

      return NextResponse.json(
        {
          total_streams: periodStreams,
          total_pay_streams: periodPayStreams,
          streams_change_percent: calcChange(currentStreams, previousStreams),
          pay_streams_change_percent: calcChange(currentPayStreams, previousPayStreams),
          latest_report_date: toDateKey(current.report_date),
          top_platform: platformsBreakdown[0]?.platform ?? null,
          platforms_count: platformsBreakdown.length,
          platforms_breakdown: platformsBreakdown,
          chart: chartRows.map((row) => ({
            date: toDateKey(row.report_date),
            streams: Number(row.streams ?? 0),
            pay_streams: Number(row.pay_streams ?? 0)
          })),
          platforms_chart: []
        },
        { status: 200 }
      );
    } catch (fallbackError) {
      console.error("[analytics/overview] emergency fallback failed", fallbackError);
    }

    return NextResponse.json(
      {
        total_streams: 0,
        total_pay_streams: 0,
        streams_change_percent: 0,
        pay_streams_change_percent: 0,
        latest_report_date: null,
        top_platform: null,
        platforms_count: 0,
        platforms_breakdown: [],
        chart: [],
        platforms_chart: []
      },
      { status: 200 }
    );
  }
}
