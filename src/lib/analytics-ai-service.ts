import { AnalyticsAiInsightStatus, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { z } from "zod";

import { getAnalyticsOverview, type AnalyticsTrend } from "@/lib/analytics-query-service";
import { checkAiAccess, incrementAiUsage } from "@/lib/subscription-limits";

const AI_STORAGE_UNAVAILABLE_MESSAGE =
  "AI insights storage is unavailable. Apply analytics AI migrations.";

const ANALYTICS_AI_SYSTEM_PROMPT = `Ты AI-аналитик музыкальной дистрибуции.
Твоя задача — анализировать статистику конкретного артиста или пользователя и давать практические рекомендации.

Правила:
- Анализируй только данные, которые переданы в analytics_context.
- Не придумывай данные, которых нет.
- Если данных мало, прямо скажи, что выводы предварительные.
- Не сравнивай пользователя с другими пользователями сервиса.
- Не раскрывай технические детали системы.
- Не упоминай внутренние id, если это не нужно пользователю.
- Отвечай на русском языке.
- Пиши конкретно и прикладно.
- Не давай общие советы вроде “продвигайтесь в соцсетях” без привязки к данным.
- Для каждого вывода указывай, на каком наблюдении он основан.
- Если видишь рост — объясни возможные причины.
- Если видишь падение — предложи, что проверить.
- Если какой-то жанр, страна, площадка или трек выделяется — подсвети это.
- Дай 3–7 практических рекомендаций.
- Ответ возвращай строго в JSON.

Формат ответа:
{
  "summary": "Краткое резюме ситуации",
  "key_findings": [
    {
      "title": "Что обнаружено",
      "details": "Почему это важно",
      "based_on": "На каких данных основано"
    }
  ],
  "recommendations": [
    {
      "title": "Что сделать",
      "details": "Как именно это применить",
      "priority": "high | medium | low"
    }
  ],
  "risks": [
    {
      "title": "Риск",
      "details": "Что может пойти не так"
    }
  ],
  "next_steps": [
    "Конкретный следующий шаг"
  ],
  "best_performing": {
    "release": "Лучший релиз или null",
    "track": "Лучший трек или null",
    "country": "Лучшая страна или null",
    "platform": "Лучшая площадка или null",
    "genre": "Лучший жанр или null"
  }
}`;

const ANALYTICS_AI_RESPONSE_SCHEMA = z.object({
  summary: z.string(),
  key_findings: z.array(
    z.object({
      title: z.string(),
      details: z.string(),
      based_on: z.string()
    })
  ),
  recommendations: z.array(
    z.object({
      title: z.string(),
      details: z.string(),
      priority: z.enum(["high", "medium", "low"])
    })
  ),
  risks: z.array(
    z.object({
      title: z.string(),
      details: z.string()
    })
  ),
  next_steps: z.array(z.string()),
  best_performing: z.object({
    release: z.string().nullable(),
    track: z.string().nullable(),
    country: z.string().nullable(),
    platform: z.string().nullable(),
    genre: z.string().nullable()
  })
});

export type AnalyticsAiResponse = z.infer<typeof ANALYTICS_AI_RESPONSE_SCHEMA>;

export interface AnalyticsContextFilters {
  userId: string;
  artistId?: string;
  releaseId?: string;
  platform?: string;
  periodDays?: number;
  question?: string;
}

export interface AnalyticsContext {
  user_id: string;
  artist_id: string | null;
  selected_release_id: string | null;
  period_days: number;
  latest_report_date: string | null;
  overview: {
    total_streams: number;
    total_pay_streams: number;
    streams_change_percent: number | null;
    pay_streams_change_percent: number | null;
    top_country: string | null;
    countries_count: number;
    releases_count: number;
  };
  top_releases: Array<{
    release_id: string;
    title: string;
    artist: string;
    upc: string;
    genre: string | null;
    streams: number;
    pay_streams: number;
    change_percent: number | null;
    trend: AnalyticsTrend;
  }>;
  top_tracks: Array<{
    track: string;
    release: string;
    streams: number;
    pay_streams: number;
    change_percent: number | null;
  }>;
  top_countries: Array<{
    country: string;
    streams: number;
    pay_streams: number;
    change_percent: number | null;
  }>;
  top_platforms: Array<{
    platform: string;
    streams: number;
    pay_streams: number;
    share_percent: number;
    change_percent: number | null;
  }>;
  genre_performance: Array<{
    genre: string;
    streams: number;
    pay_streams: number;
    avg_change_percent: number | null;
  }>;
  previous_releases_comparison: Array<{
    release_id: string;
    title: string;
    release_date: string;
    streams_30d: number;
    pay_streams_30d: number;
  }>;
  chart: Array<{
    date: string;
    streams: number;
    pay_streams: number;
  }>;
}

export interface AnalyticsAiInsightView {
  id: string;
  status: "processing" | "success" | "failed";
  period_days: number;
  filters_hash: string;
  question: string | null;
  created_at: string;
  updated_at: string;
  error_message: string | null;
  response: AnalyticsAiResponse | null;
}

export interface RequestAnalysisParams {
  userId: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  targetUserId?: string;
  artistId?: string;
  releaseId?: string;
  platform?: string;
  periodDays?: number;
  question?: string;
}

export interface RequestAnalysisResult {
  status: "processing" | "success" | "failed" | "cached" | "rate_limited";
  insight: AnalyticsAiInsightView | null;
  retryAfterSeconds?: number;
}

function clampPeriodDays(value: number | undefined): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(90, Math.floor(value ?? 30)));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calculateChangePercent(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current > 0) return null;
    return 0;
  }

  const percent = ((current - previous) / previous) * 100;
  return Number(percent.toFixed(2));
}

