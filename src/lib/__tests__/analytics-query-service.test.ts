import assert from "node:assert/strict";
import test from "node:test";

import { getAnalyticsOverview } from "@/lib/analytics-query-service";

test("getAnalyticsOverview falls back to snapshots when summary rows are missing", async () => {
  const latestDate = new Date("2026-04-30T00:00:00.000Z");
  const previousDate = new Date("2026-04-29T00:00:00.000Z");

  const prisma = {
    analyticsDailySummary: {
      findMany: async () => []
    },
    analyticsReportSnapshot: {
      groupBy: async (args: { take?: number; orderBy?: unknown }) => {
        if (args.take === 2) {
          return [
            {
              reportDate: latestDate,
              _sum: { streams: 3628, payStreams: 2065 }
            },
            {
              reportDate: previousDate,
              _sum: { streams: 3000, payStreams: 1800 }
            }
          ];
        }

        return [
          {
            reportDate: previousDate,
            _sum: { streams: 3000, payStreams: 1800 }
          },
          {
            reportDate: latestDate,
            _sum: { streams: 3628, payStreams: 2065 }
          }
        ];
      }
    }
  } as never;

  const result = await getAnalyticsOverview(prisma, {
    userId: "user_1",
    releaseId: "release_1",
    days: 30
  });

  assert.equal(result.totalStreams, 3628);
  assert.equal(result.totalPayStreams, 2065);
  assert.equal(result.latestReportDate, "2026-04-30");
  assert.equal(result.chart.length, 2);
  assert.equal(result.chart[1]?.streams, 3628);
});

