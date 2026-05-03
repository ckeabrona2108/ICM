import {
  AnalyticsImportJobStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { promises as fs } from "node:fs";

import {
  importAnalyticsCsvReport,
  parseReportDateFromFilename,
  recomputeSummariesForReportDate,
  relinkUnmatchedAnalyticsRowToRelease
} from "@/lib/analytics-import-service";
import { isAnyPrismaTableMissingError, isPrismaTableMissingError } from "@/lib/prisma-errors";

const IMPORT_STORAGE_DIR = "/private/tmp/icm-analytics-imports";
const ANALYTICS_IMPORT_JOB_TABLE = "analytics_import_jobs";
const ANALYTICS_BASE_TABLES = [
  "analytics_report_snapshots",
  "analytics_daily_summaries",
  "unmatched_analytics_imports",
  "analytics_platform_summaries"
] as const;
export const ANALYTICS_STORED_CSV_UNAVAILABLE_MESSAGE =
  "Stored CSV file is unavailable. Re-upload the source report and create a new import job.";

function isUnknownAnalyticsImportJobExtendedFieldsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `platformsCount`") ||
    error.message.includes("Unknown argument `rowsWithUnknownPlatform`") ||
    error.message.includes("Unknown argument `topPlatform`")
  );
}

async function updateAnalyticsImportJobCompat(params: {
  prisma: PrismaClient;
  jobId: string;
  result: {
    totalCsvRows: number;
    importedRows: number;
    matchedRows: number;
    unmatchedRows: number;
    touchedUsersCount: number;
    touchedReleasesCount: number;
    platformsCount: number;
    rowsWithUnknownPlatform: number;
    topPlatform: string | null;
  };
  status: AnalyticsImportJobStatus;
}) {
  try {
    await params.prisma.analyticsImportJob.update({
      where: { id: params.jobId },
      data: {
        status: params.status,
        totalRows: params.result.totalCsvRows,
        importedRows: params.result.importedRows,
        matchedRows: params.result.matchedRows,
        unmatchedRows: params.result.unmatchedRows,
        affectedUsersCount: params.result.touchedUsersCount,
        affectedReleasesCount: params.result.touchedReleasesCount,
        platformsCount: params.result.platformsCount,
        rowsWithUnknownPlatform: params.result.rowsWithUnknownPlatform,
        topPlatform: params.result.topPlatform,
        finishedAt: new Date(),
        errorMessage: null
      }
    });
  } catch (error) {
    if (!isUnknownAnalyticsImportJobExtendedFieldsError(error)) throw error;

    await params.prisma.analyticsImportJob.update({
      where: { id: params.jobId },
      data: {
        status: params.status,
        totalRows: params.result.totalCsvRows,
        importedRows: params.result.importedRows,
        matchedRows: params.result.matchedRows,
        unmatchedRows: params.result.unmatchedRows,
        affectedUsersCount: params.result.touchedUsersCount,
        affectedReleasesCount: params.result.touchedReleasesCount,
        finishedAt: new Date(),
        errorMessage: null
      }
    });
  }
}

function isFileNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as { code?: string }).code === "ENOENT";
}

function statusByResult(matchedRows: number, unmatchedRows: number): AnalyticsImportJobStatus {
  if (matchedRows > 0 && unmatchedRows > 0) return AnalyticsImportJobStatus.PARTIAL;
  if (matchedRows > 0) return AnalyticsImportJobStatus.SUCCESS;
  if (unmatchedRows > 0) return AnalyticsImportJobStatus.PARTIAL;
  return AnalyticsImportJobStatus.FAILED;
}

