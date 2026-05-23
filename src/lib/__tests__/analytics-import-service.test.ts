import assert from "node:assert/strict";
import test from "node:test";

import { importAnalyticsCsvReport } from "@/lib/analytics-import-service";

type SnapshotRow = {
  userId: string;
  releaseId: string;
  upc: string;
  reportDate: Date;
  periodDays: number;
  country: string;
  platform?: string;
  streams: number;
  payStreams: number;
  trackName: string | null;
  artistName: string | null;
  albumName: string | null;
  sourceFileName: string;
};

type SummaryRow = {
  userId: string;
  releaseId: string | null;
  reportDate: Date;
  totalStreams: number;
  totalPayStreams: number;
  countriesCount: number;
  topCountry: string | null;
  releasesCount: number;
};

type UnmatchedRow = {
  upc: string;
  reportDate: Date;
};

function isSameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

function createMockPrisma() {
  const releases = [
    {
      id: "rel_1",
      userId: "user_1",
      upc: "5063635661195",
      updatedAt: new Date("2026-04-01T00:00:00.000Z")
    }
  ];

  const snapshots: SnapshotRow[] = [];
  const summaries: SummaryRow[] = [];
  const unmatched: UnmatchedRow[] = [];

  const tx = {
    analyticsReportSnapshot: {
      deleteMany: async ({ where }: { where: { reportDate: Date } }) => {
        for (let i = snapshots.length - 1; i >= 0; i -= 1) {
          if (isSameDay(snapshots[i].reportDate, where.reportDate)) {
            snapshots.splice(i, 1);
          }
        }
      },
      findFirst: async ({
        where
      }: {
        where: { releaseId: string; reportDate: Date; country: string; platform?: string };
      }) => {
        const existing = snapshots.find((row) => {
          if (row.releaseId !== where.releaseId) return false;
          if (row.country !== where.country) return false;
          if (!isSameDay(row.reportDate, where.reportDate)) return false;
          if (Object.prototype.hasOwnProperty.call(where, "platform")) {
            return (row.platform ?? null) === (where.platform ?? null);
          }
          return true;
        });
        return existing ? { id: `${existing.releaseId}:${existing.country}` } : null;
      },
      create: async ({ data }: { data: SnapshotRow }) => {
        snapshots.push({ ...data });
        return data;
      },
      update: async ({
        where,
        data
      }: {
        where: { id: string };
        data: Partial<SnapshotRow> & {
          streams?: number | { increment: number };
          payStreams?: number | { increment: number };
        };
      }) => {
        const [releaseId, country] = where.id.split(":");
        const existing = snapshots.find((row) => row.releaseId === releaseId && row.country === country);
        if (!existing) throw new Error("snapshot not found");
        const streamsUpdate = data.streams as number | { increment: number } | undefined;
        if (typeof streamsUpdate === "object" && streamsUpdate && "increment" in streamsUpdate) {
          existing.streams += streamsUpdate.increment;
        } else if (typeof streamsUpdate === "number") {
          existing.streams = streamsUpdate;
        }
        const payStreamsUpdate = data.payStreams as number | { increment: number } | undefined;
        if (
          typeof payStreamsUpdate === "object" &&
          payStreamsUpdate &&
          "increment" in payStreamsUpdate
        ) {
          existing.payStreams += payStreamsUpdate.increment;
        } else if (typeof payStreamsUpdate === "number") {
          existing.payStreams = payStreamsUpdate;
        }
        if (typeof data.userId === "string") existing.userId = data.userId;
        if (typeof data.upc === "string") existing.upc = data.upc;
        if (typeof data.periodDays === "number") existing.periodDays = data.periodDays;
        if (typeof data.sourceFileName === "string") existing.sourceFileName = data.sourceFileName;
        if (typeof data.platform === "string") existing.platform = data.platform;
        if (typeof data.trackName === "string" || data.trackName === null) existing.trackName = data.trackName;
        if (typeof data.artistName === "string" || data.artistName === null) existing.artistName = data.artistName;
        if (typeof data.albumName === "string" || data.albumName === null) existing.albumName = data.albumName;
        return existing;
      },
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { releaseId_reportDate_country: { releaseId: string; reportDate: Date; country: string } };
        create: SnapshotRow;
        update: Partial<SnapshotRow>;
      }) => {
        const key = where.releaseId_reportDate_country;
        const existing = snapshots.find(
          (row) =>
            row.releaseId === key.releaseId &&
            row.country === key.country &&
            isSameDay(row.reportDate, key.reportDate)
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        snapshots.push({ ...create });
        return create;
      },
      aggregate: async ({
        where
      }: {
        where: { userId?: string; releaseId?: string; reportDate: Date };
      }) => {
        const filtered = snapshots.filter((row) => {
          if (!isSameDay(row.reportDate, where.reportDate)) return false;
          if (where.userId && row.userId !== where.userId) return false;
          if (where.releaseId && row.releaseId !== where.releaseId) return false;
          return true;
        });
        return {
          _sum: {
            streams: filtered.reduce((acc, row) => acc + row.streams, 0),
            payStreams: filtered.reduce((acc, row) => acc + row.payStreams, 0)
          }
        };
      },
      groupBy: async ({
        by,
        where
      }: {
        by: string[];
        where: { userId?: string; releaseId?: string; reportDate?: Date | { lt?: Date } };
        orderBy?: { reportDate?: "asc" | "desc" };
        take?: number;
      }) => {
        const filtered = snapshots.filter((row) => {
          if (where.reportDate instanceof Date) {
            if (!isSameDay(row.reportDate, where.reportDate)) return false;
          } else if (where.reportDate?.lt instanceof Date) {
            if (!(row.reportDate < where.reportDate.lt)) return false;
          }
          if (where.userId && row.userId !== where.userId) return false;
          if (where.releaseId && row.releaseId !== where.releaseId) return false;
          return true;
        });

        if (by.length === 1 && by[0] === "reportDate") {
          const values = Array.from(
            new Set(filtered.map((row) => row.reportDate.toISOString().slice(0, 10)))
          ).map((date) => ({
            reportDate: new Date(`${date}T00:00:00.000Z`)
          }));
          values.sort((a, b) => b.reportDate.getTime() - a.reportDate.getTime());
          return values;
        }

        if (by.length === 1 && by[0] === "releaseId") {
          const releaseIds = Array.from(new Set(filtered.map((row) => row.releaseId)));
          return releaseIds.map((releaseId) => ({ releaseId }));
        }

        if (by.length === 1 && by[0] === "country") {
          const map = new Map<string, { country: string; _sum: { streams: number; payStreams?: number } }>();
          for (const row of filtered) {
            const current = map.get(row.country) ?? { country: row.country, _sum: { streams: 0, payStreams: 0 } };
            current._sum.streams += row.streams;
            if (typeof current._sum.payStreams === "number") {
              current._sum.payStreams += row.payStreams;
            }
            map.set(row.country, current);
          }
          return Array.from(map.values()).sort((a, b) => b._sum.streams - a._sum.streams);
        }

        return [];
      }
    },
    unmatchedAnalyticsImport: {
      deleteMany: async ({ where }: { where: { reportDate: Date } }) => {
        for (let i = unmatched.length - 1; i >= 0; i -= 1) {
          if (isSameDay(unmatched[i].reportDate, where.reportDate)) {
            unmatched.splice(i, 1);
          }
        }
      },
      createMany: async ({ data }: { data: Array<{ upc: string; reportDate: Date }> }) => {
        for (const row of data) unmatched.push({ upc: row.upc, reportDate: row.reportDate });
      }
    },
    analyticsDailySummary: {
      deleteMany: async ({
        where
      }: {
        where: { reportDate?: Date; userId?: string; releaseId?: string | null };
      }) => {
        for (let i = summaries.length - 1; i >= 0; i -= 1) {
          const row = summaries[i];
          if (where.reportDate && !isSameDay(row.reportDate, where.reportDate)) continue;
          if (where.userId && row.userId !== where.userId) continue;
          if (Object.prototype.hasOwnProperty.call(where, "releaseId") && row.releaseId !== where.releaseId) continue;
          summaries.splice(i, 1);
        }
      },
      create: async ({ data }: { data: SummaryRow }) => {
        summaries.push({ ...data });
        return data;
      },
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { userId_releaseId_reportDate: { userId: string; releaseId: string; reportDate: Date } };
        create: SummaryRow;
        update: Partial<SummaryRow>;
      }) => {
        const key = where.userId_releaseId_reportDate;
        const existing = summaries.find(
          (row) =>
            row.userId === key.userId &&
            row.releaseId === key.releaseId &&
            isSameDay(row.reportDate, key.reportDate)
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        summaries.push({ ...create });
        return create;
      }
    },
    release: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const release = releases.find((row) => row.id === where.id);
        if (!release) return null;
        return { id: release.id, userId: release.userId };
      }
    }
  };

  const prisma = {
    release: {
      findMany: async ({ where }: { where: { upc?: { in?: string[]; not?: null } } }) => {
        if (where.upc?.in) {
          const set = new Set(where.upc.in);
          return releases.filter((row) => row.upc && set.has(row.upc));
        }
        return releases.filter((row) => row.upc != null);
      }
    },
    $transaction: async <T>(handler: (innerTx: typeof tx) => Promise<T>) => handler(tx)
  };

  return { prisma: prisma as never, snapshots, summaries, unmatched };
}

