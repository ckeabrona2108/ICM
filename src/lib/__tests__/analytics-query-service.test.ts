import assert from "node:assert/strict";
import test from "node:test";

import { getAnalyticsOverview, listAnalyticsReleases } from "@/lib/analytics-query-service";

test("getAnalyticsOverview falls back to snapshots and builds platforms chart", async () => {
  const latestDate = new Date("2026-04-30T00:00:00.000Z");
  const previousDate = new Date("2026-04-29T00:00:00.000Z");

  const prisma = {
    release: {
      findMany: async () => [
        {
          id: "release_1",
          status: "approved",
          confirmed: true,
          upc: "5063635661195",
          roles: {}
        }
      ]
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

test("getAnalyticsOverview treats lifecycle-approved releases as visible even when legacy status is moderating", async () => {
  const latestDate = new Date("2026-07-12T18:00:00.000Z");
  const previousDate = new Date("2026-07-11T18:00:00.000Z");

  const prisma = {
    release: {
      findMany: async () => [
        {
          id: "release_1",
          status: "moderating",
          confirmed: true,
          upc: "5063635044004",
          roles: { lifecycleState: "approved" }
        }
      ]
    },
    analytics_report_snapshots: {
      groupBy: async (args: { by: string[]; take?: number }) => {
        if (args.by.length === 1 && args.by[0] === "report_date" && args.take === 2) {
          return [
            { report_date: latestDate, _sum: { streams: 1200, pay_streams: 700 } },
            { report_date: previousDate, _sum: { streams: 1000, pay_streams: 600 } }
          ];
        }

        if (args.by.length === 1 && args.by[0] === "report_date") {
          return [
            { report_date: previousDate, _sum: { streams: 1000, pay_streams: 600 } },
            { report_date: latestDate, _sum: { streams: 1200, pay_streams: 700 } }
          ];
        }

        if (args.by.length === 1 && args.by[0] === "platform") {
          return [{ platform: "Yandex", _sum: { streams: 2200, pay_streams: 1300 } }];
        }

        if (args.by.includes("report_date") && args.by.includes("platform")) {
          return [
            { report_date: previousDate, platform: "Yandex", _sum: { streams: 1000, pay_streams: 600 } },
            { report_date: latestDate, platform: "Yandex", _sum: { streams: 1200, pay_streams: 700 } }
          ];
        }

        throw new Error(`Unexpected groupBy call: ${JSON.stringify(args)}`);
      }
    }
  } as never;

  const result = await getAnalyticsOverview(prisma, {
    user_id: "user_1",
    days: 365
  });

  assert.equal(result.totalStreams, 2200);
  assert.equal(result.totalPayStreams, 1300);
  assert.equal(result.latestReportDate, "2026-07-12");
  assert.equal(result.platformsBreakdown[0]?.platform, "Yandex");
});

test("analytics stays visible when lifecycle is not approved but snapshots already exist", async () => {
  const latestDate = new Date("2026-07-12T18:00:00.000Z");
  const previousDate = new Date("2026-07-11T18:00:00.000Z");

  const prisma = {
    release: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        if (args?.where?.id?.in) {
          return [
            {
              id: "release_1",
              title: "Snapshot-backed release",
              upc: "5063635044004",
              user: { name: "Artist" }
            }
          ];
        }

        return [
          {
            id: "release_1",
            status: "moderating",
            confirmed: false,
            upc: "5063635044004",
            roles: { lifecycleState: "moderation" }
          }
        ];
      }
    },
    analytics_report_snapshots: {
      groupBy: async (args: { by: string[]; take?: number; _sum?: { streams?: boolean; pay_streams?: boolean } }) => {
        if (args.by.length === 1 && args.by[0] === "release_id") {
          if (args._sum) {
            return [{ release_id: "release_1", _sum: { streams: 2200, pay_streams: 1300 } }];
          }
          return [{ release_id: "release_1" }];
        }

        if (args.by.length === 1 && args.by[0] === "report_date" && args.take === 2) {
          return [
            { report_date: latestDate, _sum: { streams: 1200, pay_streams: 700 } },
            { report_date: previousDate, _sum: { streams: 1000, pay_streams: 600 } }
          ];
        }

        if (args.by.length === 1 && args.by[0] === "report_date") {
          return [
            { report_date: previousDate, _sum: { streams: 1000, pay_streams: 600 } },
            { report_date: latestDate, _sum: { streams: 1200, pay_streams: 700 } }
          ];
        }

        if (args.by.length === 1 && args.by[0] === "platform") {
          return [{ platform: "Yandex", _sum: { streams: 2200, pay_streams: 1300 } }];
        }

        if (args.by.includes("report_date") && args.by.includes("platform")) {
          return [
            { report_date: previousDate, platform: "Yandex", _sum: { streams: 1000, pay_streams: 600 } },
            { report_date: latestDate, platform: "Yandex", _sum: { streams: 1200, pay_streams: 700 } }
          ];
        }

        throw new Error(`Unexpected groupBy call: ${JSON.stringify(args)}`);
      }
    }
  } as never;

  const overview = await getAnalyticsOverview(prisma, {
    user_id: "user_1",
    days: 365
  });
  const releases = await listAnalyticsReleases(prisma, {
    user_id: "user_1",
    days: 365
  });

  assert.equal(overview.totalStreams, 2200);
  assert.equal(overview.totalPayStreams, 1300);
  assert.equal(releases.length, 1);
  assert.equal(releases[0]?.release_id, "release_1");
});

test("listAnalyticsReleases keeps releases without data for the selected period visible", async () => {
  const prisma = {
    release: {
      findMany: async (args?: {
        where?: { id?: { in?: string[] } };
      }) => {
        if (args?.where?.id?.in) {
          return [
            {
              id: "release_year",
              title: "Year Release",
              upc: "5063635000001",
              user: { name: "Artist" }
            },
            {
              id: "release_30",
              title: "Thirty Release",
              upc: "5063635000002",
              user: { name: "Artist" }
            }
          ];
        }

        return [
          {
            id: "release_year",
            status: "approved",
            confirmed: true,
            upc: "5063635000001",
            roles: {}
          },
          {
            id: "release_30",
            status: "approved",
            confirmed: true,
            upc: "5063635000002",
            roles: {}
          }
        ];
      }
    },
    analytics_report_snapshots: {
      groupBy: async () => [
        {
          release_id: "release_year",
          _sum: { streams: 4200, pay_streams: 1900 }
        }
      ]
    }
  } as never;

  const result = await listAnalyticsReleases(prisma, {
    user_id: "user_1",
    days: 365
  });

  assert.equal(result.length, 2);
  assert.equal(result[0]?.release_id, "release_year");
  assert.equal(result[0]?.streams, 4200);
  assert.equal(result[1]?.release_id, "release_30");
  assert.equal(result[1]?.streams, 0);
  assert.equal(result[1]?.pay_streams, 0);
});

test("analytics queries fall back to legacy period-hour snapshots when period_days does not match", async () => {
  const latestDate = new Date("2026-07-12T18:00:00.000Z");
  const previousDate = new Date("2026-07-11T18:00:00.000Z");
  let rawCall = 0;

  const prisma = {
    release: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        if (args?.where?.id?.in) {
          return [
            {
              id: "release_year",
              title: "Legacy Year Release",
              upc: "5063635000018",
              user: { name: "Artist" }
            }
          ];
        }

        return [
          {
            id: "release_year",
            status: "approved",
            confirmed: true,
            upc: "5063635000018",
            roles: {}
          }
        ];
      },
      findFirst: async () => ({
        id: "release_year",
        title: "Legacy Year Release",
        upc: "5063635000018",
        status: "approved",
        confirmed: true,
        roles: {},
        user: { name: "Artist" }
      })
    },
    analytics_report_snapshots: {
      groupBy: async (args: { by: string[]; where?: { period_days?: number } }) => {
        if (args.where?.period_days === 365) {
          return [];
        }
        throw new Error(`Unexpected groupBy call: ${JSON.stringify(args)}`);
      }
    },
    $queryRaw: async (_sql: unknown) => {
      rawCall += 1;
      if (rawCall === 1) {
        return [
          { report_date: latestDate, streams: 1600, pay_streams: 900 },
          { report_date: previousDate, streams: 1100, pay_streams: 700 }
        ];
      }
      if (rawCall === 2) {
        return [
          { report_date: previousDate, streams: 1100, pay_streams: 700 },
          { report_date: latestDate, streams: 1600, pay_streams: 900 }
        ];
      }
      if (rawCall === 3) {
        return [{ release_id: "release_year", _sum_streams: 2700, _sum_pay_streams: 1600 }];
      }
      throw new Error(`Unexpected raw query call: ${rawCall}`);
    }
  } as never;

  const overview = await getAnalyticsOverview(prisma, {
    user_id: "user_1",
    days: 365
  });
  const releases = await listAnalyticsReleases(prisma, {
    user_id: "user_1",
    days: 365
  });

  assert.equal(overview.totalStreams, 2700);
  assert.equal(overview.totalPayStreams, 1600);
  assert.equal(releases.length, 1);
  assert.equal(releases[0]?.release_id, "release_year");
});

