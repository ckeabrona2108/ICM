import assert from "node:assert/strict";
import test from "node:test";

import { getAnalyticsOverview } from "@/lib/analytics-query-service";

test("getAnalyticsOverview falls back to snapshots and builds platforms chart", async () => {
  const latestDate = new Date("2026-04-30T00:00:00.000Z");
  const previousDate = new Date("2026-04-29T00:00:00.000Z");

  const prisma = {
    release: {
      findMany: async () => [{ id: "release_1" }]
    },
    analytics_report_snapshots: {
      groupBy: async (args: { by: string[]; take?: number }) => {
        if (args.by.length === 1 && args.by[0] === "report_date" && args.take === 2) {
          return [
            {
              report_date: latestDate,
              _sum: { streams: 3628, pay_streams: 2065 }
            },
            {
              report_date: previousDate,
              _sum: { streams: 3000, pay_streams: 1800 }
            }
          ];
        }

        if (args.by.length === 1 && args.by[0] === "report_date") {
          return [
            {
              report_date: previousDate,
              _sum: { streams: 3000, pay_streams: 1800 }
            },
            {
              report_date: latestDate,
              _sum: { streams: 3628, pay_streams: 2065 }
            }
          ];
        }

        if (args.by.includes("report_date") && args.by.includes("platform")) {
          return [
            {
              report_date: previousDate,
              platform: "Spotify",
              _sum: { streams: 2000, pay_streams: 1200 }
            },
            {
              report_date: previousDate,
              platform: "Apple Music",
              _sum: { streams: 1000, pay_streams: 600 }
            },
            {
              report_date: latestDate,
              platform: "Spotify",
              _sum: { streams: 2400, pay_streams: 1400 }
            },
            {
              report_date: latestDate,
              platform: "Apple Music",
              _sum: { streams: 1228, pay_streams: 665 }
            }
          ];
        }

        if (args.by.length === 1 && args.by[0] === "platform") {
          return [
            {
              platform: "Spotify",
              _sum: { streams: 4400, pay_streams: 2600 }
            },
            {
              platform: "Apple Music",
              _sum: { streams: 2228, pay_streams: 1265 }
            }
          ];
        }

        throw new Error(`Unexpected groupBy call: ${JSON.stringify(args)}`);
      }
    }
  } as never;

  const result = await getAnalyticsOverview(prisma, {
    user_id: "user_1",
    release_id: "release_1",
    days: 30
  });

  assert.equal(result.totalStreams, 6628);
  assert.equal(result.totalPayStreams, 3865);
  assert.equal(result.latestReportDate, "2026-04-30");
  assert.equal(result.chart.length, 2);
  assert.equal(result.chart[1]?.streams, 3628);
  assert.equal(result.platformsChart.length, 2);
  assert.equal(result.platformsChart[1]?.values[0]?.platform, "Spotify");
  assert.equal(result.platformsChart[1]?.values[0]?.streams, 2400);
});