export async function storeAnalyticsCsvFile(params: {
  sourceFileName: string;
  csvText: string;
}): Promise<string> {
  await fs.mkdir(IMPORT_STORAGE_DIR, { recursive: true });
  const safeName = `${Date.now()}-${params.sourceFileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const fullPath = `${IMPORT_STORAGE_DIR}/${safeName}`;
  await fs.writeFile(fullPath, params.csvText, "utf8");
  return fullPath;
}

export async function createAnalyticsImportJob(params: {
  prisma: PrismaClient;
  adminId: string;
  sourceFileName: string;
  storedFilePath: string | null;
}): Promise<{ id: string; reportDate: Date }> {
  const reportDate = parseReportDateFromFilename(params.sourceFileName);

  const job = await params.prisma.analyticsImportJob.create({
    data: {
      sourceFileName: params.sourceFileName,
      storedFilePath: params.storedFilePath,
      reportDate,
      status: AnalyticsImportJobStatus.PENDING,
      createdByAdminId: params.adminId
    },
    select: {
      id: true,
      reportDate: true
    }
  });

  return job;
}

export function isAnalyticsImportJobStorageUnavailableError(error: unknown): boolean {
  return isPrismaTableMissingError(error, ANALYTICS_IMPORT_JOB_TABLE);
}

export function isAnalyticsDataStorageUnavailableError(error: unknown): boolean {
  return isAnyPrismaTableMissingError(error, [...ANALYTICS_BASE_TABLES]);
}

export async function importAnalyticsCsvDirect(params: {
  prisma: PrismaClient;
  sourceFileName: string;
  csvText: string;
  periodDays?: number;
}) {
  return importAnalyticsCsvReport({
    prisma: params.prisma,
    sourceFileName: params.sourceFileName,
    csvText: params.csvText,
    periodDays: params.periodDays ?? 30
  });
}

async function readJobCsv(job: {
  sourceFileName: string;
  storedFilePath: string | null;
}): Promise<string> {
  if (!job.storedFilePath) {
    throw new Error(ANALYTICS_STORED_CSV_UNAVAILABLE_MESSAGE);
  }
  try {
    return await fs.readFile(job.storedFilePath, "utf8");
  } catch (error) {
    if (isFileNotFoundError(error)) {
      throw new Error(ANALYTICS_STORED_CSV_UNAVAILABLE_MESSAGE);
    }
    throw error;
  }
}

export async function processAnalyticsImportJob(params: {
  prisma: PrismaClient;
  jobId: string;
  csvText?: string;
}) {
  const job = await params.prisma.analyticsImportJob.findUnique({
    where: { id: params.jobId }
  });

  if (!job) {
    throw new Error("Import job not found");
  }

  await params.prisma.analyticsImportJob.update({
    where: { id: job.id },
    data: {
      status: AnalyticsImportJobStatus.PROCESSING,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: null
    }
  });

  try {
    const csvText = params.csvText ?? (await readJobCsv(job));

    const result = await importAnalyticsCsvReport({
      prisma: params.prisma,
      sourceFileName: job.sourceFileName,
      csvText,
      periodDays: 30,
      importJobId: job.id
    });

    const status = statusByResult(result.matchedRows, result.unmatchedRows);

    await updateAnalyticsImportJobCompat({
      prisma: params.prisma,
      jobId: job.id,
      result,
      status
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import processing failed";

    await params.prisma.analyticsImportJob.update({
      where: { id: job.id },
      data: {
        status: AnalyticsImportJobStatus.FAILED,
        errorMessage: message,
        finishedAt: new Date()
      }
    });

    throw error;
  }
}

export async function listAnalyticsImportJobs(params: {
  prisma: PrismaClient;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? 100)));
  return params.prisma.analyticsImportJob.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      createdByAdmin: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });
}

export async function getAnalyticsImportJobDetails(params: {
  prisma: PrismaClient;
  jobId: string;
}) {
  const job = await params.prisma.analyticsImportJob.findUnique({
    where: { id: params.jobId },
    include: {
      createdByAdmin: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!job) return null;

  const unmatchedRows = await params.prisma.unmatchedAnalyticsImport.findMany({
    where: { importJobId: job.id },
    orderBy: { createdAt: "desc" },
    take: 1000
  });

  const snapshots = await params.prisma.analyticsReportSnapshot.findMany({
    where: {
      sourceFileName: job.sourceFileName,
      reportDate: job.reportDate
    },
    select: {
      userId: true,
      releaseId: true
    }
  });

  const userIds = Array.from(new Set(snapshots.map((item) => item.userId)));
  const releaseIds = Array.from(new Set(snapshots.map((item) => item.releaseId)));

  const users = userIds.length
    ? await params.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          name: true,
          email: true
        },
        orderBy: { name: "asc" }
      })
    : [];

  const releases = releaseIds.length
    ? await params.prisma.release.findMany({
        where: { id: { in: releaseIds } },
        select: {
          id: true,
          title: true,
          upc: true,
          userId: true,
          user: {
            select: {
              name: true
            }
          }
        },
        orderBy: { updatedAt: "desc" }
      })
    : [];

  return {
    job,
    unmatchedRows,
    users,
    releases
  };
}

export async function reprocessAnalyticsImportJob(params: {
  prisma: PrismaClient;
  jobId: string;
}) {
  return processAnalyticsImportJob({
    prisma: params.prisma,
    jobId: params.jobId
  });
}

export async function recalculateAnalyticsImportJobSummaries(params: {
  prisma: PrismaClient;
  jobId: string;
}) {
  const job = await params.prisma.analyticsImportJob.findUnique({
    where: { id: params.jobId }
  });
  if (!job) {
    throw new Error("Import job not found");
  }

  const snapshots = await params.prisma.analyticsReportSnapshot.findMany({
    where: {
      sourceFileName: job.sourceFileName,
      reportDate: job.reportDate
    },
    select: {
      userId: true,
      releaseId: true
    }
  });

  const touchedUserIds = Array.from(new Set(snapshots.map((item) => item.userId)));
  const touchedReleaseIds = Array.from(new Set(snapshots.map((item) => item.releaseId)));

  const recalculated = await recomputeSummariesForReportDate({
    prisma: params.prisma,
    reportDate: job.reportDate,
    touchedUserIds,
    touchedReleaseIds
  });

  await params.prisma.analyticsImportJob.update({
    where: { id: job.id },
    data: {
      affectedUsersCount: touchedUserIds.length,
      affectedReleasesCount: touchedReleaseIds.length,
      updatedAt: new Date()
    }
  });

  return recalculated;
}

export async function listUnmatchedAnalyticsRows(params: {
  prisma: PrismaClient;
  limit?: number;
  upc?: string;
  artist?: string;
  album?: string;
  reportDate?: string;
  sourceFileName?: string;
  includeResolved?: boolean;
}) {
  const limit = Math.max(1, Math.min(1000, Math.floor(params.limit ?? 200)));

  const where: Prisma.UnmatchedAnalyticsImportWhereInput = {
    ...(params.includeResolved ? {} : { resolved: false }),
    ...(params.upc?.trim()
      ? {
          upc: {
            contains: params.upc.trim(),
            mode: "insensitive"
          }
        }
      : {}),
    ...(params.artist?.trim()
      ? {
          artistName: {
            contains: params.artist.trim(),
            mode: "insensitive"
          }
        }
      : {}),
    ...(params.album?.trim()
      ? {
          albumName: {
            contains: params.album.trim(),
            mode: "insensitive"
          }
        }
      : {}),
    ...(params.sourceFileName?.trim()
      ? {
          sourceFileName: {
            contains: params.sourceFileName.trim(),
            mode: "insensitive"
          }
        }
      : {})
  };

  if (params.reportDate?.trim()) {
    const date = new Date(`${params.reportDate.trim()}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 1);
      Object.assign(where, {
        reportDate: {
          gte: date,
          lt: next
        }
      });
    }
  }

  return params.prisma.unmatchedAnalyticsImport.findMany({
    where,
    orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      resolvedByAdmin: {
        select: { id: true, name: true, email: true }
      },
      resolvedRelease: {
        select: { id: true, title: true, upc: true }
      }
    }
  });
}

export async function linkUnmatchedRowToRelease(params: {
  prisma: PrismaClient;
  unmatchedId: string;
  releaseId: string;
  adminId: string;
}) {
  return relinkUnmatchedAnalyticsRowToRelease({
    prisma: params.prisma,
    unmatchedId: params.unmatchedId,
    releaseId: params.releaseId,
    adminId: params.adminId
  });
}

export async function listAnalyticsReleaseOptions(
  prisma: PrismaClient,
  limit = 1000
) {
  const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
  return prisma.release.findMany({
    select: {
      id: true,
      title: true,
      upc: true,
      user: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: safeLimit
  });
}