test("listAnalyticsReleases falls back to raw query when snapshot groupBy fails", async () => {
  const prisma = {
    release: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        if (args?.where?.id?.in) {
          return [
            {
              id: "release_year",
              title: "Recovered Release",
              upc: "5063635000099",
              user: { name: "Artist" }
            }
          ];
        }

        return [
          {
            id: "release_year",
            status: "approved",
            confirmed: true,
            upc: "5063635000099",
            roles: {}
          }
        ];
      }
    },
    analytics_report_snapshots: {
      groupBy: async () => {
        throw new Error("groupBy failed");
      }
    },
    $queryRaw: async () => [{ release_id: "release_year", _sum_streams: 5100, _sum_pay_streams: 2800 }]
  } as never;

  const releases = await listAnalyticsReleases(prisma, {
    user_id: "user_1",
    days: 365
  });

  assert.equal(releases.length, 1);
  assert.equal(releases[0]?.release_id, "release_year");
  assert.equal(releases[0]?.streams, 5100);
});

test("analytics summary fast path serves yearly overview and releases without snapshot scan", async () => {
  const prisma = {
    release: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        if (args?.where?.id?.in) {
          return [
            {
              id: "release_year",
              title: "Summary Year Release",
              upc: "5063635044004",
              user: { name: "Artist" }
            }
          ];
        }

        return [
          {
            id: "release_year",
            status: "approved",
            confirmed: true,
            upc: "5063635044004",
            roles: {}
          }
        ];
      }
    },
    analytics_report_snapshots: {
      groupBy: async () => {
        throw new Error("snapshot scan should not be used");
      }
    },
    analytics_daily_summaries: {
      findMany: async () => [
        {
          release_id: "release_year",
          report_date: new Date("2025-12-30T18:00:00.000Z"),
          total_streams: 11,
          total_pay_streams: 4
        },
        {
          release_id: "release_year",
          report_date: new Date("2025-11-22T18:00:00.000Z"),
          total_streams: 13,
          total_pay_streams: 4
        }
      ]
    },
    analytics_platform_summaries: {
      findMany: async () => [
        {
          report_date: new Date("2025-12-30T18:00:00.000Z"),
          platform: "Yandex",
          streams: 11,
          pay_streams: 4
        },
        {
          report_date: new Date("2025-11-22T18:00:00.000Z"),
          platform: "Yandex",
          streams: 13,
          pay_streams: 4
        }
      ]
    }
  } as never;

  const overview = await getAnalyticsOverview(prisma, {
    user_id: "user_1",
    days: 365
  });
  const releases = await listAnalyticsReleases(prisma, {
    user_id: "user_1",
    days: 365
  });

  assert.equal(overview.totalStreams, 24);
  assert.equal(overview.totalPayStreams, 8);
  assert.equal(overview.topPlatform, "Yandex");
  assert.equal(releases.length, 1);
  assert.equal(releases[0]?.release_id, "release_year");
  assert.equal(releases[0]?.streams, 24);
});

