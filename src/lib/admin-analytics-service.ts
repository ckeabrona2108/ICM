// @ts-nocheck
import {
  AnalyticsImportJobStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";

import {
  importAnalyticsCsvReport,
  isAnalyticsStorageUnavailableError,
  parseReportDateFromFilename,
  recomputeSummariesForReportDate,
  relinkUnmatchedAnalyticsRowToRelease
} from "@/lib/analytics-import-service";
import { isAnyPrismaTableMissingError, isPrismaTableMissingError } from "@/lib/prisma-errors";

const IMPORT_STORAGE_DIR = "/private/tmp/icm-analytics-imports";
const ANALYTICS_IMPORT_JOB_TABLE = "analytics_import_jobs";
const ANALYTICS_IMPORT_JOBS_UNAVAILABLE_MESSAGE =
  "Analytics import jobs are unavailable in current icecream schema: table analytics_import_jobs is missing.";
const ANALYTICS_BASE_TABLES = [
  "analytics_report_snapshots",
  "analytics_daily_summaries",
  "unmatched_analytics_imports",
  "analytics_platform_summaries"
] as const;
export const ANALYTICS_STORED_CSV_UNAVAILABLE_MESSAGE =
  "Stored CSV file is unavailable. Re-upload the source report and create a new import job.";

type AnalyticsPlatformSummaryDeleteRepo = {
  deleteMany: (args: unknown) => Promise<unknown>;
};

type AnalyticsImportJobsRepo = {
  create: (args: unknown) => Promise<{
    id: string;
    report_date: Date;
  }>;
  findUnique: (args: unknown) => Promise<any>;
  findMany: (args: unknown) => Promise<any[]>;
  update: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
};

function getAnalyticsImportJobsRepo(prisma: PrismaClient): AnalyticsImportJobsRepo | null {
  return (prisma as unknown as { analytics_import_jobs?: AnalyticsImportJobsRepo }).analytics_import_jobs ?? null;
}

function requireAnalyticsImportJobsRepo(prisma: PrismaClient): AnalyticsImportJobsRepo {
  const repo = getAnalyticsImportJobsRepo(prisma);
  if (!repo) {
    throw new Error(ANALYTICS_IMPORT_JOBS_UNAVAILABLE_MESSAGE);
  }
  return repo;
}

function getAnalyticsPlatformSummaryRepo(
  prisma: PrismaClient
): AnalyticsPlatformSummaryDeleteRepo | null {
  return (prisma as { analytics_platform_summaries?: AnalyticsPlatformSummaryDeleteRepo })
    .analytics_platform_summaries ?? null;
}

function isUnknownAnalyticsImportJobExtendedFieldsError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `platforms_count`") ||
    error.message.includes("Unknown argument `rows_with_unknown_platform`") ||
    error.message.includes("Unknown argument `topPlatform`")
  );
}

async function updateAnalyticsImportJobCompat(params: {
  prisma: PrismaClient;
  jobId: string;
  result: {
    totalCsvRows: number;
    imported_rows: number;
    matched_rows: number;
    unmatched_rows: number;
    touchedUsersCount: number;
    touchedReleasesCount: number;
    platforms_count: number;
    rows_with_unknown_platform: number;
    topPlatform: string | null;
  };
  status: AnalyticsImportJobStatus;
}) {
  try {
    await params.prisma.analytics_import_jobs.update({
      where: { id: params.jobId },
      data: {
        status: params.status,
        total_rows: params.result.totalCsvRows,
        imported_rows: params.result.imported_rows,
        matched_rows: params.result.matched_rows,
        unmatched_rows: params.result.unmatched_rows,
        affected_users_count: params.result.touchedUsersCount,
        affected_releases_count: params.result.touchedReleasesCount,
        platforms_count: params.result.platforms_count,
        rows_with_unknown_platform: params.result.rows_with_unknown_platform,
        top_platform: params.result.topPlatform,
        finished_at: new Date(),
        updated_at: new Date(),
        error_message: null
      }
    });
  } catch (error) {
    if (!isUnknownAnalyticsImportJobExtendedFieldsError(error)) throw error;

    await params.prisma.analytics_import_jobs.update({
      where: { id: params.jobId },
      data: {
        status: params.status,
        total_rows: params.result.totalCsvRows,
        imported_rows: params.result.imported_rows,
        matched_rows: params.result.matched_rows,
        unmatched_rows: params.result.unmatched_rows,
        affected_users_count: params.result.touchedUsersCount,
        affected_releases_count: params.result.touchedReleasesCount,
        finished_at: new Date(),
        updated_at: new Date(),
        error_message: null
      }
    });
  }
}

function isFileNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && (error as { code?: string }).code === "ENOENT";
}

function statusByResult(matched_rows: number, unmatched_rows: number): AnalyticsImportJobStatus {
  if (matched_rows > 0 && unmatched_rows > 0) return AnalyticsImportJobStatus.PARTIAL;
  if (matched_rows > 0) return AnalyticsImportJobStatus.SUCCESS;
  if (unmatched_rows > 0) return AnalyticsImportJobStatus.PARTIAL;
  return AnalyticsImportJobStatus.FAILED;
}

export async function storeAnalyticsCsvFile(params: {
  source_file_name: string;
  csvText: string;
}): Promise<string> {
  await fs.mkdir(IMPORT_STORAGE_DIR, { recursive: true });
  const safeName = `${Date.now()}-${params.source_file_name.replace(/[^a-zA-Z0-9._-]+/g, "_")}`;
  const fullPath = `${IMPORT_STORAGE_DIR}/${safeName}`;
  await fs.writeFile(fullPath, params.csvText, "utf8");
  return fullPath;
}

export async function createAnalyticsImportJob(params: {
  prisma: PrismaClient;
  adminId: string;
  source_file_name: string;
  stored_file_path: string | null;
}): Promise<{ id: string; report_date: Date }> {
  const report_date = parseReportDateFromFilename(params.source_file_name);
  const jobsRepo = requireAnalyticsImportJobsRepo(params.prisma);

  const job = await jobsRepo.create({
    data: {
      id: randomUUID(),
      source_file_name: params.source_file_name,
      stored_file_path: params.stored_file_path,
      report_date,
      status: AnalyticsImportJobStatus.PENDING,
      created_by_admin_id: params.adminId,
      updated_at: new Date()
    },
    select: {
      id: true,
      report_date: true
    }
  });

  return job;
}

export function isAnalyticsImportJobStorageUnavailableError(error: unknown): boolean {
  if (error instanceof Error && error.message === ANALYTICS_IMPORT_JOBS_UNAVAILABLE_MESSAGE) {
    return true;
  }
  return isPrismaTableMissingError(error, ANALYTICS_IMPORT_JOB_TABLE);
}

export function isAnalyticsDataStorageUnavailableError(error: unknown): boolean {
  if (isAnalyticsStorageUnavailableError(error)) {
    return true;
  }
  return isAnyPrismaTableMissingError(error, [...ANALYTICS_BASE_TABLES]);
}

export async function importAnalyticsCsvDirect(params: {
  prisma: PrismaClient;
  source_file_name: string;
  csvText: string;
  period_days?: number;
}) {
  return importAnalyticsCsvReport({
    prisma: params.prisma,
    source_file_name: params.source_file_name,
    csvText: params.csvText,
    period_days: params.period_days ?? 30
  });
}