function isUnknownSnapshotPlatformFieldError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("Unknown argument `platform`") ||
    error.message.includes("Invalid value for argument `by`") ||
    error.message.includes("Expected AnalyticsReportSnapshotScalarFieldEnum")
  );
}

function toTrend(changePercent: number | null, current: number, previous: number): AnalyticsTrend {
  if (previous === 0 && current > 0) return "new";
  if (changePercent == null) return "flat";
  if (changePercent > 0) return "up";
  if (changePercent < 0) return "down";
  return "flat";
}

function normalizeId(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeQuestion(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 500) : undefined;
}

function createFiltersHash(input: {
  userId: string;
  artistId?: string;
  releaseId?: string;
  platform?: string;
  periodDays: number;
  question?: string;
}): string {
  const payload = JSON.stringify({
    userId: input.userId,
    artistId: input.artistId ?? null,
    releaseId: input.releaseId ?? null,
    platform: input.platform ?? null,
    periodDays: input.periodDays,
    question: input.question ?? null
  });

  return createHash("sha256").update(payload).digest("hex");
}

function safeParseAiResponse(value: unknown): AnalyticsAiResponse {
  const parsed = ANALYTICS_AI_RESPONSE_SCHEMA.safeParse(value);
  if (!parsed.success) {
    throw new Error("AI response schema validation failed");
  }
  return parsed.data;
}

function mapInsightStatus(status: AnalyticsAiInsightStatus): "processing" | "success" | "failed" {
  if (status === AnalyticsAiInsightStatus.SUCCESS) return "success";
  if (status === AnalyticsAiInsightStatus.FAILED) return "failed";
  return "processing";
}

function isAnalyticsAiStorageError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const maybePrismaError = error as {
    code?: unknown;
    message?: unknown;
  };

  const code = typeof maybePrismaError.code === "string" ? maybePrismaError.code : "";
  const message =
    typeof maybePrismaError.message === "string"
      ? maybePrismaError.message.toLowerCase()
      : "";

  if (code === "P2021" || code === "P2022" || code === "P2010") {
    return true;
  }

  return (
    message.includes("analytics_ai_insights") ||
    message.includes("analyticsaiinsight") ||
    message.includes("table `public.analytics_ai_insights` does not exist")
  );
}

function toAiStorageUnavailableError(): Error {
  return new Error(AI_STORAGE_UNAVAILABLE_MESSAGE);
}

function isAnalyticsDataStorageError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const maybePrismaError = error as {
    code?: unknown;
    message?: unknown;
  };

  const code = typeof maybePrismaError.code === "string" ? maybePrismaError.code : "";
  const message =
    typeof maybePrismaError.message === "string"
      ? maybePrismaError.message.toLowerCase()
      : "";

  if (code === "P2021" || code === "P2022" || code === "P2010") {
    return true;
  }

  return (
    message.includes("analytics_report_snapshots") ||
    message.includes("analytics_daily_summaries")
  );
}

function buildEmptyContext(params: {
  userId: string;
  artistId?: string;
  releaseId?: string;
  periodDays: number;
}): AnalyticsContext {
  return {
    user_id: params.userId,
    artist_id: params.artistId ?? null,
    selected_release_id: params.releaseId ?? null,
    period_days: params.periodDays,
    latest_report_date: null,
    overview: {
      total_streams: 0,
      total_pay_streams: 0,
      streams_change_percent: 0,
      pay_streams_change_percent: 0,
      top_country: null,
      countries_count: 0,
      releases_count: 0
    },
    top_releases: [],
    top_tracks: [],
    top_countries: [],
    top_platforms: [],
    genre_performance: [],
    previous_releases_comparison: [],
    chart: []
  };
}

function parseContextQuestion(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const question = (snapshot as { question?: unknown }).question;
  return typeof question === "string" ? question : null;
}

