import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  createAnalyticsImportJob,
  importAnalyticsCsvDirect,
  isAnalyticsDataStorageUnavailableError,
  isAnalyticsImportJobStorageUnavailableError,
  processAnalyticsImportJob,
  storeAnalyticsCsvFile
} from "@/lib/admin-analytics-service";
import { prisma } from "@/lib/prisma";

const INLINE_PROCESS_MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let sourceFileName = "";
  let csvText = "";

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const fileName = formData.get("fileName");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Expected file field in multipart request." },
          { status: 400 }
        );
      }

      sourceFileName = String(fileName || file.name || "").trim();
      csvText = await file.text();
    } else {
      const payload = (await request.json().catch(() => null)) as
        | {
            sourceFileName?: string;
            fileName?: string;
            csvText?: string;
          }
        | null;

      sourceFileName = String(payload?.sourceFileName ?? payload?.fileName ?? "").trim();
      csvText = String(payload?.csvText ?? "");
    }
  } catch {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  if (!sourceFileName) {
    return NextResponse.json({ error: "sourceFileName is required" }, { status: 400 });
  }
  if (!csvText.trim()) {
    return NextResponse.json({ error: "CSV payload is empty" }, { status: 400 });
  }

  try {
    const storedFilePath = await storeAnalyticsCsvFile({ sourceFileName, csvText });
    const sizeBytes = Buffer.byteLength(csvText, "utf8");
    try {
      const job = await createAnalyticsImportJob({
        prisma,
        adminId: session.user.id,
        sourceFileName,
        storedFilePath
      });

      if (sizeBytes <= INLINE_PROCESS_MAX_BYTES) {
        const result = await processAnalyticsImportJob({
          prisma,
          jobId: job.id,
          csvText
        });

        return NextResponse.json(
          {
            ok: true,
            mode: "inline",
            job_id: job.id,
            report_date: job.reportDate.toISOString().slice(0, 10),
            result
          },
          { status: 200 }
        );
      }

      // Queue-like behavior fallback until dedicated worker is connected.
      void processAnalyticsImportJob({ prisma, jobId: job.id }).catch((error) => {
        console.error("[analytics-import] async processing failed", error);
      });

      return NextResponse.json(
        {
          ok: true,
          mode: "background",
          job_id: job.id,
          report_date: job.reportDate.toISOString().slice(0, 10),
          message:
            "Import job created and scheduled. Poll import status in /api/admin/analytics/imports."
        },
        { status: 202 }
      );
    } catch (jobError) {
      if (!isAnalyticsImportJobStorageUnavailableError(jobError)) {
        throw jobError;
      }

      try {
        const result = await importAnalyticsCsvDirect({
          prisma,
          sourceFileName,
          csvText
        });

        return NextResponse.json(
          {
            ok: true,
            mode: "direct_fallback",
            report_date: result.reportDate,
            result,
            message:
              "Импорт выполнен без журнала импортов: таблица analytics_import_jobs пока недоступна."
          },
          { status: 200 }
        );
      } catch (directError) {
        if (isAnalyticsDataStorageUnavailableError(directError)) {
          return NextResponse.json(
            {
              error:
                "Импорт аналитики временно недоступен: не применены миграции analytics_report_snapshots / analytics_daily_summaries / unmatched_analytics_imports / analytics_platform_summaries."
            },
            { status: 503 }
          );
        }
        throw directError;
      }
    }
  } catch (error) {
    if (isAnalyticsDataStorageUnavailableError(error)) {
      return NextResponse.json(
        {
          error:
            "Импорт аналитики временно недоступен: не применены миграции analytics_report_snapshots / analytics_daily_summaries / unmatched_analytics_imports / analytics_platform_summaries."
        },
        { status: 503 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to create analytics import";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