function csvFor(params: {
  upc: string | number;
  streamsRu: number;
  payRu: number;
  streamsUs?: number;
  payUs?: number;
}): string {
  const rows = [
    `Track A,Artist A,Album A,ru,${params.upc},${params.payRu},${params.streamsRu}`
  ];
  if (typeof params.streamsUs === "number" && typeof params.payUs === "number") {
    rows.push(`Track B,Artist A,Album A,us,${params.upc},${params.payUs},${params.streamsUs}`);
  }
  return ["track,artist,album,country,upc,pay_streams,streams", ...rows].join("\n");
}

test("import same CSV twice does not double snapshot totals", async () => {
  const { prisma, snapshots } = createMockPrisma();
  const fileName = "report_summary_2026-04-30_20-13-45.csv";
  const csv = csvFor({ upc: 5063635661195, streamsRu: 3481, payRu: 1979 });

  await importAnalyticsCsvReport({ prisma, source_file_name: fileName, csvText: csv });
  await importAnalyticsCsvReport({ prisma, source_file_name: fileName, csvText: csv });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.streams, 3481);
  assert.equal(snapshots[0]?.payStreams, 1979);
});

test("different report dates are stored independently without cross-date summation", async () => {
  const { prisma, snapshots } = createMockPrisma();
  const csvDay1 = csvFor({ upc: "5063635661195", streamsRu: 3000, payRu: 1700 });
  const csvDay2 = csvFor({ upc: "5063635661195", streamsRu: 2800, payRu: 1600 });

  await importAnalyticsCsvReport({
    prisma,
    source_file_name: "report_summary_2026-04-29_20-13-45.csv",
    csvText: csvDay1
  });
  await importAnalyticsCsvReport({
    prisma,
    source_file_name: "report_summary_2026-04-30_20-13-45.csv",
    csvText: csvDay2
  });

  assert.equal(snapshots.length, 2);
  const day1 = snapshots.find((row) => row.reportDate.toISOString().startsWith("2026-04-29"));
  const day2 = snapshots.find((row) => row.reportDate.toISOString().startsWith("2026-04-30"));
  assert.equal(day1?.streams, 3000);
  assert.equal(day2?.streams, 2800);
});