type AnalyticsAiInsightRow = {
  id: string;
  status: AnalyticsAiInsightStatus;
  periodDays: number;
  filtersHash: string;
  contextSnapshot: unknown;
  aiResponse: unknown;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

interface AnalyticsAiInsightRepo {
  create(args: unknown): Promise<AnalyticsAiInsightRow>;
  update(args: unknown): Promise<AnalyticsAiInsightRow>;
  findFirst(args: unknown): Promise<AnalyticsAiInsightRow | null>;
  count(args: unknown): Promise<number>;
}

function mapInsightRow(row: AnalyticsAiInsightRow): AnalyticsAiInsightView {
  return {
    id: row.id,
    status: mapInsightStatus(row.status),
    period_days: row.periodDays,
    filters_hash: row.filtersHash,
    question: parseContextQuestion(row.contextSnapshot),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    error_message: row.errorMessage,
    response: row.aiResponse ? safeParseAiResponse(row.aiResponse) : null
  };
}

function buildUserPrompt(context: AnalyticsContext, question?: string): string {
  const userQuestion = question
    ? `\n\nВопрос пользователя: ${question}\nОтветь на вопрос строго в рамках analytics_context.`
    : "";

  return `Проанализируй analytics_context и верни JSON строго по указанному формату.${userQuestion}\n\nanalytics_context:\n${JSON.stringify(context)}`;
}

async function callDeepSeek(params: {
  context: AnalyticsContext;
  question?: string;
}): Promise<AnalyticsAiResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  const timeoutMs = 20_000;

  const payload = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: ANALYTICS_AI_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: buildUserPrompt(params.context, params.question)
      }
    ]
  };

  const requestBody = JSON.stringify(payload);

  const runOnce = async (): Promise<AnalyticsAiResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: requestBody,
        signal: controller.signal
      });

      if (!response.ok) {
        const details = await response.text().catch(() => "");
        throw new Error(`DeepSeek request failed: ${response.status} ${details.slice(0, 500)}`);
      }

      const data = (await response.json().catch(() => null)) as
        | {
            choices?: Array<{
              message?: {
                content?: string;
              };
            }>;
          }
        | null;

      const content = data?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("DeepSeek returned empty content");
      }

      const jsonText = content.trim();
      const parsedJson = JSON.parse(jsonText) as unknown;
      return safeParseAiResponse(parsedJson);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await runOnce();
  } catch (firstError) {
    return runOnce().catch(() => {
      throw firstError;
    });
  }
}

async function resolveLatestAndPreviousReportDates(prisma: PrismaClient, params: {
  userId: string;
  artistId?: string;
  releaseId?: string;
}): Promise<{ latest: Date | null; previous: Date | null }> {
  const grouped = await prisma.analyticsReportSnapshot.groupBy({
    by: ["reportDate"],
    where: {
      userId: params.userId,
      ...(params.releaseId ? { releaseId: params.releaseId } : {}),
      ...(params.artistId ? { release: { artistProfileId: params.artistId } } : {})
    },
    _sum: {
      streams: true
    },
    orderBy: {
      reportDate: "desc"
    },
    take: 2
  });

  return {
    latest: grouped[0]?.reportDate ?? null,
    previous: grouped[1]?.reportDate ?? null
  };
}

async function ensureOwnership(prisma: PrismaClient, params: {
  userId: string;
  artistId?: string;
  releaseId?: string;
}): Promise<void> {
  if (params.artistId) {
    const artist = await prisma.artistProfile.findFirst({
      where: {
        id: params.artistId,
        userId: params.userId
      },
      select: { id: true }
    });

    if (!artist) {
      throw new Error("Artist not found for this user");
    }
  }

  if (params.releaseId) {
    const release = await prisma.release.findFirst({
      where: {
        id: params.releaseId,
        userId: params.userId,
        ...(params.artistId ? { artistProfileId: params.artistId } : {})
      },
      select: { id: true }
    });

    if (!release) {
      throw new Error("Release not found for this user");
    }
  }
}

export class AnalyticsAIService {
  constructor(private readonly prisma: PrismaClient) {}

  private get analyticsAiInsightRepo(): AnalyticsAiInsightRepo {
    const repo = (this.prisma as unknown as {
      analyticsAiInsight?: Partial<AnalyticsAiInsightRepo>;
    }).analyticsAiInsight;

    if (
      !repo ||
      typeof repo.create !== "function" ||
      typeof repo.update !== "function" ||
      typeof repo.findFirst !== "function" ||
      typeof repo.count !== "function"
    ) {
      throw toAiStorageUnavailableError();
    }

    return repo as AnalyticsAiInsightRepo;
  }

