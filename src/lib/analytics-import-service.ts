// @ts-nocheck
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { applyAnalyticsPeriodVariant, normalizeAnalyticsPeriodDays } from "@/lib/analytics-period";
import { normalizeAnalyticsUpc } from "@/lib/analytics-upc";
import {
  normalizeAnalyticsPlatform,
  normalizeAnalyticsPlatformHeader
} from "@/lib/analytics-platform";

interface ParsedAnalyticsCsvRow {
  track: string;
  artist: string;
  album: string;
  country: string;
  platform: string;
  upc: string;
  report_date: Date;
  pay_streams: number;
  streams: number;
}

interface GroupedAnalyticsRow {
  report_date: Date;
  upc: string;
  country: string;
  platform: string;
  streams: number;
  pay_streams: number;
  trackNames: Set<string>;
  artistNames: Set<string>;
  albumNames: Set<string>;
}

export interface AnalyticsImportResult {
  source_file_name: string;
  report_date: string;
  totalCsvRows: number;
  groupedRows: number;
  imported_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  touchedUsersCount: number;
  touchedReleasesCount: number;
  platforms_count: number;
  rows_with_unknown_platform: number;
  topPlatform: string | null;
}

interface AnalyticsPlatformSummaryRepo {
  deleteMany: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<Array<{ platform: string; streams: number }>>;
  createMany: (args: unknown) => Promise<unknown>;
}

type SnapshotUniqueMode = "platform" | "legacy_country" | "legacy_no_platform";

const ANALYTICS_STORAGE_UNAVAILABLE_CODE = "ANALYTICS_STORAGE_UNAVAILABLE";

function createAnalyticsStorageUnavailableError(missingRepos: string[]): Error {
  const error = new Error(
    `Analytics data storage is unavailable: missing Prisma repos ${missingRepos.join(", ")}.`
  );
  (error as Error & { code?: string }).code = ANALYTICS_STORAGE_UNAVAILABLE_CODE;
  return error;
}

export function isAnalyticsStorageUnavailableError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === ANALYTICS_STORAGE_UNAVAILABLE_CODE
  );
}

function assertAnalyticsStorageRepos(client: PrismaClient | Prisma.TransactionClient): void {
  const requiredRepos = [
    "analytics_report_snapshots",
    "analytics_daily_summaries",
    "unmatched_analytics_imports"
  ] as const;
  const missingRepos = requiredRepos.filter((repoName) => {
    const repo = (client as Record<string, unknown>)[repoName];
    return !repo || typeof repo !== "object";
  });

  if (missingRepos.length > 0) {
    throw createAnalyticsStorageUnavailableError([...missingRepos]);
  }
}

function isUnknownPlatformUniqueKeyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `releaseId_reportDate_country_platform`") ||
    error.message.includes("releaseId_reportDate_country_platform")
  );
}

function isUnknownPlatformFieldError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `platform`") ||
    error.message.includes("Invalid value for argument `by`") ||
    error.message.includes("Expected AnalyticsReportSnapshotScalarFieldEnum")
  );
}

function isRawPlatformQueryUnavailableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("column \"platform\" does not exist") ||
    error.message.includes("relation \"analytics_report_snapshots\" does not exist")
  );
}

function toNumber(value: bigint | number | null): number {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  return value;
}

function isUnknownSummaryPlatformFieldError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `topPlatform`") ||
    error.message.includes("Unknown argument `platforms_count`")
  );
}

function isOnConflictConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("42P10") ||
    error.message.includes("no unique or exclusion constraint matching the ON CONFLICT specification")
  );
}

function getAnalyticsPlatformSummaryRepo(
  tx: Prisma.TransactionClient | PrismaClient
): AnalyticsPlatformSummaryRepo | null {
  const repo = (tx as { analytics_platform_summaries?: AnalyticsPlatformSummaryRepo })
    .analytics_platform_summaries;

  return repo ?? null;
}