test("re-import same day overwrites values instead of accumulating", async () => {
  const { prisma, snapshots } = createMockPrisma();
  const fileName = "report_summary_2026-04-30_20-13-45.csv";

  await importAnalyticsCsvReport({
    prisma,
    source_file_name: fileName,
    csvText: csvFor({ upc: "5063635661195", streamsRu: 3000, payRu: 1700 })
  });

  await importAnalyticsCsvReport({
    prisma,
    source_file_name: fileName,
    csvText: csvFor({ upc: "5063635661195", streamsRu: 2500, payRu: 1500 })
  });

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0]?.streams, 2500);
  assert.equal(snapshots[0]?.payStreams, 1500);
});

test("daily summary is recalculated from snapshots and not accumulated", async () => {
  const { prisma, summaries } = createMockPrisma();
  const fileName = "report_summary_2026-04-30_20-13-45.csv";

  await importAnalyticsCsvReport({
    prisma,
    source_file_name: fileName,
    csvText: csvFor({
      upc: "5063635661195",
      streamsRu: 1200,
      payRu: 700,
      streamsUs: 800,
      payUs: 500
    })
  });

  await importAnalyticsCsvReport({
    prisma,
    source_file_name: fileName,
    csvText: csvFor({
      upc: "5063635661195",
      streamsRu: 1000,
      payRu: 600,
      streamsUs: 500,
      payUs: 300
    })
  });

  const releaseSummary = summaries.find(
    (row) =>
      row.releaseId === "rel_1" &&
      row.reportDate.toISOString().startsWith("2026-04-30")
  );

  assert.ok(releaseSummary);
  assert.equal(releaseSummary?.totalStreams, 1500);
  assert.equal(releaseSummary?.totalPayStreams, 900);
});
