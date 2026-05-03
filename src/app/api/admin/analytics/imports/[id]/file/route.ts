import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";

import { authOptions } from "@/lib/auth";
import { ANALYTICS_STORED_CSV_UNAVAILABLE_MESSAGE } from "@/lib/admin-analytics-service";
import { prisma } from "@/lib/prisma";

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

  const job = await prisma.analyticsImportJob.findUnique({
    where: { id: params.id },
    select: {
      sourceFileName: true,
      storedFilePath: true
    }
  });

  if (!job) {
    return NextResponse.json({ error: "Import job not found" }, { status: 404 });
  }
  if (!job.storedFilePath) {
    return NextResponse.json({ error: "Stored file is not available" }, { status: 404 });
  }

  try {
    const fileContent = await fs.readFile(job.storedFilePath, "utf8");
    return new NextResponse(fileContent, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${job.sourceFileName}"`
      }
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return NextResponse.json(
        { error: ANALYTICS_STORED_CSV_UNAVAILABLE_MESSAGE },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: "Failed to read stored CSV" }, { status: 404 });
  }
}