  async buildContext(input: AnalyticsContextFilters): Promise<AnalyticsContext> {
    const userId = input.userId;
    const artistId = normalizeId(input.artistId);
    const releaseId = normalizeId(input.releaseId);
    const platform = input.platform?.trim() || undefined;
    const periodDays = clampPeriodDays(input.periodDays);

    await ensureOwnership(this.prisma, {
      userId,
      artistId,
      releaseId
    });

    let latest: Date | null = null;
    let previous: Date | null = null;
    try {
      const range = await resolveLatestAndPreviousReportDates(this.prisma, {
        userId,
        artistId,
        releaseId
      });
      latest = range.latest;
      previous = range.previous;
    } catch (error) {
      if (isAnalyticsDataStorageError(error)) {
        return buildEmptyContext({
          userId,
          artistId,
          releaseId,
          periodDays
        });
      }
      throw error;
    }

    if (!latest) {
      return {
        user_id: userId,
        artist_id: artistId ?? null,
        selected_release_id: releaseId ?? null,
        period_days: periodDays,
        latest_report_date: null,
        overview: {
          total_streams: 0,
          total_pay_streams: 0,
          streams_change_percent: 0,
          pay_streams_change_percent: 0,
          top_country: null,
          countries_count: 0,
          releases_count: 0
        },
        top_releases: [],
        top_tracks: [],
        top_countries: [],
        top_platforms: [],
        genre_performance: [],
        previous_releases_comparison: [],
        chart: []
      };
    }

    const useOverviewService = !artistId;

    const overview = useOverviewService
      ? await getAnalyticsOverview(this.prisma, {
          userId,
          releaseId,
          platform,
          days: periodDays
        })
      : null;

    const rangeStart = new Date(latest);
    rangeStart.setUTCHours(0, 0, 0, 0);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - periodDays + 1);

    const snapshotBaseWhere = {
      userId,
      ...(releaseId ? { releaseId } : {}),
      ...(platform ? { platform } : {}),
      ...(artistId ? { release: { artistProfileId: artistId } } : {})
    };

    const [
      currentTotal,
      previousTotal,
      chartGroups,
      countriesCurrent,
      countriesPrevious,
      platformsCurrent,
      platformsPrevious,
      releasesCurrent,
      releaseGroupsCurrent,
      releaseGroupsPrevious,
      trackGroupsCurrent,
      trackGroupsPrevious,
      latestRowsForGenre,
      releaseComparisonRows
    ] = await Promise.all([
      this.prisma.analyticsReportSnapshot.aggregate({
        where: {
          ...snapshotBaseWhere,
          reportDate: latest
        },
        _sum: {
          streams: true,
          payStreams: true
        }
      }),
      previous
        ? this.prisma.analyticsReportSnapshot.aggregate({
            where: {
              ...snapshotBaseWhere,
              reportDate: previous
            },
            _sum: {
              streams: true,
              payStreams: true
            }
          })
        : Promise.resolve({ _sum: { streams: 0, payStreams: 0 } }),
      this.prisma.analyticsReportSnapshot.groupBy({
        by: ["reportDate"],
        where: {
          ...snapshotBaseWhere,
          reportDate: {
            gte: rangeStart,
            lte: latest
          }
        },
        _sum: {
          streams: true,
          payStreams: true
        },
        orderBy: {
          reportDate: "asc"
        }
      }),
      this.prisma.analyticsReportSnapshot.groupBy({
        by: ["country"],
        where: {
          ...snapshotBaseWhere,
          reportDate: latest
        },
        _sum: {
          streams: true,
          payStreams: true
        },
        orderBy: {
          _sum: {
            streams: "desc"
          }
        },
        take: 12
      }),
      previous
        ? this.prisma.analyticsReportSnapshot.groupBy({
            by: ["country"],
            where: {
              ...snapshotBaseWhere,
              reportDate: previous
            },
            _sum: {
              streams: true,
              payStreams: true
            }
          })
        : Promise.resolve([]),
      this.prisma.analyticsReportSnapshot.groupBy({
        by: ["platform"],
        where: {
          ...snapshotBaseWhere,
          reportDate: latest
        },
        _sum: {
          streams: true,
          payStreams: true
        },
        orderBy: {
          _sum: {
            streams: "desc"
          }
        },
        take: 8
      }).catch((error) => {
        if (isUnknownSnapshotPlatformFieldError(error)) return [];
        throw error;
      }),
      previous
        ? this.prisma.analyticsReportSnapshot.groupBy({
            by: ["platform"],
            where: {
              ...snapshotBaseWhere,
              reportDate: previous
            },
            _sum: {
              streams: true,
              payStreams: true
            }
          }).catch((error) => {
            if (isUnknownSnapshotPlatformFieldError(error)) return [];
            throw error;
          })
        : Promise.resolve([]),
      this.prisma.analyticsReportSnapshot.groupBy({
        by: ["releaseId"],
        where: {
          ...snapshotBaseWhere,
          reportDate: latest
        },
        _sum: {
          streams: true
        }
      }),
      this.prisma.analyticsReportSnapshot.groupBy({
        by: ["releaseId"],
        where: {
          ...snapshotBaseWhere,
          reportDate: latest
        },
        _sum: {
          streams: true,
          payStreams: true
        },
        orderBy: {
          _sum: {
            streams: "desc"
          }
        },
        take: 8
      }),
      previous
        ? this.prisma.analyticsReportSnapshot.groupBy({
            by: ["releaseId"],
            where: {
              ...snapshotBaseWhere,
              reportDate: previous
            },
            _sum: {
              streams: true,
              payStreams: true
            }
          })
        : Promise.resolve([]),
      this.prisma.analyticsReportSnapshot.groupBy({
        by: ["releaseId", "trackName"],
        where: {
          ...snapshotBaseWhere,
          reportDate: latest,
          trackName: {
            not: null
          }
        },
        _sum: {
          streams: true,
          payStreams: true
        },
        orderBy: {
          _sum: {
            streams: "desc"
          }
        },
        take: 10
      }),
      previous
        ? this.prisma.analyticsReportSnapshot.groupBy({
            by: ["releaseId", "trackName"],
            where: {
              ...snapshotBaseWhere,
              reportDate: previous,
              trackName: {
                not: null
              }
            },
            _sum: {
              streams: true
            }
          })
        : Promise.resolve([]),
      this.prisma.analyticsReportSnapshot.findMany({
        where: {
          ...snapshotBaseWhere,
          reportDate: latest
        },
        select: {
          streams: true,
          payStreams: true,
          release: {
            select: {
              genre: true
            }
          }
        }
      }),
      this.prisma.analyticsDailySummary.findMany({
        where: {
          userId,
          releaseId: {
            not: null
          },
          reportDate: latest,
          ...(artistId ? { release: { artistProfileId: artistId } } : {})
        },
        select: {
          releaseId: true,
          totalStreams: true,
          totalPayStreams: true,
          release: {
            select: {
              title: true,
              releaseDate: true
            }
          }
        },
        orderBy: {
          release: {
            releaseDate: "desc"
          }
        },
        take: 8
      })
    ]);