async function upsertAnalyticsSnapshotCompat(params: {
  tx: Prisma.TransactionClient;
  modeRef: { current: SnapshotUniqueMode };
  row: {
    release_id: string;
    user_id: string;
    upc: string;
    report_date: Date;
    period_days: number;
    country: string;
    platform: string;
    streams: number;
    pay_streams: number;
    track_name: string | null;
    artist_name: string | null;
    album_name: string | null;
    source_file_name: string;
  };
}): Promise<void> {
  const { tx, modeRef, row } = params;

  const whereByCountry = {
    release_id: row.release_id,
    report_date: row.report_date,
    country: row.country
  };
  const whereByCountryPlatform = {
    ...whereByCountry,
    platform: row.platform
  };

  const findExisting = async (): Promise<{ id: string } | null> => {
    if (modeRef.current === "platform") {
      try {
        return await tx.analytics_report_snapshots.findFirst({
          where: whereByCountryPlatform,
          select: { id: true }
        });
      } catch (error) {
        if (!isUnknownPlatformFieldError(error)) throw error;
        modeRef.current = "legacy_no_platform";
      }
    }

    return tx.analytics_report_snapshots.findFirst({
      where: whereByCountry,
      select: { id: true }
    });
  };

  const createWithPlatform = async () => {
    await tx.analytics_report_snapshots.create({
      data: {
        id: randomUUID(),
        user_id: row.user_id,
        release_id: row.release_id,
        upc: row.upc,
        report_date: row.report_date,
        period_days: row.period_days,
        country: row.country,
        platform: row.platform,
        streams: row.streams,
        pay_streams: row.pay_streams,
        track_name: row.track_name,
        artist_name: row.artist_name,
        album_name: row.album_name,
        source_file_name: row.source_file_name,
        updated_at: new Date()
      }
    });
  };

  const createNoPlatform = async () => {
    await tx.analytics_report_snapshots.create({
      data: {
        id: randomUUID(),
        user_id: row.user_id,
        release_id: row.release_id,
        upc: row.upc,
        report_date: row.report_date,
        period_days: row.period_days,
        country: row.country,
        streams: row.streams,
        pay_streams: row.pay_streams,
        track_name: row.track_name,
        artist_name: row.artist_name,
        album_name: row.album_name,
        source_file_name: row.source_file_name,
        updated_at: new Date()
      }
    });
  };

  const createSnapshot = async () => {
    if (modeRef.current === "legacy_no_platform") {
      await createNoPlatform();
      return;
    }

    try {
      await createWithPlatform();
    } catch (error) {
      if (isUnknownPlatformFieldError(error)) {
        modeRef.current = "legacy_no_platform";
        await createNoPlatform();
        return;
      }
      throw error;
    }
  };

  const updateById = async (id: string) => {
    if (modeRef.current === "legacy_no_platform") {
      await tx.analytics_report_snapshots.update({
        where: { id },
        data: {
          user_id: row.user_id,
          upc: row.upc,
          period_days: row.period_days,
          streams: { increment: row.streams },
          pay_streams: { increment: row.pay_streams },
          source_file_name: row.source_file_name
        }
      });
      return;
    }

    if (modeRef.current === "legacy_country") {
      try {
        await tx.analytics_report_snapshots.update({
          where: { id },
          data: {
            user_id: row.user_id,
            upc: row.upc,
            period_days: row.period_days,
            platform: row.platform,
            streams: { increment: row.streams },
            pay_streams: { increment: row.pay_streams },
            source_file_name: row.source_file_name
          }
        });
      } catch (error) {
        if (!isUnknownPlatformFieldError(error)) throw error;
        modeRef.current = "legacy_no_platform";
        await updateById(id);
      }
      return;
    }

    try {
      await tx.analytics_report_snapshots.update({
        where: { id },
        data: {
          user_id: row.user_id,
          upc: row.upc,
          period_days: row.period_days,
          platform: row.platform,
          streams: row.streams,
          pay_streams: row.pay_streams,
          track_name: row.track_name,
          artist_name: row.artist_name,
          album_name: row.album_name,
          source_file_name: row.source_file_name
        }
      });
    } catch (error) {
      if (isUnknownPlatformFieldError(error)) {
        modeRef.current = "legacy_no_platform";
        await updateById(id);
        return;
      }
      if (isOnConflictConstraintError(error) || isUnknownPlatformUniqueKeyError(error)) {
        modeRef.current = "legacy_country";
        await updateById(id);
        return;
      }
      throw error;
    }
  };

  const existing = await findExisting();
  if (!existing) {
    await createSnapshot();
    return;
  }

  await updateById(existing.id);
}

async function groupByPlatformSafe(
  tx: Prisma.TransactionClient,
  where: { user_id?: string; release_id?: string; report_date: Date }
): Promise<Array<{ platform: string | null; _sum: { streams: number | null; pay_streams: number | null } }>> {
  try {
    const snapshotsRepo = tx.analytics_report_snapshots as unknown as {
      groupBy: (args: unknown) => Promise<unknown>;
    };
    return (await snapshotsRepo.groupBy({
      by: ["platform"],
      where,
      _sum: { streams: true, pay_streams: true },
      orderBy: {
        _sum: {
          streams: "desc"
        }
      }
    })) as Array<{ platform: string | null; _sum: { streams: number | null; pay_streams: number | null } }>;
  } catch (error) {
    if (!isUnknownPlatformFieldError(error)) throw error;
  }

  const conditions: Prisma.Sql[] = [Prisma.sql`"report_date" = ${where.report_date}`];
  if (where.user_id) conditions.push(Prisma.sql`"user_id" = ${where.user_id}`);
  if (where.release_id) conditions.push(Prisma.sql`"release_id" = ${where.release_id}`);

  try {
    const rows = await tx.$queryRaw<
      Array<{
        platform: string | null;
        streams: bigint | number | null;
        pay_streams: bigint | number | null;
      }>
    >(Prisma.sql`
      SELECT
        "platform",
        SUM("streams")::bigint AS "streams",
        SUM("pay_streams")::bigint AS "pay_streams"
      FROM "analytics_report_snapshots"
      WHERE ${Prisma.join(conditions, " AND ")}
      GROUP BY "platform"
      ORDER BY SUM("streams") DESC
    `);

    return rows.map((row) => ({
      platform: row.platform,
      _sum: {
        streams: toNumber(row.streams),
        pay_streams: toNumber(row.pay_streams)
      }
    }));
  } catch (error) {
    if (isRawPlatformQueryUnavailableError(error)) {
      return [];
    }
    throw error;
  }
}

