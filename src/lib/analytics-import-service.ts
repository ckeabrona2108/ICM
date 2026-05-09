import { Prisma, type PrismaClient } from "@prisma/client";
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
  reportDate: Date;
  payStreams: number;
  streams: number;
}

interface GroupedAnalyticsRow {
  reportDate: Date;
  upc: string;
  country: string;
  platform: string;
  streams: number;
  payStreams: number;
  trackNames: Set<string>;
  artistNames: Set<string>;
  albumNames: Set<string>;
}

export interface AnalyticsImportResult {
  sourceFileName: string;
  reportDate: string;
  totalCsvRows: number;
  groupedRows: number;
  importedRows: number;
  matchedRows: number;
  unmatchedRows: number;
  touchedUsersCount: number;
  touchedReleasesCount: number;
  platformsCount: number;
  rowsWithUnknownPlatform: number;
  topPlatform: string | null;
}

interface AnalyticsPlatformSummaryRepo {
  deleteMany: (args: unknown) => Promise<unknown>;
  findMany: (args: unknown) => Promise<Array<{ platform: string; streams: number }>>;
  createMany: (args: unknown) => Promise<unknown>;
}

type SnapshotUniqueMode = "platform" | "legacy_country" | "legacy_no_platform";

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
    error.message.includes("Unknown argument `platformsCount`")
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
  const repo = (tx as { analyticsPlatformSummary?: AnalyticsPlatformSummaryRepo })
    .analyticsPlatformSummary;

  return repo ?? null;
}

