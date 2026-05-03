import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listUnmatchedAnalyticsRows } from "@/lib/admin-analytics-service";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const items = await listUnmatchedAnalyticsRows({
    prisma,
    limit: Number(url.searchParams.get("limit") ?? "200"),
    upc: url.searchParams.get("upc") ?? undefined,
    artist: url.searchParams.get("artist") ?? undefined,
    album: url.searchParams.get("album") ?? undefined,
    reportDate: url.searchParams.get("report_date") ?? undefined,
    sourceFileName: url.searchParams.get("source_file_name") ?? undefined,
    includeResolved: (url.searchParams.get("include_resolved") ?? "false") === "true"
  });

  return NextResponse.json({ items }, { status: 200 });
}