async function createSummarySafe(
  tx: Prisma.TransactionClient,
  data: {
    user_id: string;
    release_id: string | null;
    report_date: Date;
    total_streams: number;
    total_pay_streams: number;
    countries_count: number;
    top_country: string | null;
    top_platform: string | null;
    platforms_count: number;
    releases_count: number;
  }
): Promise<void> {
  try {
    await tx.analytics_daily_summaries.create({
      data: {
        id: randomUUID(),
        ...data,
        updated_at: new Date()
      }
    });
  } catch (error) {
    if (!isUnknownSummaryPlatformFieldError(error)) throw error;
    await tx.analytics_daily_summaries.create({
      data: {
        id: randomUUID(),
        user_id: data.user_id,
        release_id: data.release_id,
        report_date: data.report_date,
        total_streams: data.total_streams,
        total_pay_streams: data.total_pay_streams,
        countries_count: data.countries_count,
        top_country: data.top_country,
        releases_count: data.releases_count,
        updated_at: new Date()
      }
    });
  }
}

async function upsertSummarySafe(
  tx: Prisma.TransactionClient,
  params: {
    where: {
      user_id_release_id_report_date: {
        user_id: string;
        release_id: string;
        report_date: Date;
      };
    };
    create: {
      user_id: string;
      release_id: string;
      report_date: Date;
      total_streams: number;
      total_pay_streams: number;
      countries_count: number;
      top_country: string | null;
      top_platform: string | null;
      platforms_count: number;
      releases_count: number;
    };
    update: {
      total_streams: number;
      total_pay_streams: number;
      countries_count: number;
      top_country: string | null;
      top_platform: string | null;
      platforms_count: number;
      releases_count: number;
    };
  }
): Promise<void> {
  try {
    await tx.analytics_daily_summaries.upsert({
      ...params,
      create: {
        id: randomUUID(),
        ...params.create,
        updated_at: new Date()
      },
      update: {
        ...params.update,
        updated_at: new Date()
      }
    });
  } catch (error) {
    if (!isUnknownSummaryPlatformFieldError(error)) throw error;
    await tx.analytics_daily_summaries.upsert({
      where: params.where,
      create: {
        id: randomUUID(),
        user_id: params.create.user_id,
        release_id: params.create.release_id,
        report_date: params.create.report_date,
        total_streams: params.create.total_streams,
        total_pay_streams: params.create.total_pay_streams,
        countries_count: params.create.countries_count,
        top_country: params.create.top_country,
        releases_count: params.create.releases_count,
        updated_at: new Date()
      },
      update: {
        total_streams: params.update.total_streams,
        total_pay_streams: params.update.total_pay_streams,
        countries_count: params.update.countries_count,
        top_country: params.update.top_country,
        releases_count: params.update.releases_count,
        updated_at: new Date()
      }
    });
  }
}

function normalizeHeader(value: string): string {
  return normalizeAnalyticsPlatformHeader(value);
}

function normalizeText(value: string): string {
  return value.replace(/\uFEFF/g, "").trim();
}

function normalizeUpc(value: string): string {
  return normalizeAnalyticsUpc(normalizeText(value));
}

function normalizeCountry(value: string): string {
  const normalized = normalizeText(value).toUpperCase();
  return normalized || "UNKNOWN";
}

function normalizePlatform(value: string): string {
  return normalizeAnalyticsPlatform(normalizeText(value));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseCsvReportDate(value: string, fallback: Date): Date {
  const normalized = normalizeText(value);
  if (!normalized) return fallback;

  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!iso) return fallback;

  const parsed = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed;
}

function parseInteger(value: string): number {
  const cleaned = value.replace(/\s+/g, "").replace(",", ".").trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed));
}

