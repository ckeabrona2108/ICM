import { promises as fs } from "node:fs";
import { basename } from "node:path";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const unavailableMessage =
  "Analytics import jobs are unavailable in current icecream schema: table analytics_import_jobs is missing.";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const repo = (prisma as unknown as {
    analytics_import_jobs?: {
      findUnique: (args: unknown) => Promise<{
        source_file_name?: string | null;
        stored_file_path?: string | null;
      } | null>;
    };
  }).analytics_import_jobs;

  if (!repo) {
    return NextResponse.json({ error: unavailableMessage }, { status: 501 });
  }

  const job = await repo.findUnique({
    where: { id: params.id },
    select: {
      source_file_name: true,
      stored_file_path: true
    }
  });

  if (!job) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }

  if (!job.stored_file_path) {
    return NextResponse.json({ error: "Stored CSV file is unavailable for this import job." }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(job.stored_file_path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT") {
      return NextResponse.json({ error: "Stored CSV file is not found on disk." }, { status: 404 });
    }
    throw error;
  }

  const safeFileName = basename(job.source_file_name || "analytics.csv");
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${safeFileName}\"`
    }
  });
}