async function readJobCsv(job: {
  source_file_name: string;
  stored_file_path: string | null;
}): Promise<string> {
  if (!job.stored_file_path) {
    throw new Error(ANALYTICS_STORED_CSV_UNAVAILABLE_MESSAGE);
  }
  try {
    return await fs.readFile(job.stored_file_path, "utf8");
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
  const jobsRepo = requireAnalyticsImportJobsRepo(params.prisma);
  const job = await jobsRepo.findUnique({
    where: { id: params.jobId }
  });

  if (!job) {
    throw new Error("Import job not found");
  }

  await jobsRepo.update({
    where: { id: job.id },
    data: {
      status: AnalyticsImportJobStatus.PROCESSING,
      error_message: null,
      started_at: new Date(),
      finished_at: null,
      updated_at: new Date()
    }
  });

  try {
    const csvText = params.csvText ?? (await readJobCsv(job));

    const result = await importAnalyticsCsvReport({
      prisma: params.prisma,
      source_file_name: job.source_file_name,
      csvText,
      period_days: 30,
      import_job_id: job.id
    });

    const status = statusByResult(result.matched_rows, result.unmatched_rows);

    await updateAnalyticsImportJobCompat({
      prisma: params.prisma,
      jobId: job.id,
      result,
      status
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import processing failed";

    await jobsRepo.update({
      where: { id: job.id },
      data: {
        status: AnalyticsImportJobStatus.FAILED,
        error_message: message,
        finished_at: new Date(),
        updated_at: new Date()
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
  const jobsRepo = requireAnalyticsImportJobsRepo(params.prisma);
  return jobsRepo.findMany({
    orderBy: { created_at: "desc" },
    take: limit,
    include: {
      user: {
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
  const jobsRepo = requireAnalyticsImportJobsRepo(params.prisma);
  const job = await jobsRepo.findUnique({
    where: { id: params.jobId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  if (!job) return null;

  const unmatched_rows = await params.prisma.unmatched_analytics_imports.findMany({
    where: { import_job_id: job.id },
    orderBy: { created_at: "desc" },
    take: 1000
  });

  const snapshots = await params.prisma.analytics_report_snapshots.findMany({
    where: {
      source_file_name: job.source_file_name,
      report_date: job.report_date
    },
    select: {
      user_id: true,
      release_id: true
    }
  });

  const userIds = Array.from(new Set(snapshots.map((item) => item.user_id)));
  const releaseIds = Array.from(new Set(snapshots.map((item) => item.release_id)));

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
        orderBy: { date: "desc" }
      })
    : [];

  return {
    job: {
      id: job.id,
      sourceFileName: job.source_file_name,
      reportDate: job.report_date,
      status: job.status,
      totalRows: job.total_rows,
      importedRows: job.imported_rows,
      matchedRows: job.matched_rows,
      unmatchedRows: job.unmatched_rows,
      affectedUsersCount: job.affected_users_count,
      affectedReleasesCount: job.affected_releases_count,
      errorMessage: job.error_message,
      createdAt: job.created_at,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
      storedFilePath: job.stored_file_path
    },
    unmatchedRows: unmatched_rows.map((row) => ({
      id: row.id,
      upc: row.upc,
      artistName: row.artist_name,
      albumName: row.album_name,
      trackName: row.track_name,
      country: row.country,
      streams: row.streams,
      payStreams: row.pay_streams,
      reason: row.reason,
      createdAt: row.created_at,
      resolved: row.resolved
    })),
    users,
    releases: releases.map((release) => ({
      id: release.id,
      title: release.title,
      upc: release.upc,
      userId: release.userId,
      user: {
        name: release.user.name
      }
    }))
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
  const jobsRepo = requireAnalyticsImportJobsRepo(params.prisma);
  const job = await jobsRepo.findUnique({
    where: { id: params.jobId }
  });
  if (!job) {
    throw new Error("Import job not found");
  }

  const snapshots = await params.prisma.analytics_report_snapshots.findMany({
    where: {
      source_file_name: job.source_file_name,
      report_date: job.report_date
    },
    select: {
      user_id: true,
      release_id: true
    }
  });

  const touchedUserIds = Array.from(new Set(snapshots.map((item) => item.user_id)));
  const touchedReleaseIds = Array.from(new Set(snapshots.map((item) => item.release_id)));

  const recalculated = await recomputeSummariesForReportDate({
    prisma: params.prisma,
    report_date: job.report_date,
    touchedUserIds,
    touchedReleaseIds
  });

  await jobsRepo.update({
    where: { id: job.id },
    data: {
      affected_users_count: touchedUserIds.length,
      affected_releases_count: touchedReleaseIds.length,
      updated_at: new Date()
    }
  });

  return recalculated;
}

export async function deleteAnalyticsImportJob(params: {
  prisma: PrismaClient;
  jobId: string;
}) {
  const jobsRepo = requireAnalyticsImportJobsRepo(params.prisma);
  const job = await jobsRepo.findUnique({
    where: { id: params.jobId },
    select: {
      id: true,
      source_file_name: true,
      stored_file_path: true,
      report_date: true
    }
  });

  if (!job) {
    throw new Error("Import job not found");
  }

  const snapshotsToDelete = await params.prisma.analytics_report_snapshots.findMany({
    where: {
      source_file_name: job.source_file_name,
      report_date: job.report_date
    },
    select: {
      user_id: true,
      release_id: true
    }
  });

  const touchedUserIds = Array.from(new Set(snapshotsToDelete.map((item) => item.user_id)));
  const touchedReleaseIds = Array.from(new Set(snapshotsToDelete.map((item) => item.release_id)));

  await params.prisma.$transaction(async (tx) => {
    await tx.analytics_report_snapshots.deleteMany({
      where: {
        source_file_name: job.source_file_name,
        report_date: job.report_date
      }
    });

    const platformSummaryRepo = getAnalyticsPlatformSummaryRepo(tx as unknown as PrismaClient);
    if (platformSummaryRepo) {
      await platformSummaryRepo.deleteMany({
        where: {
          report_date: job.report_date
        }
      });
    }

    await tx.analytics_daily_summaries.deleteMany({
      where: {
        report_date: job.report_date
      }
    });

    await tx.unmatched_analytics_imports.deleteMany({
      where: {
        OR: [
          { import_job_id: job.id },
          {
            source_file_name: job.source_file_name,
            report_date: job.report_date
          }
        ]
      }
    });

    await tx.analytics_import_jobs.delete({
      where: { id: job.id }
    });
  });

  await recomputeSummariesForReportDate({
    prisma: params.prisma,
    report_date: job.report_date,
    touchedUserIds,
    touchedReleaseIds
  });

  if (job.stored_file_path) {
    try {
      await fs.unlink(job.stored_file_path);
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw error;
      }
    }
  }

  return {
    ok: true as const,
    jobId: job.id
  };
}

export async function listUnmatchedAnalyticsRows(params: {
  prisma: PrismaClient;
  limit?: number;
  upc?: string;
  artist?: string;
  album?: string;
  report_date?: string;
  source_file_name?: string;
  includeResolved?: boolean;
}) {
  const limit = Math.max(1, Math.min(1000, Math.floor(params.limit ?? 200)));

  const where: Prisma.unmatched_analytics_importsWhereInput = {
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
          artist_name: {
            contains: params.artist.trim(),
            mode: "insensitive"
          }
        }
      : {}),
    ...(params.album?.trim()
      ? {
          album_name: {
            contains: params.album.trim(),
            mode: "insensitive"
          }
        }
      : {}),
    ...(params.source_file_name?.trim()
      ? {
          source_file_name: {
            contains: params.source_file_name.trim(),
            mode: "insensitive"
          }
        }
      : {})
  };

  if (params.report_date?.trim()) {
    const date = new Date(`${params.report_date.trim()}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      const next = new Date(date);
      next.setUTCDate(next.getUTCDate() + 1);
      Object.assign(where, {
        report_date: {
          gte: date,
          lt: next
        }
      });
    }
  }

  return params.prisma.unmatched_analytics_imports.findMany({
    where,
    orderBy: [{ report_date: "desc" }, { created_at: "desc" }],
    take: limit,
    include: {
      user: {
        select: { id: true, name: true, email: true }
      },
      release: {
        select: { id: true, title: true, upc: true }
      }
    }
  });
}

export async function linkUnmatchedRowToRelease(params: {
  prisma: PrismaClient;
  unmatchedId: string;
  release_id: string;
  adminId: string;
}) {
  return relinkUnmatchedAnalyticsRowToRelease({
    prisma: params.prisma,
    unmatchedId: params.unmatchedId,
    release_id: params.release_id,
    adminId: params.adminId
  });
}

export async function listAnalyticsReleaseOptions(
  prisma: PrismaClient,
  limit = 1000
) {
  const safeLimit = Math.max(1, Math.min(5000, Math.floor(limit)));
  const rows = await prisma.release.findMany({
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
    orderBy: { date: "desc" },
    take: safeLimit
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    upc: row.upc,
    user: {
      name: row.user.name,
      email: row.user.email
    }
  }));
}