    const releaseIds = Array.from(
      new Set([
        ...releaseGroupsCurrent.map((item) => item.releaseId),
        ...trackGroupsCurrent.map((item) => item.releaseId),
        ...releaseComparisonRows
          .map((item) => item.releaseId)
          .filter((value): value is string => Boolean(value))
      ])
    );

    const releaseMeta = releaseIds.length
      ? await this.prisma.release.findMany({
          where: {
            id: {
              in: releaseIds
            }
          },
          select: {
            id: true,
            title: true,
            genre: true,
            upc: true,
            user: {
              select: {
                name: true
              }
            }
          }
        })
      : [];

    const releaseMetaById = new Map(releaseMeta.map((item) => [item.id, item]));

    const previousReleaseById = new Map(
      releaseGroupsPrevious.map((item) => [
        item.releaseId,
        {
          streams: item._sum.streams ?? 0,
          payStreams: item._sum.payStreams ?? 0
        }
      ])
    );

    const topReleases: AnalyticsContext["top_releases"] = releaseGroupsCurrent
      .map((item) => {
        const meta = releaseMetaById.get(item.releaseId);
        const currentStreams = item._sum.streams ?? 0;
        const currentPayStreams = item._sum.payStreams ?? 0;
        const previousValues = previousReleaseById.get(item.releaseId);
        const previousStreams = previousValues?.streams ?? 0;
        const changePercent = calculateChangePercent(currentStreams, previousStreams);

        return {
          release_id: item.releaseId,
          title: meta?.title ?? "Unknown release",
          artist: meta?.user.name ?? "Unknown artist",
          upc: meta?.upc ?? "",
          genre: meta?.genre ?? null,
          streams: currentStreams,
          pay_streams: currentPayStreams,
          change_percent: changePercent,
          trend: toTrend(changePercent, currentStreams, previousStreams)
        };
      })
      .slice(0, 8);

    const previousTrackByKey = new Map(
      trackGroupsPrevious.map((item) => [
        `${item.releaseId}:${item.trackName ?? ""}`,
        item._sum.streams ?? 0
      ])
    );

    const topTracks: AnalyticsContext["top_tracks"] = trackGroupsCurrent.map((item) => {
      const key = `${item.releaseId}:${item.trackName ?? ""}`;
      const currentStreams = item._sum.streams ?? 0;
      const previousStreams = previousTrackByKey.get(key) ?? 0;

      return {
        track: item.trackName ?? "Unknown track",
        release: releaseMetaById.get(item.releaseId)?.title ?? "Unknown release",
        streams: currentStreams,
        pay_streams: item._sum.payStreams ?? 0,
        change_percent: calculateChangePercent(currentStreams, previousStreams)
      };
    });

    const previousCountryByCode = new Map(
      countriesPrevious.map((item) => [item.country, item._sum.streams ?? 0])
    );

    const topCountries: AnalyticsContext["top_countries"] = countriesCurrent.map((item) => {
      const currentStreams = item._sum.streams ?? 0;
      const previousStreams = previousCountryByCode.get(item.country) ?? 0;

      return {
        country: item.country,
        streams: currentStreams,
        pay_streams: item._sum.payStreams ?? 0,
        change_percent: calculateChangePercent(currentStreams, previousStreams)
      };
    });

    const previousPlatformByName = new Map(
      platformsPrevious.map((item) => [item.platform ?? "Unknown", item._sum.streams ?? 0])
    );
    const totalStreamsForShare = currentTotal._sum.streams ?? 0;
    const topPlatforms: AnalyticsContext["top_platforms"] = platformsCurrent.map((item) => {
      const platform = item.platform ?? "Unknown";
      const currentStreams = item._sum.streams ?? 0;
      const previousStreams = previousPlatformByName.get(platform) ?? 0;
      return {
        platform,
        streams: currentStreams,
        pay_streams: item._sum.payStreams ?? 0,
        share_percent:
          totalStreamsForShare > 0
            ? Number((((currentStreams / totalStreamsForShare) * 100)).toFixed(3))
            : 0,
        change_percent: calculateChangePercent(currentStreams, previousStreams)
      };
    });

