import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { AnalyticsCountriesResponse } from "@/lib/api/contracts";
import { getAnalyticsCountries } from "@/lib/analytics-query-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const releaseId = url.searchParams.get("release_id")?.trim() || undefined;

  const result = await getAnalyticsCountries(prisma, {
    user_id: session.user.id,
    release_id: releaseId,
    days: Number.isFinite(daysRaw) ? daysRaw : 30
  });

  const payload: AnalyticsCountriesResponse = {
    latest_report_date: result.latestReportDate,
    countries_breakdown: result.countriesBreakdown
  };
  return NextResponse.json(payload, { status: 200 });
}
