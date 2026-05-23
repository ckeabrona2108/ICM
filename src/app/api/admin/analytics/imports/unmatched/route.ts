import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const unavailableMessage =
  "Unmatched analytics rows are unavailable in current icecream schema: table unmatched_analytics_imports is missing.";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const repo = (prisma as unknown as {
    unmatched_analytics_imports?: {
      findMany: (args: unknown) => Promise<unknown[]>;
    };
  }).unmatched_analytics_imports;

  if (!repo) {
    return NextResponse.json({ error: unavailableMessage }, { status: 501 });
  }

  const url = new URL(request.url);
  const importJobId = (url.searchParams.get("import_job_id") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit") ?? "200");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(1000, Math.floor(limitRaw))) : 200;

  const items = await repo.findMany({
    where: importJobId
      ? { import_job_id: importJobId }
      : {},
    orderBy: [{ report_date: "desc" }, { created_at: "desc" }],
    take: limit
  });

  return NextResponse.json({ items }, { status: 200 });
}