test("getAnalyticsOverview falls back to release UPCs when snapshots are attached to another user", async () => {
  let rawCall = 0;

  const prisma = {
    release: {
      findMany: async () => [
        {
          id: "release_year",
          status: "approved",
          confirmed: true,
          upc: "5063635044004",
          roles: {}
        }
      ]
    },
    analytics_report_snapshots: {
      groupBy: async () => []
    },
    $queryRaw: async () => {
      rawCall += 1;
      if (rawCall === 1) {
        return [];
      }

      if (rawCall === 2) {
        return [
          {
            report_date: new Date("2025-12-30T18:00:00.000Z"),
            streams: 11,
            pay_streams: 4
          },
          {
            report_date: new Date("2025-11-22T18:00:00.000Z"),
            streams: 13,
            pay_streams: 4
          }
        ];
      }

      if (rawCall === 3) {
        return [
          {
            report_date: new Date("2025-11-22T18:00:00.000Z"),
            streams: 13,
            pay_streams: 4
          },
          {
            report_date: new Date("2025-12-30T18:00:00.000Z"),
            streams: 11,
            pay_streams: 4
          }
        ];
      }

      if (rawCall === 4) {
        return [
          {
            platform: "Yandex",
            streams: 17,
            pay_streams: 6
          },
          {
            platform: "Spotify",
            streams: 7,
            pay_streams: 2
          }
        ];
      }

      return [
        {
          report_date: new Date("2025-11-22T18:00:00.000Z"),
          platform: "Yandex",
          streams: 13,
          pay_streams: 4
        },
        {
          report_date: new Date("2025-12-30T18:00:00.000Z"),
          platform: "Yandex",
          streams: 4,
          pay_streams: 2
        },
        {
          report_date: new Date("2025-12-30T18:00:00.000Z"),
          platform: "Spotify",
          streams: 7,
          pay_streams: 2
        }
      ];
    }
  } as never;

  const overview = await getAnalyticsOverview(prisma, {
    user_id: "user_1",
    days: 365
  });

  assert.equal(overview.totalStreams, 24);
  assert.equal(overview.totalPayStreams, 8);
  assert.equal(overview.latestReportDate, "2025-12-30");
  assert.equal(overview.chart.length, 2);
  assert.equal(overview.topPlatform, "Yandex");
  assert.equal(overview.platformsBreakdown.length, 2);
  assert.equal(overview.platformsBreakdown[0]?.platform, "Yandex");
  assert.equal(overview.platformsChart.length, 2);
});

test("listAnalyticsReleases falls back to release UPCs when snapshots are attached to another user", async () => {
  let rawCall = 0;

  const prisma = {
    release: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        if (args?.where?.id?.in) {
          return [
            {
              id: "release_year",
              title: "UPC Fallback Release",
              upc: "5063635044004",
              user: { name: "Artist" }
            }
          ];
        }

        return [
          {
            id: "release_year",
            status: "approved",
            confirmed: true,
            upc: "5063635044004",
            roles: {}
          }
        ];
      }
    },
    analytics_report_snapshots: {
      groupBy: async () => []
    },
    $queryRaw: async () => {
      rawCall += 1;
      if (rawCall === 1) {
        return [];
      }

      return [
        {
          upc: "5063635044004",
          _sum_streams: 24,
          _sum_pay_streams: 8
        }
      ];
    }
  } as never;

  const releases = await listAnalyticsReleases(prisma, {
    user_id: "user_1",
    days: 365
  });

  assert.equal(releases.length, 1);
  assert.equal(releases[0]?.release_id, "release_year");
  assert.equal(releases[0]?.streams, 24);
  assert.equal(releases[0]?.pay_streams, 8);
});
