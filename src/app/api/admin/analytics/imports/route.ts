import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { listAnalyticsImportJobs } from "@/lib/admin-analytics-service";
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
  const limitRaw = Number(url.searchParams.get("limit") ?? "100");

  const items = await listAnalyticsImportJobs({
    prisma,
    limit: Number.isFinite(limitRaw) ? limitRaw : 100
  });

  return NextResponse.json({ items }, { status: 200 });
}