    const genreAccumulator = new Map<
      string,
      {
        streams: number;
        payStreams: number;
        rows: number;
      }
    >();

    for (const row of latestRowsForGenre) {
      const genre = row.release.genre || "Unknown";
      const entry = genreAccumulator.get(genre) ?? { streams: 0, payStreams: 0, rows: 0 };
      entry.streams += row.streams;
      entry.payStreams += row.payStreams;
      entry.rows += 1;
      genreAccumulator.set(genre, entry);
    }

    const previousGenreAccumulator = new Map<string, number>();
    if (previous) {
      const previousRowsForGenre = await this.prisma.analyticsReportSnapshot.findMany({
        where: {
          ...snapshotBaseWhere,
          reportDate: previous
        },
        select: {
          streams: true,
          release: {
            select: {
              genre: true
            }
          }
        }
      });

      for (const row of previousRowsForGenre) {
        const genre = row.release.genre || "Unknown";
        const total = previousGenreAccumulator.get(genre) ?? 0;
        previousGenreAccumulator.set(genre, total + row.streams);
      }
    }

    const genrePerformance: AnalyticsContext["genre_performance"] = Array.from(
      genreAccumulator.entries()
    )
      .map(([genre, value]) => {
        const previousStreams = previousGenreAccumulator.get(genre) ?? 0;
        return {
          genre,
          streams: value.streams,
          pay_streams: value.payStreams,
          avg_change_percent: calculateChangePercent(value.streams, previousStreams)
        };
      })
      .sort((a, b) => b.streams - a.streams)
      .slice(0, 8);

    const previousReleasesComparison: AnalyticsContext["previous_releases_comparison"] = releaseComparisonRows
      .filter((item): item is typeof item & { releaseId: string } => Boolean(item.releaseId))
      .filter((item) => item.releaseId !== releaseId)
      .map((item) => ({
        release_id: item.releaseId,
        title: item.release?.title ?? "Unknown release",
        release_date: item.release?.releaseDate
          ? toDateKey(item.release.releaseDate)
          : toDateKey(latest),
        streams_30d: item.totalStreams,
        pay_streams_30d: item.totalPayStreams
      }))
      .slice(0, 7);

    const currentStreams = overview?.totalStreams ?? (currentTotal._sum.streams ?? 0);
    const currentPayStreams = overview?.totalPayStreams ?? (currentTotal._sum.payStreams ?? 0);
    const previousStreams = previousTotal._sum.streams ?? 0;
    const previousPayStreams = previousTotal._sum.payStreams ?? 0;
    const chart: AnalyticsContext["chart"] = overview
      ? overview.chart.map((item) => ({
          date: item.date,
          streams: item.streams,
          pay_streams: item.payStreams
        }))
      : chartGroups.map((item) => ({
          date: toDateKey(item.reportDate),
          streams: item._sum.streams ?? 0,
          pay_streams: item._sum.payStreams ?? 0
        }));

    const releasesCount = releasesCurrent.length;
    const topCountry = countriesCurrent[0]?.country ?? null;