function parseCsvLine(line: string, delimiter: "," | ";" = ","): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function countDelimiterOutsideQuotes(line: string, delimiter: "," | ";"): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }

  return count;
}

function detectCsvDelimiter(headerLine: string): "," | ";" {
  const commaCount = countDelimiterOutsideQuotes(headerLine, ",");
  const semicolonCount = countDelimiterOutsideQuotes(headerLine, ";");
  return semicolonCount > commaCount ? ";" : ",";
}

export function parseReportDateFromFilename(fileName: string): Date {
  const match = fileName.match(/(\d{4}-\d{2}-\d{2})_\d{2}-\d{2}-\d{2}\.csv$/i);
  if (!match) {
    throw new Error(
      "Некорректное имя файла. Ожидается формат report_summary_YYYY-MM-DD_HH-mm-ss.csv"
    );
  }

  const report_date = new Date(`${match[1]}T00:00:00.000Z`);
  if (Number.isNaN(report_date.getTime())) {
    throw new Error("Не удалось определить report_date из имени файла.");
  }

  return report_date;
}

function collapseNames(values: Set<string>): string | null {
  const normalized = Array.from(values).map((item) => item.trim()).filter(Boolean);
  if (normalized.length === 0) return null;
  if (normalized.length === 1) return normalized[0];
  return `${normalized[0]} (+${normalized.length - 1})`;
}

function parseAnalyticsCsv(csvText: string, fallbackReportDate: Date): ParsedAnalyticsCsvRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const delimiter = detectCsvDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(normalizeHeader);
  const indexMap = new Map(headers.map((header, index) => [header, index]));
  const required = [
    "track",
    "artist",
    "album",
    "country",
    "upc",
    "pay_streams",
    "streams"
  ];

  for (const name of required) {
    if (!indexMap.has(name)) {
      throw new Error(`CSV не содержит обязательный столбец: ${name}`);
    }
  }

  const rows: ParsedAnalyticsCsvRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i], delimiter);

    const read = (header: string) => {
      const index = indexMap.get(header);
      if (index == null) return "";
      return normalizeText(cells[index] ?? "");
    };

    const upc = normalizeUpc(read("upc"));
    const country = normalizeCountry(read("country"));
    const platform = normalizePlatform(read("platform"));

    rows.push({
      track: read("track"),
      artist: read("artist"),
      album: read("album"),
      country,
      platform,
      upc,
      report_date: parseCsvReportDate(read("report_date"), fallbackReportDate),
      pay_streams: parseInteger(read("pay_streams")),
      streams: parseInteger(read("streams"))
    });
  }

  return rows;
}