async function upsertAnalyticsSnapshotCompat(params: {
  tx: Prisma.TransactionClient;
  modeRef: { current: SnapshotUniqueMode };
  row: {
    releaseId: string;
    userId: string;
    upc: string;
    reportDate: Date;
    periodDays: number;
    country: string;
    platform: string;
    streams: number;
    payStreams: number;
    trackName: string | null;
    artistName: string | null;
    albumName: string | null;
    sourceFileName: string;
  };
}): Promise<void> {
  const { tx, modeRef, row } = params;

  const whereByCountry = {
    releaseId: row.releaseId,
    reportDate: row.reportDate,
    country: row.country
  };
  const whereByCountryPlatform = {
    ...whereByCountry,
    platform: row.platform
  };

  const findExisting = async (): Promise<{ id: string } | null> => {
    if (modeRef.current === "platform") {
      try {
        return await tx.analyticsReportSnapshot.findFirst({
          where: whereByCountryPlatform,
          select: { id: true }
        });
      } catch (error) {
        if (!isUnknownPlatformFieldError(error)) throw error;
        modeRef.current = "legacy_no_platform";
      }
    }

    return tx.analyticsReportSnapshot.findFirst({
      where: whereByCountry,
      select: { id: true }
    });
  };

  const createWithPlatform = async () => {
    await tx.analyticsReportSnapshot.create({
      data: {
        userId: row.userId,
        releaseId: row.releaseId,
        upc: row.upc,
        reportDate: row.reportDate,
        periodDays: row.periodDays,
        country: row.country,
        platform: row.platform,
        streams: row.streams,
        payStreams: row.payStreams,
        trackName: row.trackName,
        artistName: row.artistName,
        albumName: row.albumName,
        sourceFileName: row.sourceFileName
      }
    });
  };

  const createNoPlatform = async () => {
    await tx.analyticsReportSnapshot.create({
      data: {
        userId: row.userId,
        releaseId: row.releaseId,
        upc: row.upc,
        reportDate: row.reportDate,
        periodDays: row.periodDays,
        country: row.country,
        streams: row.streams,
        payStreams: row.payStreams,
        trackName: row.trackName,
        artistName: row.artistName,
        albumName: row.albumName,
        sourceFileName: row.sourceFileName
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
      await tx.analyticsReportSnapshot.update({
        where: { id },
        data: {
          userId: row.userId,
          upc: row.upc,
          periodDays: row.periodDays,
          streams: { increment: row.streams },
          payStreams: { increment: row.payStreams },
          sourceFileName: row.sourceFileName
        }
      });
      return;
    }

    if (modeRef.current === "legacy_country") {
      try {
        await tx.analyticsReportSnapshot.update({
          where: { id },
          data: {
            userId: row.userId,
            upc: row.upc,
            periodDays: row.periodDays,
            platform: row.platform,
            streams: { increment: row.streams },
            payStreams: { increment: row.payStreams },
            sourceFileName: row.sourceFileName
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
      await tx.analyticsReportSnapshot.update({
        where: { id },
        data: {
          userId: row.userId,
          upc: row.upc,
          periodDays: row.periodDays,
          platform: row.platform,
          streams: row.streams,
          payStreams: row.payStreams,
          trackName: row.trackName,
          artistName: row.artistName,
          albumName: row.albumName,
          sourceFileName: row.sourceFileName
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
  where: { userId?: string; releaseId?: string; reportDate: Date }
): Promise<Array<{ platform: string | null; _sum: { streams: number | null; payStreams: number | null } }>> {
  try {
    const snapshotsRepo = tx.analyticsReportSnapshot as unknown as {
      groupBy: (args: unknown) => Promise<unknown>;
    };
    return (await snapshotsRepo.groupBy({
      by: ["platform"],
      where,
      _sum: { streams: true, payStreams: true },
      orderBy: {
        _sum: {
          streams: "desc"
        }
      }
    })) as Array<{ platform: string | null; _sum: { streams: number | null; payStreams: number | null } }>;
  } catch (error) {
    if (!isUnknownPlatformFieldError(error)) throw error;
  }

  const conditions: Prisma.Sql[] = [Prisma.sql`"report_date" = ${where.reportDate}`];
  if (where.userId) conditions.push(Prisma.sql`"user_id" = ${where.userId}`);
  if (where.releaseId) conditions.push(Prisma.sql`"release_id" = ${where.releaseId}`);

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
        payStreams: toNumber(row.pay_streams)
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
    userId: string;
    releaseId: string | null;
    reportDate: Date;
    totalStreams: number;
    totalPayStreams: number;
    countriesCount: number;
    topCountry: string | null;
    topPlatform: string | null;
    platformsCount: number;
    releasesCount: number;
  }
): Promise<void> {
  try {
    await tx.analyticsDailySummary.create({ data });
  } catch (error) {
    if (!isUnknownSummaryPlatformFieldError(error)) throw error;
    await tx.analyticsDailySummary.create({
      data: {
        userId: data.userId,
        releaseId: data.releaseId,
        reportDate: data.reportDate,
        totalStreams: data.totalStreams,
        totalPayStreams: data.totalPayStreams,
        countriesCount: data.countriesCount,
        topCountry: data.topCountry,
        releasesCount: data.releasesCount
      }
    });
  }
}

async function upsertSummarySafe(
  tx: Prisma.TransactionClient,
  params: {
    where: {
      userId_releaseId_reportDate: {
        userId: string;
        releaseId: string;
        reportDate: Date;
      };
    };
    create: {
      userId: string;
      releaseId: string;
      reportDate: Date;
      totalStreams: number;
      totalPayStreams: number;
      countriesCount: number;
      topCountry: string | null;
      topPlatform: string | null;
      platformsCount: number;
      releasesCount: number;
    };
    update: {
      totalStreams: number;
      totalPayStreams: number;
      countriesCount: number;
      topCountry: string | null;
      topPlatform: string | null;
      platformsCount: number;
      releasesCount: number;
    };
  }
): Promise<void> {
  try {
    await tx.analyticsDailySummary.upsert(params);
  } catch (error) {
    if (!isUnknownSummaryPlatformFieldError(error)) throw error;
    await tx.analyticsDailySummary.upsert({
      where: params.where,
      create: {
        userId: params.create.userId,
        releaseId: params.create.releaseId,
        reportDate: params.create.reportDate,
        totalStreams: params.create.totalStreams,
        totalPayStreams: params.create.totalPayStreams,
        countriesCount: params.create.countriesCount,
        topCountry: params.create.topCountry,
        releasesCount: params.create.releasesCount
      },
      update: {
        totalStreams: params.update.totalStreams,
        totalPayStreams: params.update.totalPayStreams,
        countriesCount: params.update.countriesCount,
        topCountry: params.update.topCountry,
        releasesCount: params.update.releasesCount
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

  const reportDate = new Date(`${match[1]}T00:00:00.000Z`);
  if (Number.isNaN(reportDate.getTime())) {
    throw new Error("Не удалось определить report_date из имени файла.");
  }

  return reportDate;
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
      reportDate: parseCsvReportDate(read("report_date"), fallbackReportDate),
      payStreams: parseInteger(read("pay_streams")),
      streams: parseInteger(read("streams"))
    });
  }

  return rows;
}

function groupAnalyticsRows(rows: ParsedAnalyticsCsvRow[]): GroupedAnalyticsRow[] {
  const grouped = new Map<string, GroupedAnalyticsRow>();

  for (const row of rows) {
    const key = `${toDateKey(row.reportDate)}::${row.upc}::${row.country}::${row.platform}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        reportDate: row.reportDate,
        upc: row.upc,
        country: row.country,
        platform: row.platform,
        streams: row.streams,
        payStreams: row.payStreams,
        trackNames: new Set(row.track ? [row.track] : []),
        artistNames: new Set(row.artist ? [row.artist] : []),
        albumNames: new Set(row.album ? [row.album] : [])
      });
      continue;
    }

    current.streams += row.streams;
    current.payStreams += row.payStreams;
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
  reportDate: Date;
  touchedUserIds: string[];
  touchedReleaseIds: string[];
}) {
  const { tx, reportDate, touchedUserIds, touchedReleaseIds } = params;
  const platformSummaryRepo = getAnalyticsPlatformSummaryRepo(tx);
  const previousReport = await tx.analyticsReportSnapshot.groupBy({
    by: ["reportDate"],
    where: {
      reportDate: {
        lt: reportDate
      }
    },
    orderBy: {
      reportDate: "desc"
    },
    take: 1
  });
  const previousReportDate = previousReport[0]?.reportDate ?? null;

  for (const userId of touchedUserIds) {
    const userAggregate = await tx.analyticsReportSnapshot.aggregate({
      where: { userId, reportDate },
      _sum: {
        streams: true,
        payStreams: true
      }
    });

    const countryGroups = await tx.analyticsReportSnapshot.groupBy({
      by: ["country"],
      where: { userId, reportDate },
      _sum: { streams: true },
      orderBy: {
        _sum: {
          streams: "desc"
        }
      }
    });

    const releaseGroups = await tx.analyticsReportSnapshot.groupBy({
      by: ["releaseId"],
      where: { userId, reportDate }
    });

    const platformGroups = await groupByPlatformSafe(tx, { userId, reportDate });

    await tx.analyticsDailySummary.deleteMany({
      where: {
        userId,
        reportDate,
        releaseId: null
      }
    });

    await createSummarySafe(tx, {
      userId,
      releaseId: null,
      reportDate,
      totalStreams: userAggregate._sum.streams ?? 0,
      totalPayStreams: userAggregate._sum.payStreams ?? 0,
      countriesCount: countryGroups.length,
      topCountry: countryGroups[0]?.country ?? null,
      topPlatform: platformGroups[0]?.platform ?? null,
      platformsCount: platformGroups.length,
      releasesCount: releaseGroups.length
    });

    if (platformSummaryRepo) {
      await platformSummaryRepo.deleteMany({
        where: {
          userId,
          reportDate,
          releaseId: null
        }
      });
    }

    const totalStreamsUser = userAggregate._sum.streams ?? 0;

    let previousUserPlatforms = new Map<string, number>();
    if (previousReportDate && platformSummaryRepo) {
      const previousRows = await platformSummaryRepo.findMany({
        where: {
          userId,
          releaseId: null,
          reportDate: previousReportDate
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
          const payStreams = item._sum.payStreams ?? 0;
          const previousStreams = previousUserPlatforms.get(item.platform ?? "Unknown") ?? 0;
          return {
            userId,
            releaseId: null,
            reportDate,
            platform: item.platform ?? "Unknown",
            streams,
            payStreams,
            sharePercent: toRoundedPercent(
              totalStreamsUser > 0 ? (streams / totalStreamsUser) * 100 : 0
            ),
            changePercent: calculateChangePercent(streams, previousStreams)
          };
        })
      });
    }
  }

  for (const releaseId of touchedReleaseIds) {
    const release = await tx.release.findUnique({
      where: { id: releaseId },
      select: {
        id: true,
        userId: true
      }
    });

    if (!release) continue;

    const releaseAggregate = await tx.analyticsReportSnapshot.aggregate({
      where: { releaseId, reportDate },
      _sum: {
        streams: true,
        payStreams: true
      }
    });

    const countryGroups = await tx.analyticsReportSnapshot.groupBy({
      by: ["country"],
      where: { releaseId, reportDate },
      _sum: { streams: true },
      orderBy: {
        _sum: {
          streams: "desc"
        }
      }
    });

    const platformGroups = await groupByPlatformSafe(tx, { releaseId, reportDate });

    await upsertSummarySafe(tx, {
      where: {
        userId_releaseId_reportDate: {
          userId: release.userId,
          releaseId,
          reportDate
        }
      },
      create: {
        userId: release.userId,
        releaseId,
        reportDate,
        totalStreams: releaseAggregate._sum.streams ?? 0,
        totalPayStreams: releaseAggregate._sum.payStreams ?? 0,
        countriesCount: countryGroups.length,
        topCountry: countryGroups[0]?.country ?? null,
        topPlatform: platformGroups[0]?.platform ?? null,
        platformsCount: platformGroups.length,
        releasesCount: 1
      },
      update: {
        totalStreams: releaseAggregate._sum.streams ?? 0,
        totalPayStreams: releaseAggregate._sum.payStreams ?? 0,
        countriesCount: countryGroups.length,
        topCountry: countryGroups[0]?.country ?? null,
        topPlatform: platformGroups[0]?.platform ?? null,
        platformsCount: platformGroups.length,
        releasesCount: 1
      }
    });

    if (platformSummaryRepo) {
      await platformSummaryRepo.deleteMany({
        where: {
          userId: release.userId,
          releaseId,
          reportDate
        }
      });
    }

    const totalStreamsRelease = releaseAggregate._sum.streams ?? 0;

    let previousReleasePlatforms = new Map<string, number>();
    if (previousReportDate && platformSummaryRepo) {
      const previousRows = await platformSummaryRepo.findMany({
        where: {
          userId: release.userId,
          releaseId,
          reportDate: previousReportDate
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
          const payStreams = item._sum.payStreams ?? 0;
          const previousStreams = previousReleasePlatforms.get(item.platform ?? "Unknown") ?? 0;
          return {
            userId: release.userId,
            releaseId,
            reportDate,
            platform: item.platform ?? "Unknown",
            streams,
            payStreams,
            sharePercent: toRoundedPercent(
              totalStreamsRelease > 0 ? (streams / totalStreamsRelease) * 100 : 0
            ),
            changePercent: calculateChangePercent(streams, previousStreams)
          };
        })
      });
    }
  }
}

export async function recomputeSummariesForReportDate(params: {
  prisma: PrismaClient;
  reportDate: Date;
  touchedUserIds?: string[];
  touchedReleaseIds?: string[];
}): Promise<{ users: number; releases: number }> {
  const touchedUserIds =
    params.touchedUserIds && params.touchedUserIds.length > 0
      ? Array.from(new Set(params.touchedUserIds))
      : Array.from(
          new Set(
            (
              await params.prisma.analyticsReportSnapshot.findMany({
                where: { reportDate: params.reportDate },
                select: { userId: true }
              })
            ).map((item) => item.userId)
          )
        );

  const touchedReleaseIds =
    params.touchedReleaseIds && params.touchedReleaseIds.length > 0
      ? Array.from(new Set(params.touchedReleaseIds))
      : Array.from(
          new Set(
            (
              await params.prisma.analyticsReportSnapshot.findMany({
                where: { reportDate: params.reportDate },
                select: { releaseId: true }
              })
            ).map((item) => item.releaseId)
          )
        );

  await params.prisma.$transaction(
    async (tx) => {
      await recomputeSummariesForReportDateTx({
        tx,
        reportDate: params.reportDate,
        touchedUserIds,
        touchedReleaseIds
      });
    },
    {
      maxWait: 10_000,
      timeout: 120_000
    }
  );

  return {
    users: touchedUserIds.length,
    releases: touchedReleaseIds.length
  };
}

export async function importAnalyticsCsvReport(params: {
  prisma: PrismaClient;
  sourceFileName: string;
  csvText: string;
  periodDays?: number;
  importJobId?: string;
}): Promise<AnalyticsImportResult> {
  const isDev = process.env.NODE_ENV !== "production";
  const devLog = (...args: unknown[]) => {
    if (!isDev) return;
    // eslint-disable-next-line no-console
    console.log("[analytics-import]", ...args);
  };

  const fallbackReportDate = parseReportDateFromFilename(params.sourceFileName);
  const parsedRows = parseAnalyticsCsv(params.csvText, fallbackReportDate);
  const groupedRows = groupAnalyticsRows(parsedRows);
  const reportDateKeys = Array.from(new Set(groupedRows.map((row) => toDateKey(row.reportDate))));
  const reportDates = reportDateKeys.map((key) => new Date(`${key}T00:00:00.000Z`));

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
          updatedAt: "desc"
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
        updatedAt: "desc"
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
  let matchedRows = 0;
  let unmatchedRows = 0;
  let insertedSnapshotsCount = 0;
  let rowsWithUnknownPlatform = 0;
  const snapshotUniqueModeRef: { current: SnapshotUniqueMode } = {
    current: "platform"
  };

  await params.prisma.$transaction(
    async (tx) => {
      const platformSummaryRepo = getAnalyticsPlatformSummaryRepo(tx);
      if (reportDates.length > 0) {
        await tx.analyticsReportSnapshot.deleteMany({
          where: {
            reportDate: {
              in: reportDates
            }
          }
        });
        if (platformSummaryRepo) {
          await platformSummaryRepo.deleteMany({
            where: {
              reportDate: {
                in: reportDates
              }
            }
          });
        }
        await tx.unmatchedAnalyticsImport.deleteMany({
          where: {
            reportDate: {
              in: reportDates
            }
          }
        });
        await tx.analyticsDailySummary.deleteMany({
          where: {
            reportDate: {
              in: reportDates
            }
          }
        });
      }

      const unmatchedPayload: Prisma.UnmatchedAnalyticsImportCreateManyInput[] = [];

      for (const row of groupedRows) {
        if (!row.upc) {
          unmatchedRows += 1;
          unmatchedPayload.push({
            upc: "",
            trackName: collapseNames(row.trackNames),
            artistName: collapseNames(row.artistNames),
            albumName: collapseNames(row.albumNames),
            country: row.country,
            streams: row.streams,
            payStreams: row.payStreams,
            sourceFileName: params.sourceFileName,
            reportDate: row.reportDate,
            reason: "missing_upc",
            importJobId: params.importJobId ?? null
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
          unmatchedRows += 1;
          unmatchedPayload.push({
            upc: csvUpc,
            trackName: collapseNames(row.trackNames),
            artistName: collapseNames(row.artistNames),
            albumName: collapseNames(row.albumNames),
            country: row.country,
            streams: row.streams,
            payStreams: row.payStreams,
            sourceFileName: params.sourceFileName,
            reportDate: row.reportDate,
            reason: "release_not_found_by_upc",
            importJobId: params.importJobId ?? null
          });
          continue;
        }

        matchedRows += 1;
        touchedUserIds.add(release.userId);
        touchedReleaseIds.add(release.id);
        const dateKey = toDateKey(row.reportDate);
        const touchedForDate = touchedByDate.get(dateKey) ?? {
          userIds: new Set<string>(),
          releaseIds: new Set<string>()
        };
        touchedForDate.userIds.add(release.userId);
        touchedForDate.releaseIds.add(release.id);
        touchedByDate.set(dateKey, touchedForDate);
        platformsSet.add(row.platform);
        if (row.platform === "Unknown") {
          rowsWithUnknownPlatform += 1;
        }

        await upsertAnalyticsSnapshotCompat({
          tx,
          modeRef: snapshotUniqueModeRef,
          row: {
            releaseId: release.id,
            userId: release.userId,
            upc: csvUpc,
            reportDate: row.reportDate,
            periodDays: Math.max(1, Math.floor(params.periodDays ?? 30)),
            country: row.country,
            platform: row.platform,
            streams: row.streams,
            payStreams: row.payStreams,
            trackName: collapseNames(row.trackNames),
            artistName: collapseNames(row.artistNames),
            albumName: collapseNames(row.albumNames),
            sourceFileName: params.sourceFileName
          }
        });
        insertedSnapshotsCount += 1;
      }

      if (unmatchedPayload.length > 0) {
        await tx.unmatchedAnalyticsImport.createMany({
          data: unmatchedPayload
        });
      }

      if (touchedByDate.size > 0) {
        for (const [dateKey, touched] of touchedByDate.entries()) {
          await recomputeSummariesForReportDateTx({
            tx,
            reportDate: new Date(`${dateKey}T00:00:00.000Z`),
            touchedUserIds: Array.from(touched.userIds),
            touchedReleaseIds: Array.from(touched.releaseIds)
          });
        }
      }
    },
    {
      maxWait: 10_000,
      timeout: 120_000
    }
  );

  devLog("import-summary", {
    sourceFileName: params.sourceFileName,
    reportDate: fallbackReportDate.toISOString().slice(0, 10),
    groupedRows: groupedRows.length,
    matchedRows,
    unmatchedRows,
    insertedSnapshotsCount,
    recalculatedUsersCount: touchedUserIds.size,
    recalculatedReleasesCount: touchedReleaseIds.size
  });

  return {
    sourceFileName: params.sourceFileName,
    reportDate: fallbackReportDate.toISOString().slice(0, 10),
    totalCsvRows: parsedRows.length,
    groupedRows: groupedRows.length,
    importedRows: matchedRows,
    matchedRows,
    unmatchedRows,
    touchedUsersCount: touchedUserIds.size,
    touchedReleasesCount: touchedReleaseIds.size,
    platformsCount: platformsSet.size,
    rowsWithUnknownPlatform,
    topPlatform: findTopPlatform(groupedRows)
  };
}

export async function relinkUnmatchedAnalyticsRowToRelease(params: {
  prisma: PrismaClient;
  unmatchedId: string;
  releaseId: string;
  adminId: string;
}): Promise<{ ok: true; reportDate: string; userId: string; releaseId: string }> {
  const row = await params.prisma.unmatchedAnalyticsImport.findUnique({
    where: { id: params.unmatchedId }
  });

  if (!row) {
    throw new Error("Unmatched row not found");
  }

  const release = await params.prisma.release.findUnique({
    where: { id: params.releaseId },
    select: {
      id: true,
      userId: true,
      upc: true
    }
  });

  if (!release) {
    throw new Error("Release not found");
  }

  const reportDate = row.reportDate;

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
          releaseId: release.id,
          userId: release.userId,
          upc: normalizedRowUpc || row.upc,
          reportDate,
          periodDays: 30,
          country: row.country,
          platform: "Unknown",
          streams: row.streams,
          payStreams: row.payStreams,
          trackName: row.trackName,
          artistName: row.artistName,
          albumName: row.albumName,
          sourceFileName: row.sourceFileName
        }
      });

      await tx.unmatchedAnalyticsImport.update({
        where: { id: row.id },
        data: {
          resolved: true,
          resolvedAt: new Date(),
          resolvedByAdminId: params.adminId,
          resolvedReleaseId: release.id
        }
      });

      await recomputeSummariesForReportDateTx({
        tx,
        reportDate,
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
    reportDate: reportDate.toISOString().slice(0, 10),
    userId: release.userId,
    releaseId: release.id
  };
}
