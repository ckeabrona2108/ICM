import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { extractAnalyticsPeriodDaysFromStoragePath } from "@/lib/analytics-period";
import {
  isAnalyticsImportJobStorageUnavailableError,
  listAnalyticsImportJobs
} from "@/lib/admin-analytics-service";
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

  try {
    const rawItems = await listAnalyticsImportJobs({
      prisma,
      limit: Number.isFinite(limitRaw) ? limitRaw : 100
    });

    const items = rawItems.map((job) => ({
      id: job.id,
      sourceFileName: job.source_file_name ?? "",
      reportDate:
        job.report_date instanceof Date
          ? job.report_date.toISOString()
          : String(job.report_date ?? ""),
      status: job.status,
      totalRows: Number(job.total_rows ?? 0),
      importedRows: Number(job.imported_rows ?? 0),
      matchedRows: Number(job.matched_rows ?? 0),
      unmatchedRows: Number(job.unmatched_rows ?? 0),
      periodDays: extractAnalyticsPeriodDaysFromStoragePath(job.stored_file_path),
      affectedUsersCount: Number(job.affected_users_count ?? 0),
      affectedReleasesCount: Number(job.affected_releases_count ?? 0),
      errorMessage: job.error_message ?? null,
      createdAt:
        job.created_at instanceof Date
          ? job.created_at.toISOString()
          : String(job.created_at ?? ""),
      finishedAt:
        job.finished_at instanceof Date
          ? job.finished_at.toISOString()
          : job.finished_at
            ? String(job.finished_at)
            : null,
      storedFilePath: job.stored_file_path ?? null
    }));

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    if (isAnalyticsImportJobStorageUnavailableError(error)) {
      return NextResponse.json(
        {
          error:
            "Analytics import jobs are unavailable in current icecream schema: table analytics_import_jobs is missing."
        },
        { status: 501 }
      );
    }
    throw error;
  }
}