    return {
      user_id: userId,
      artist_id: artistId ?? null,
        selected_release_id: releaseId ?? null,
      period_days: periodDays,
      latest_report_date: toDateKey(latest),
      overview: {
        total_streams: currentStreams,
        total_pay_streams: currentPayStreams,
        streams_change_percent:
          overview?.streamsChangePercent ?? calculateChangePercent(currentStreams, previousStreams),
        pay_streams_change_percent:
          overview?.payStreamsChangePercent ??
          calculateChangePercent(currentPayStreams, previousPayStreams),
        top_country: topCountry,
        countries_count: countriesCurrent.length,
        releases_count: releasesCount
      },
      top_releases: topReleases,
      top_tracks: topTracks,
      top_countries: topCountries,
      top_platforms: topPlatforms,
      genre_performance: genrePerformance,
      previous_releases_comparison: previousReleasesComparison,
      chart
    };
  }

  async analyze(context: AnalyticsContext, question?: string): Promise<AnalyticsAiResponse> {
    const response = await callDeepSeek({
      context,
      question: normalizeQuestion(question)
    });

    return response;
  }

  async saveInsight(params: {
    userId: string;
    artistId?: string;
    releaseId?: string;
    periodDays: number;
    filtersHash: string;
    contextSnapshot: unknown;
    status: AnalyticsAiInsightStatus;
    aiResponse?: unknown;
    errorMessage?: string;
    existingInsightId?: string;
  }): Promise<AnalyticsAiInsightView> {
    try {
      const repo = this.analyticsAiInsightRepo;

      const row = params.existingInsightId
        ? await repo.update({
            where: {
              id: params.existingInsightId
            },
            data: {
              status: params.status,
              aiResponse: params.aiResponse as never,
              errorMessage: params.errorMessage ?? null,
              contextSnapshot: params.contextSnapshot as never,
              periodDays: params.periodDays,
              filtersHash: params.filtersHash,
              artistId: params.artistId ?? null,
              releaseId: params.releaseId ?? null
            },
            select: {
              id: true,
              status: true,
              periodDays: true,
              filtersHash: true,
              contextSnapshot: true,
              aiResponse: true,
              errorMessage: true,
              createdAt: true,
              updatedAt: true
            }
          })
        : await repo.create({
            data: {
              userId: params.userId,
              artistId: params.artistId ?? null,
              releaseId: params.releaseId ?? null,
              periodDays: params.periodDays,
              filtersHash: params.filtersHash,
              contextSnapshot: params.contextSnapshot as never,
              status: params.status,
              aiResponse: (params.aiResponse ?? null) as never,
              errorMessage: params.errorMessage ?? null
            },
            select: {
              id: true,
              status: true,
              periodDays: true,
              filtersHash: true,
              contextSnapshot: true,
              aiResponse: true,
              errorMessage: true,
              createdAt: true,
              updatedAt: true
            }
          });

      return mapInsightRow(row);
    } catch (error) {
      if (isAnalyticsAiStorageError(error)) {
        throw toAiStorageUnavailableError();
      }
      throw error;
    }
  }

  async getLatestInsight(params: {
    userId: string;
    artistId?: string;
    releaseId?: string;
    platform?: string;
    periodDays?: number;
    question?: string;
  }): Promise<AnalyticsAiInsightView | null> {
    const artistId = normalizeId(params.artistId);
    const releaseId = normalizeId(params.releaseId);
    const platform = params.platform?.trim() || undefined;
    const periodDays = clampPeriodDays(params.periodDays);
    const question = normalizeQuestion(params.question);
    const repo = this.analyticsAiInsightRepo;

    await ensureOwnership(this.prisma, {
      userId: params.userId,
      artistId,
      releaseId
    });

    const filtersHash = createFiltersHash({
      userId: params.userId,
      artistId,
      releaseId,
      platform,
      periodDays,
      question
    });

    let row: AnalyticsAiInsightRow | null;
    try {
      row = await repo.findFirst({
        where: {
          userId: params.userId,
          filtersHash
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          status: true,
          periodDays: true,
          filtersHash: true,
          contextSnapshot: true,
          aiResponse: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true
        }
      });
    } catch (error) {
      if (isAnalyticsAiStorageError(error)) {
        return null;
      }
      throw error;
    }

    if (!row && !question) {
      try {
        row = await repo.findFirst({
          where: {
            userId: params.userId,
            artistId: artistId ?? null,
            releaseId: releaseId ?? null,
            periodDays
          },
          orderBy: {
            createdAt: "desc"
          },
          select: {
            id: true,
            status: true,
            periodDays: true,
            filtersHash: true,
            contextSnapshot: true,
            aiResponse: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true
          }
        });
      } catch (error) {
        if (isAnalyticsAiStorageError(error)) {
          return null;
        }
        throw error;
      }
    }

    return row ? mapInsightRow(row) : null;
  }

  async requestAnalysis(params: RequestAnalysisParams): Promise<RequestAnalysisResult> {
    const userId = params.role === "ADMIN" && params.targetUserId ? params.targetUserId : params.userId;
    const artistId = normalizeId(params.artistId);
    const releaseId = normalizeId(params.releaseId);
    const platform = params.platform?.trim() || undefined;
    const periodDays = clampPeriodDays(params.periodDays);
    const question = normalizeQuestion(params.question);

    await ensureOwnership(this.prisma, {
      userId,
      artistId,
      releaseId
    });

    const filtersHash = createFiltersHash({
      userId,
      artistId,
      releaseId,
      platform,
      periodDays,
      question
    });

    let repo: AnalyticsAiInsightRepo;
    try {
      repo = this.analyticsAiInsightRepo;
    } catch (error) {
      if (error instanceof Error && error.message.includes(AI_STORAGE_UNAVAILABLE_MESSAGE)) {
        return this.requestTransientAnalysis({
          userId,
          artistId,
          releaseId,
          platform,
          periodDays,
          question,
          filtersHash
        });
      }
      throw error;
    }

    let processingRow: AnalyticsAiInsightRow | null;
    try {
      processingRow = await repo.findFirst({
        where: {
          userId,
          status: AnalyticsAiInsightStatus.PROCESSING
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          status: true,
          periodDays: true,
          filtersHash: true,
          contextSnapshot: true,
          aiResponse: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true
        }
      });
    } catch (error) {
      if (isAnalyticsAiStorageError(error)) {
        return this.requestTransientAnalysis({
          userId,
          artistId,
          releaseId,
          platform,
          periodDays,
          question,
          filtersHash
        });
      }
      throw error;
    }

    if (processingRow) {
      return {
        status: "processing",
        insight: mapInsightRow(processingRow)
      };
    }

    let cachedRow: AnalyticsAiInsightRow | null;
    try {
      cachedRow = await repo.findFirst({
        where: {
          userId,
          filtersHash,
          status: AnalyticsAiInsightStatus.SUCCESS,
          createdAt: {
            gte: new Date(Date.now() - 6 * 60 * 60 * 1000)
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          status: true,
          periodDays: true,
          filtersHash: true,
          contextSnapshot: true,
          aiResponse: true,
          errorMessage: true,
          createdAt: true,
          updatedAt: true
        }
      });
    } catch (error) {
      if (isAnalyticsAiStorageError(error)) {
        return this.requestTransientAnalysis({
          userId,
          artistId,
          releaseId,
          platform,
          periodDays,
          question,
          filtersHash
        });
      }
      throw error;
    }

    if (cachedRow) {
      return {
        status: "cached",
        insight: mapInsightRow(cachedRow)
      };
    }

    const aiAccess = await checkAiAccess(this.prisma, userId);
    if (!aiAccess.allowed) {
      if (aiAccess.code === "ai_limit_reached") {
        return {
          status: "rate_limited",
          insight: null,
          retryAfterSeconds: 60 * 60
        };
      }
      throw new Error(aiAccess.reason ?? "Требуется подписка для AI.");
    }

    const context = await this.buildContext({
      userId,
      artistId,
      releaseId,
      platform,
      periodDays,
      question
    });

    const contextSnapshot = {
      question: question ?? null,
      analytics_context: context
    };

    let processingInsight: AnalyticsAiInsightView;
    try {
      processingInsight = await this.saveInsight({
        userId,
        artistId,
        releaseId,
        periodDays,
        filtersHash,
        contextSnapshot,
        status: AnalyticsAiInsightStatus.PROCESSING
      });
    } catch (error) {
      if (isAnalyticsAiStorageError(error)) {
        return this.requestTransientAnalysis({
          userId,
          artistId,
          releaseId,
          platform,
          periodDays,
          question,
          filtersHash
        });
      }
      throw error;
    }

    try {
      await incrementAiUsage(this.prisma, userId);

      console.info("[analytics-ai] request", {
        userId,
        artistId: artistId ?? null,
        releaseId: releaseId ?? null,
        periodDays,
        insightId: processingInsight.id,
        contextBytes: JSON.stringify(contextSnapshot).length
      });

      const aiResponse = await this.analyze(context, question);

      const successInsight = await this.saveInsight({
        userId,
        artistId,
        releaseId,
        periodDays,
        filtersHash,
        contextSnapshot,
        status: AnalyticsAiInsightStatus.SUCCESS,
        aiResponse,
        existingInsightId: processingInsight.id
      });

      return {
        status: "success",
        insight: successInsight
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message.slice(0, 500) : "AI analyze failed";

      try {
        const failedInsight = await this.saveInsight({
          userId,
          artistId,
          releaseId,
          periodDays,
          filtersHash,
          contextSnapshot,
          status: AnalyticsAiInsightStatus.FAILED,
          errorMessage,
          existingInsightId: processingInsight.id
        });

        return {
          status: "failed",
          insight: failedInsight
        };
      } catch (saveError) {
        if (isAnalyticsAiStorageError(saveError)) {
          return this.requestTransientAnalysis({
            userId,
            artistId,
            releaseId,
            platform,
            periodDays,
            question,
            filtersHash
          });
        }
        throw saveError;
      }
    }
  }

  private async requestTransientAnalysis(params: {
    userId: string;
    artistId?: string;
    releaseId?: string;
    platform?: string;
    periodDays: number;
    question?: string;
    filtersHash: string;
  }): Promise<RequestAnalysisResult> {
    let context: AnalyticsContext;
    try {
      context = await this.buildContext({
        userId: params.userId,
        artistId: params.artistId,
        releaseId: params.releaseId,
        platform: params.platform,
        periodDays: params.periodDays,
        question: params.question
      });
    } catch (error) {
      if (isAnalyticsDataStorageError(error)) {
        context = buildEmptyContext({
          userId: params.userId,
          artistId: params.artistId,
          releaseId: params.releaseId,
          periodDays: params.periodDays
        });
      } else {
        throw error;
      }
    }

    const createdAt = new Date().toISOString();
    const transientId = `transient-${Date.now()}`;

    try {
      const aiResponse = await this.analyze(context, params.question);
      return {
        status: "success",
        insight: {
          id: transientId,
          status: "success",
          period_days: params.periodDays,
          filters_hash: params.filtersHash,
          question: params.question ?? null,
          created_at: createdAt,
          updated_at: createdAt,
          error_message: null,
          response: aiResponse
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "AI analyze failed";
      return {
        status: "failed",
        insight: {
          id: transientId,
          status: "failed",
          period_days: params.periodDays,
          filters_hash: params.filtersHash,
          question: params.question ?? null,
          created_at: createdAt,
          updated_at: createdAt,
          error_message: message,
          response: null
        }
      };
    }
  }
}
