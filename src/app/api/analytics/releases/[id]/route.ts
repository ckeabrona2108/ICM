import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { AnalyticsReleaseDetailsResponse } from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const release = await prisma.release.findFirst({
    where: {
      id: params.id,
      userId: session.user.id,
      confirmed: true,
      status: "approved"
    },
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
    }
  });

  if (!release) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const payload: AnalyticsReleaseDetailsResponse = {
    release_id: release.id,
    title: release.title,
    artist:
      release.performer?.trim() ||
      release.feat?.trim() ||
      release.user.name ||
      "Unknown Artist",
    upc: release.upc ?? "",
    total_streams: 0,
    total_pay_streams: 0,
    streams_change_percent: null,
    pay_streams_change_percent: null,
    latest_report_date: null,
    countries_breakdown: [],
    chart: []
  };

  return NextResponse.json(payload, { status: 200 });
}