function groupAnalyticsRows(rows: ParsedAnalyticsCsvRow[]): GroupedAnalyticsRow[] {
  const grouped = new Map<string, GroupedAnalyticsRow>();

  for (const row of rows) {
    const key = `${row.report_date.toISOString()}::${row.upc}::${row.country}::${row.platform}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        report_date: row.report_date,
        upc: row.upc,
        country: row.country,
        platform: row.platform,
        streams: row.streams,
        pay_streams: row.pay_streams,
        trackNames: new Set(row.track ? [row.track] : []),
        artistNames: new Set(row.artist ? [row.artist] : []),
        albumNames: new Set(row.album ? [row.album] : [])
      });
      continue;
    }

    current.streams += row.streams;
    current.pay_streams += row.pay_streams;
    if (row.track) current.trackNames.add(row.track);
    if (row.artist) current.artistNames.add(row.artist);
    if (row.album) current.albumNames.add(row.album);
  }

  return Array.from(grouped.values());
}

function findTopPlatform(rows: GroupedAnalyticsRow[]): string | null {
  const map = new Map<string, number>();
  for (const row of rows) {
    const current = map.get(row.platform) ?? 0;
    map.set(row.platform, current + row.streams);
  }

  let top: string | null = null;
  let max = -1;
  for (const [platform, streams] of map.entries()) {
    if (streams > max) {
      top = platform;
      max = streams;
    }
  }
  return top;
}

function toRoundedPercent(value: number): Prisma.Decimal {
  const rounded = Number(value.toFixed(3));
  return new Prisma.Decimal(rounded);
}

const MAX_READABLE_CHANGE_PERCENT = 150;
const ANALYTICS_IMPORT_TRANSACTION_TIMEOUT_MS = 180_000;
const ANALYTICS_RECOMPUTE_TRANSACTION_TIMEOUT_MS = 300_000;

function clampReadableChangePercent(value: number): number {
  return Math.max(-MAX_READABLE_CHANGE_PERCENT, Math.min(MAX_READABLE_CHANGE_PERCENT, value));
}

function calculateChangePercent(current: number, previous: number): Prisma.Decimal | null {
  if (previous === 0) {
    if (current > 0) return null;
    return toRoundedPercent(0);
  }
  const percent = ((current - previous) / previous) * 100;
  return toRoundedPercent(clampReadableChangePercent(percent));
}

async function recomputeSummariesForReportDateTx(params: {
  tx: Prisma.TransactionClient;
  report_date: Date;
  touchedUserIds: string[];
  touchedReleaseIds: string[];
}) {
  const { tx, report_date, touchedUserIds, touchedReleaseIds } = params;
  const platformSummaryRepo = getAnalyticsPlatformSummaryRepo(tx);
  const previousReport = await tx.analytics_report_snapshots.groupBy({
    by: ["report_date"],
    where: {
      report_date: {
        lt: report_date
      }
    },
    orderBy: {
      report_date: "desc"
    },
    take: 1
  });
  const previousReportDate = previousReport[0]?.report_date ?? null;

  for (const user_id of touchedUserIds) {
    const userAggregate = await tx.analytics_report_snapshots.aggregate({
      where: { user_id, report_date },
      _sum: {
        streams: true,
        pay_streams: true
      }
    });

    const countryGroups = await tx.analytics_report_snapshots.groupBy({
      by: ["country"],
      where: { user_id, report_date },
      _sum: { streams: true },
      orderBy: {
        _sum: {
          streams: "desc"
        }
      }
    });

    const releaseGroups = await tx.analytics_report_snapshots.groupBy({
      by: ["release_id"],
      where: { user_id, report_date }
    });

    const platformGroups = await groupByPlatformSafe(tx, { user_id, report_date });

    await tx.analytics_daily_summaries.deleteMany({
      where: {
        user_id,
        report_date,
        release_id: null
      }
    });

    await createSummarySafe(tx, {
      user_id,
      release_id: null,
      report_date,
      total_streams: userAggregate._sum.streams ?? 0,
      total_pay_streams: userAggregate._sum.pay_streams ?? 0,
      countries_count: countryGroups.length,
      top_country: countryGroups[0]?.country ?? null,
      top_platform: platformGroups[0]?.platform ?? null,
      platforms_count: platformGroups.length,
      releases_count: releaseGroups.length
    });

    if (platformSummaryRepo) {
      await platformSummaryRepo.deleteMany({
        where: {
          user_id,
          report_date,
          release_id: null
        }
      });
    }

    const totalStreamsUser = userAggregate._sum.streams ?? 0;

    let previousUserPlatforms = new Map<string, number>();
    if (previousReportDate && platformSummaryRepo) {
      const previousRows = await platformSummaryRepo.findMany({
        where: {
          user_id,
          release_id: null,
          report_date: previousReportDate
        },
        select: {
          platform: true,
          streams: true
        }
      });
      previousUserPlatforms = new Map(previousRows.map((item) => [item.platform, item.streams]));
    }

    if (platformGroups.length > 0 && platformSummaryRepo) {
      await platformSummaryRepo.createMany({
        data: platformGroups.map((item) => {
          const streams = item._sum.streams ?? 0;
          const pay_streams = item._sum.pay_streams ?? 0;
          const previousStreams = previousUserPlatforms.get(item.platform ?? "Unknown") ?? 0;
          return {
            id: randomUUID(),
            user_id,
            release_id: null,
            report_date,
            platform: item.platform ?? "Unknown",
            streams,
            pay_streams,
            share_percent: toRoundedPercent(
              totalStreamsUser > 0 ? (streams / totalStreamsUser) * 100 : 0
            ),
            change_percent: calculateChangePercent(streams, previousStreams),
            updated_at: new Date()
          };
        })
      });
    }
  }

  for (const release_id of touchedReleaseIds) {
    const release = await tx.release.findUnique({
      where: { id: release_id },
      select: {
        id: true,
        userId: true
      }
    });

    if (!release) continue;

    const releaseAggregate = await tx.analytics_report_snapshots.aggregate({
      where: { release_id, report_date },
      _sum: {
        streams: true,
        pay_streams: true
      }
    });

    const countryGroups = await tx.analytics_report_snapshots.groupBy({
      by: ["country"],
      where: { release_id, report_date },
      _sum: { streams: true },
      orderBy: {
        _sum: {
          streams: "desc"
        }
      }
    });

    const platformGroups = await groupByPlatformSafe(tx, { release_id, report_date });

    await upsertSummarySafe(tx, {
      where: {
        user_id_release_id_report_date: {
          user_id: release.userId,
          release_id,
          report_date
        }
      },
      create: {
        user_id: release.userId,
        release_id,
        report_date,
        total_streams: releaseAggregate._sum.streams ?? 0,
        total_pay_streams: releaseAggregate._sum.pay_streams ?? 0,
        countries_count: countryGroups.length,
        top_country: countryGroups[0]?.country ?? null,
        top_platform: platformGroups[0]?.platform ?? null,
        platforms_count: platformGroups.length,
        releases_count: 1
      },
      update: {
        total_streams: releaseAggregate._sum.streams ?? 0,
        total_pay_streams: releaseAggregate._sum.pay_streams ?? 0,
        countries_count: countryGroups.length,
        top_country: countryGroups[0]?.country ?? null,
        top_platform: platformGroups[0]?.platform ?? null,
        platforms_count: platformGroups.length,
        releases_count: 1
      }
    });

    if (platformSummaryRepo) {
      await platformSummaryRepo.deleteMany({
        where: {
          user_id: release.userId,
          release_id,
          report_date
        }
      });
    }

    const totalStreamsRelease = releaseAggregate._sum.streams ?? 0;

    let previousReleasePlatforms = new Map<string, number>();
    if (previousReportDate && platformSummaryRepo) {
      const previousRows = await platformSummaryRepo.findMany({
        where: {
          user_id: release.userId,
          release_id,
          report_date: previousReportDate
        },
        select: {
          platform: true,
          streams: true
        }
      });
      previousReleasePlatforms = new Map(previousRows.map((item) => [item.platform, item.streams]));
    }

    if (platformGroups.length > 0 && platformSummaryRepo) {
      await platformSummaryRepo.createMany({
        data: platformGroups.map((item) => {
          const streams = item._sum.streams ?? 0;
          const pay_streams = item._sum.pay_streams ?? 0;
          const previousStreams = previousReleasePlatforms.get(item.platform ?? "Unknown") ?? 0;
          return {
            id: randomUUID(),
            user_id: release.userId,
            release_id,
            report_date,
            platform: item.platform ?? "Unknown",
            streams,
            pay_streams,
            share_percent: toRoundedPercent(
              totalStreamsRelease > 0 ? (streams / totalStreamsRelease) * 100 : 0
            ),
            change_percent: calculateChangePercent(streams, previousStreams),
            updated_at: new Date()
          };
        })
      });
    }
  }
}

export async function recomputeSummariesForReportDate(params: {
  prisma: PrismaClient;
  report_date: Date;
  touchedUserIds?: string[];
  touchedReleaseIds?: string[];
}): Promise<{ users: number; releases: number }> {
  assertAnalyticsStorageRepos(params.prisma);

  const touchedUserIds =
    params.touchedUserIds && params.touchedUserIds.length > 0
      ? Array.from(new Set(params.touchedUserIds))
      : Array.from(
          new Set(
            (
              await params.prisma.analytics_report_snapshots.findMany({
                where: { report_date: params.report_date },
                select: { user_id: true }
              })
            ).map((item) => item.user_id)
          )
        );

  const touchedReleaseIds =
    params.touchedReleaseIds && params.touchedReleaseIds.length > 0
      ? Array.from(new Set(params.touchedReleaseIds))
      : Array.from(
          new Set(
            (
              await params.prisma.analytics_report_snapshots.findMany({
                where: { report_date: params.report_date },
                select: { release_id: true }
              })
            ).map((item) => item.release_id)
          )
        );

  await params.prisma.$transaction(
    async (tx) => {
      await recomputeSummariesForReportDateTx({
        tx,
        report_date: params.report_date,
        touchedUserIds,
        touchedReleaseIds
      });
    },
    {
      maxWait: 10_000,
      timeout: ANALYTICS_RECOMPUTE_TRANSACTION_TIMEOUT_MS
    }
  );

  return {
    users: touchedUserIds.length,
    releases: touchedReleaseIds.length
  };
}

export async function importAnalyticsCsvReport(params: {
  prisma: PrismaClient;
  source_file_name: string;
  csvText: string;
  period_days?: number;
  import_job_id?: string;
}): Promise<AnalyticsImportResult> {
  assertAnalyticsStorageRepos(params.prisma);

  const isDev = process.env.NODE_ENV !== "production";
  const devLog = (...args: unknown[]) => {
    if (!isDev) return;
    // eslint-disable-next-line no-console
    console.log("[analytics-import]", ...args);
  };

  const fallbackReportDate = parseReportDateFromFilename(params.source_file_name);
  const periodDays = normalizeAnalyticsPeriodDays(params.period_days);
  const parsedRows = parseAnalyticsCsv(params.csvText, fallbackReportDate).map((row) => ({
    ...row,
    report_date: applyAnalyticsPeriodVariant(row.report_date, periodDays)
  }));
  const groupedRows = groupAnalyticsRows(parsedRows);
  const reportTimestamps = Array.from(new Set(groupedRows.map((row) => row.report_date.toISOString())));
  const reportDates = reportTimestamps.map((value) => new Date(value));

  const uniqueUpcs = Array.from(
    new Set(
      groupedRows
        .map((row) => normalizeUpc(row.upc))
        .filter(Boolean)
    )
  );

  const releases = uniqueUpcs.length
    ? await params.prisma.release.findMany({
        where: {
          upc: {
            in: uniqueUpcs
          }
        },
        select: {
          id: true,
          userId: true,
          upc: true
        },
        orderBy: {
          date: "desc"
        }
      })
    : [];

  const releasesByNormalizedUpc = new Map<string, { id: string; userId: string; upc: string | null }>();
  for (const release of releases) {
    const normalized = normalizeUpc(release.upc ?? "");
    if (!normalized) continue;
    if (!releasesByNormalizedUpc.has(normalized)) {
      releasesByNormalizedUpc.set(normalized, release);
    }
  }

  const missingExactUpcs = uniqueUpcs.filter((upc) => !releasesByNormalizedUpc.has(upc));
  if (missingExactUpcs.length > 0) {
    // Fallback path for historical UPCs that may contain hidden characters/spaces in DB.
    const fallbackReleases = await params.prisma.release.findMany({
      where: { upc: { not: null } },
      select: {
        id: true,
        userId: true,
        upc: true
      },
      orderBy: {
        date: "desc"
      }
    });

    for (const release of fallbackReleases) {
      const normalized = normalizeUpc(release.upc ?? "");
      if (!normalized) continue;
      if (!releasesByNormalizedUpc.has(normalized)) {
        releasesByNormalizedUpc.set(normalized, release);
      }
    }
  }

  const touchedUserIds = new Set<string>();
  const touchedReleaseIds = new Set<string>();
  const touchedByDate = new Map<string, { userIds: Set<string>; releaseIds: Set<string> }>();
  const platformsSet = new Set<string>();
  let matched_rows = 0;
  let unmatched_rows = 0;
  let insertedSnapshotsCount = 0;
  let rows_with_unknown_platform = 0;
  const snapshotUniqueModeRef: { current: SnapshotUniqueMode } = {
    current: "platform"
  };

  await params.prisma.$transaction(
    async (tx) => {
      const platformSummaryRepo = getAnalyticsPlatformSummaryRepo(tx);
      if (reportDates.length > 0) {
        await tx.analytics_report_snapshots.deleteMany({
          where: {
            report_date: {
              in: reportDates
            }
          }
        });
        if (platformSummaryRepo) {
          await platformSummaryRepo.deleteMany({
            where: {
              report_date: {
                in: reportDates
              }
            }
          });
        }
        await tx.unmatched_analytics_imports.deleteMany({
          where: {
            report_date: {
              in: reportDates
            }
          }
        });
        await tx.analytics_daily_summaries.deleteMany({
          where: {
            report_date: {
              in: reportDates
            }
          }
        });
      }

      const unmatchedPayload: Prisma.unmatched_analytics_importsCreateManyInput[] = [];

      for (const row of groupedRows) {
        if (!row.upc) {
          unmatched_rows += 1;
          unmatchedPayload.push({
            id: randomUUID(),
            upc: "",
            track_name: collapseNames(row.trackNames),
            artist_name: collapseNames(row.artistNames),
            album_name: collapseNames(row.albumNames),
            country: row.country,
            streams: row.streams,
            pay_streams: row.pay_streams,
            source_file_name: params.source_file_name,
            report_date: row.report_date,
            reason: "missing_upc",
            import_job_id: params.import_job_id ?? null
          });
          continue;
        }

        const csvUpc = normalizeUpc(row.upc);
        const release = releasesByNormalizedUpc.get(csvUpc);
        devLog("match-attempt", {
          csvUpc,
          foundReleaseId: release?.id ?? null,
          releaseUserId: release?.userId ?? null
        });
        if (!release) {
          unmatched_rows += 1;
          unmatchedPayload.push({
            id: randomUUID(),
            upc: csvUpc,
            track_name: collapseNames(row.trackNames),
            artist_name: collapseNames(row.artistNames),
            album_name: collapseNames(row.albumNames),
            country: row.country,
            streams: row.streams,
            pay_streams: row.pay_streams,
            source_file_name: params.source_file_name,
            report_date: row.report_date,
            reason: "release_not_found_by_upc",
            import_job_id: params.import_job_id ?? null
          });
          continue;
        }

        matched_rows += 1;
        touchedUserIds.add(release.userId);
        touchedReleaseIds.add(release.id);
        const reportTimestamp = row.report_date.toISOString();
        const touchedForDate = touchedByDate.get(reportTimestamp) ?? {
          userIds: new Set<string>(),
          releaseIds: new Set<string>()
        };
        touchedForDate.userIds.add(release.userId);
        touchedForDate.releaseIds.add(release.id);
        touchedByDate.set(reportTimestamp, touchedForDate);
        platformsSet.add(row.platform);
        if (row.platform === "Unknown") {
          rows_with_unknown_platform += 1;
        }

        await upsertAnalyticsSnapshotCompat({
          tx,
          modeRef: snapshotUniqueModeRef,
          row: {
            release_id: release.id,
            user_id: release.userId,
            upc: csvUpc,
            report_date: row.report_date,
            period_days: periodDays,
            country: row.country,
            platform: row.platform,
            streams: row.streams,
            pay_streams: row.pay_streams,
            track_name: collapseNames(row.trackNames),
            artist_name: collapseNames(row.artistNames),
            album_name: collapseNames(row.albumNames),
            source_file_name: params.source_file_name
          }
        });
        insertedSnapshotsCount += 1;
      }

      if (unmatchedPayload.length > 0) {
        await tx.unmatched_analytics_imports.createMany({
          data: unmatchedPayload
        });
      }
    },
    {
      maxWait: 10_000,
      timeout: ANALYTICS_IMPORT_TRANSACTION_TIMEOUT_MS
    }
  );

  if (touchedByDate.size > 0) {
    for (const [reportTimestamp, touched] of touchedByDate.entries()) {
      await recomputeSummariesForReportDate({
        prisma: params.prisma,
        report_date: new Date(reportTimestamp),
        touchedUserIds: Array.from(touched.userIds),
        touchedReleaseIds: Array.from(touched.releaseIds)
      });
    }
  }

  devLog("import-summary", {
    source_file_name: params.source_file_name,
    report_date: fallbackReportDate.toISOString().slice(0, 10),
    groupedRows: groupedRows.length,
    matched_rows,
    unmatched_rows,
    insertedSnapshotsCount,
    recalculatedUsersCount: touchedUserIds.size,
    recalculatedReleasesCount: touchedReleaseIds.size
  });

  return {
    source_file_name: params.source_file_name,
    report_date: fallbackReportDate.toISOString().slice(0, 10),
    totalCsvRows: parsedRows.length,
    groupedRows: groupedRows.length,
    imported_rows: matched_rows,
    matched_rows,
    unmatched_rows,
    touchedUsersCount: touchedUserIds.size,
    touchedReleasesCount: touchedReleaseIds.size,
    platforms_count: platformsSet.size,
    rows_with_unknown_platform,
    topPlatform: findTopPlatform(groupedRows)
  };
}

export async function relinkUnmatchedAnalyticsRowToRelease(params: {
  prisma: PrismaClient;
  unmatchedId: string;
  release_id: string;
  adminId: string;
}): Promise<{ ok: true; report_date: string; user_id: string; release_id: string }> {
  assertAnalyticsStorageRepos(params.prisma);

  const row = await params.prisma.unmatched_analytics_imports.findUnique({
    where: { id: params.unmatchedId }
  });

  if (!row) {
    throw new Error("Unmatched row not found");
  }

  const release = await params.prisma.release.findUnique({
    where: { id: params.release_id },
    select: {
      id: true,
      userId: true,
      upc: true
    }
  });

  if (!release) {
    throw new Error("Release not found");
  }

  const report_date = row.report_date;

  await params.prisma.$transaction(
    async (tx) => {
      const normalizedRowUpc = normalizeUpc(row.upc);
      const normalizedReleaseUpc = normalizeUpc(release.upc ?? "");

      if (normalizedRowUpc && normalizedRowUpc !== normalizedReleaseUpc) {
        await tx.release.update({
          where: { id: release.id },
          data: { upc: normalizedRowUpc }
        });
      }

      const snapshotUniqueModeRef: { current: SnapshotUniqueMode } = {
        current: "platform"
      };
      await upsertAnalyticsSnapshotCompat({
        tx,
        modeRef: snapshotUniqueModeRef,
        row: {
          release_id: release.id,
          user_id: release.userId,
          upc: normalizedRowUpc || row.upc,
          report_date,
          period_days: 30,
          country: row.country,
          platform: "Unknown",
          streams: row.streams,
          pay_streams: row.pay_streams,
          track_name: row.track_name,
          artist_name: row.artist_name,
          album_name: row.album_name,
          source_file_name: row.source_file_name
        }
      });

      await tx.unmatched_analytics_imports.update({
        where: { id: row.id },
        data: {
          resolved: true,
          resolved_at: new Date(),
          resolved_by_admin_id: params.adminId,
          resolved_release_id: release.id
        }
      });

      await recomputeSummariesForReportDateTx({
        tx,
        report_date,
        touchedUserIds: [release.userId],
        touchedReleaseIds: [release.id]
      });
    },
    {
      maxWait: 10_000,
      timeout: 120_000
    }
  );

  return {
    ok: true,
    report_date: report_date.toISOString().slice(0, 10),
    user_id: release.userId,
    release_id: release.id
  };
}
