// @ts-nocheck
import { AnalyticsAiInsightStatus, type PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import https from "node:https";
import { z } from "zod";

import { getAnalyticsOverview, type AnalyticsTrend } from "@/lib/analytics-query-service";
import { checkAiAccess, incrementAiUsage } from "@/lib/subscription-limits";

const AI_STORAGE_UNAVAILABLE_MESSAGE =
  "AI insights storage is unavailable. Apply analytics AI migrations.";
const ANALYTICS_AI_PUBLIC_ERROR_MESSAGE =
  "AI-сервис временно недоступен. Попробуйте позже.";

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
  user_id: string;
  artistId?: string;
  release_id?: string;
  platform?: string;
  period_days?: number;
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
  user_id: string;
  role: "USER" | "MODERATOR" | "ADMIN";
  targetUserId?: string;
  artistId?: string;
  release_id?: string;
  platform?: string;
  period_days?: number;
  question?: string;
}

export interface RequestAnalysisResult {
  status: "processing" | "success" | "failed" | "cached" | "rate_limited";
  insight: AnalyticsAiInsightView | null;
  retryAfterSeconds?: number;
}

export function sanitizeAnalyticsAiErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("deepseek") ||
    normalized.includes("mistral") ||
    normalized.includes("ai provider") ||
    normalized.includes("provider returned empty content") ||
    normalized.includes("provider returned invalid json") ||
    normalized.includes("request failed:") ||
    normalized.includes("api key") ||
    normalized.includes("authentication_error") ||
    normalized.includes("invalid_request_error") ||
    normalized.includes("bearer ") ||
    normalized.includes("chat/completions") ||
    normalized.includes("is not configured")
  ) {
    return ANALYTICS_AI_PUBLIC_ERROR_MESSAGE;
  }

  return message;
}

type AiProvider = "deepseek" | "mistral";

function resolveAiProvider(): AiProvider {
  const configured = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  if (configured === "mistral") return "mistral";
  if (configured === "deepseek") return "deepseek";
  if (process.env.MISTRAL_API_KEY?.trim()) return "mistral";
  return "deepseek";
}

function clampPeriodDays(value: number | undefined): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(90, Math.floor(value ?? 30)));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const MAX_READABLE_CHANGE_PERCENT = 150;

function clampReadableChangePercent(value: number): number {
  return Math.max(-MAX_READABLE_CHANGE_PERCENT, Math.min(MAX_READABLE_CHANGE_PERCENT, value));
}

function calculateChangePercent(current: number, previous: number): number | null {
  if (previous === 0) {
    if (current > 0) return null;
    return 0;
  }

  const percent = ((current - previous) / previous) * 100;
  return Number(clampReadableChangePercent(percent).toFixed(2));
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
  user_id: string;
  artistId?: string;
  release_id?: string;
  platform?: string;
  period_days: number;
  question?: string;
}): string {
  const payload = JSON.stringify({
    user_id: input.user_id,
    artistId: input.artistId ?? null,
    release_id: input.release_id ?? null,
    platform: input.platform ?? null,
    period_days: input.period_days,
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
    message.includes("analytics_daily_summaries") ||
    (message.includes("cannot read properties of undefined") &&
      (message.includes("groupby") ||
        message.includes("aggregate") ||
        message.includes("findmany")))
  );
}

function hasAnalyticsDataStorage(prisma: PrismaClient): boolean {
  const client = prisma as unknown as {
    analytics_report_snapshots?: {
      groupBy?: unknown;
      aggregate?: unknown;
      findMany?: unknown;
    };
    analytics_daily_summaries?: {
      findMany?: unknown;
    };
  };

  return (
    typeof client.analytics_report_snapshots?.groupBy === "function" &&
    typeof client.analytics_report_snapshots?.aggregate === "function" &&
    typeof client.analytics_report_snapshots?.findMany === "function" &&
    typeof client.analytics_daily_summaries?.findMany === "function"
  );
}

function buildEmptyContext(params: {
  user_id: string;
  artistId?: string;
  release_id?: string;
  period_days: number;
}): AnalyticsContext {
  return {
    user_id: params.user_id,
    artist_id: params.artistId ?? null,
    selected_release_id: params.release_id ?? null,
    period_days: params.period_days,
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
  period_days: number;
  filtersHash: string;
  contextSnapshot: unknown;
  aiResponse: unknown;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
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
    period_days: row.period_days,
    filters_hash: row.filtersHash,
    question: parseContextQuestion(row.contextSnapshot),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    error_message: row.error_message
      ? sanitizeAnalyticsAiErrorMessage(row.error_message)
      : null,
    response: row.aiResponse ? safeParseAiResponse(row.aiResponse) : null
  };
}

function buildUserPrompt(context: AnalyticsContext, question?: string): string {
  const compactContext = compactContextForPrompt(context);
  const userQuestion = question
    ? `\n\nВопрос пользователя: ${question}\nОтветь на вопрос строго в рамках analytics_context.`
    : "";

  return `Проанализируй analytics_context и верни результат строго в формате json (валидный JSON-объект, без markdown и без пояснений).${userQuestion}\n\nanalytics_context:\n${JSON.stringify(compactContext)}`;
}

function clipText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function compactContextForPrompt(context: AnalyticsContext): AnalyticsContext {
  return {
    ...context,
    top_releases: context.top_releases.slice(0, 6).map((item) => ({
      ...item,
      title: clipText(item.title, 120),
      artist: clipText(item.artist, 80),
      upc: clipText(item.upc, 32),
      genre: item.genre ? clipText(item.genre, 60) : null
    })),
    top_tracks: context.top_tracks.slice(0, 8).map((item) => ({
      ...item,
      track: clipText(item.track, 120),
      release: clipText(item.release, 120)
    })),
    top_countries: context.top_countries.slice(0, 10),
    top_platforms: context.top_platforms.slice(0, 8).map((item) => ({
      ...item,
      platform: clipText(item.platform, 80)
    })),
    genre_performance: context.genre_performance.slice(0, 8).map((item) => ({
      ...item,
      genre: clipText(item.genre, 80)
    })),
    previous_releases_comparison: context.previous_releases_comparison.slice(0, 6).map((item) => ({
      ...item,
      title: clipText(item.title, 120)
    })),
    chart: context.chart.slice(-45)
  };
}

function extractMessageContentText(content: unknown): string | null {
  if (typeof content === "string") {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const chunks: string[] = [];

  for (const item of content) {
    if (typeof item === "string") {
      if (item.trim().length > 0) chunks.push(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;

    const part = item as { text?: unknown; content?: unknown };
    if (typeof part.text === "string" && part.text.trim().length > 0) {
      chunks.push(part.text);
      continue;
    }
    if (typeof part.content === "string" && part.content.trim().length > 0) {
      chunks.push(part.content);
    }
  }

  const merged = chunks.join("").trim();
  return merged.length > 0 ? merged : null;
}

function parseJsonFromModelText(text: string): unknown {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("AI provider returned empty content");
  }

  try {
    return JSON.parse(normalized) as unknown;
  } catch {
    // Continue with fallbacks.
  }

  const fenced = normalized.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as unknown;
    } catch {
      // Continue with fallbacks.
    }
  }

  const firstBrace = normalized.indexOf("{");
  const lastBrace = normalized.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const objectSlice = normalized.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(objectSlice) as unknown;
    } catch {
      // Fall through to final error.
    }
  }

  throw new Error("AI provider returned invalid JSON");
}

function getProviderHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return "invalid_base_url";
  }
}

function logProviderResponseShape(params: {
  reason: string;
  data: unknown;
  model: string;
  baseUrl: string;
  status?: number;
}): void {
  const root = params.data && typeof params.data === "object"
    ? (params.data as Record<string, unknown>)
    : null;
  const choices = Array.isArray(root?.choices) ? root.choices : null;
  const firstChoice =
    choices && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null;
  const message =
    firstChoice?.message && typeof firstChoice.message === "object"
      ? (firstChoice.message as Record<string, unknown>)
      : null;
  const content = message?.content;

  console.warn("[analytics-ai] provider_response_shape", {
    reason: params.reason,
    status: params.status ?? null,
    providerHost: getProviderHost(params.baseUrl),
    model: params.model,
    hasChoices: Array.isArray(choices),
    choicesCount: choices?.length ?? 0,
    finishReason: typeof firstChoice?.finish_reason === "string" ? firstChoice.finish_reason : null,
    hasMessage: Boolean(message),
    contentType: Array.isArray(content) ? "array" : typeof content,
    contentArrayLength: Array.isArray(content) ? content.length : null
  });
}

function getMessageContentFromPayload(data: unknown): unknown {
  const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (!root) return undefined;

  const choices = Array.isArray(root.choices) ? root.choices : null;
  const firstChoice =
    choices && choices[0] && typeof choices[0] === "object"
      ? (choices[0] as Record<string, unknown>)
      : null;
  const message =
    firstChoice?.message && typeof firstChoice.message === "object"
      ? (firstChoice.message as Record<string, unknown>)
      : null;
  if (message && "content" in message) return message.content;

  // Fallback for response-like payload variants.
  const output = Array.isArray(root.output) ? root.output : null;
  const firstOutput =
    output && output[0] && typeof output[0] === "object"
      ? (output[0] as Record<string, unknown>)
      : null;
  const outputContent = Array.isArray(firstOutput?.content) ? firstOutput.content : null;
  const firstOutputContent =
    outputContent && outputContent[0] && typeof outputContent[0] === "object"
      ? (outputContent[0] as Record<string, unknown>)
      : null;
  if (firstOutputContent && "text" in firstOutputContent) return firstOutputContent.text;

  return undefined;
}

function logAnalyticsAiRawError(scope: string, error: unknown): void {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  console.error("[analytics-ai] raw_error", {
    scope,
    message: raw?.slice(0, 1200) ?? "unknown_error"
  });
}

async function requestViaHttps(params: {
  url: string;
  apiKey: string;
  requestBody: string;
  timeoutMs: number;
}): Promise<{ status: number; bodyText: string }> {
  const target = new URL(params.url);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${params.apiKey}`,
          Connection: "close"
        }
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            bodyText: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(params.timeoutMs, () => {
      req.destroy(new Error("https_request_timeout"));
    });
    req.write(params.requestBody);
    req.end();
  });
}

async function callDeepSeek(params: {
  context: AnalyticsContext;
  question?: string;
}): Promise<AnalyticsAiResponse> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const configuredBaseUrl = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/$/, "");
  const baseUrls = [configuredBaseUrl];
  if (!configuredBaseUrl.endsWith("/v1")) {
    baseUrls.push(`${configuredBaseUrl}/v1`);
  }
  const primaryModel = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  const fallbackModel = process.env.DEEPSEEK_FALLBACK_MODEL ?? "deepseek-v4-flash";

  const buildPayload = (config: {
    model: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
  }) => ({
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    ...(config.jsonMode
      ? {
          response_format: {
            type: "json_object" as const
          }
        }
      : {}),
    stream: false,
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
  });

  const runOnce = async (params: {
    payload: ReturnType<typeof buildPayload>;
    timeoutMs: number;
    model: string;
    baseUrl: string;
    attemptLabel: string;
  }): Promise<AnalyticsAiResponse> => {
    const { payload, timeoutMs, model, baseUrl, attemptLabel } = params;
    const requestBody = JSON.stringify(payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${baseUrl}/chat/completions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Connection: "close",
          Authorization: `Bearer ${apiKey}`
        },
        body: requestBody,
        signal: controller.signal
      });

      let status = response.status;
      let bodyText = await response.text().catch(() => "");

      if (response.ok && !bodyText.trim()) {
        console.warn("[analytics-ai] provider_empty_body", {
          providerHost: getProviderHost(baseUrl),
          model,
          status: response.status,
          attempt: attemptLabel
        });

        try {
          const fallback = await requestViaHttps({
            url,
            apiKey,
            requestBody,
            timeoutMs
          });
          status = fallback.status;
          bodyText = fallback.bodyText;
          console.warn("[analytics-ai] transport_fallback_https", {
            providerHost: getProviderHost(baseUrl),
            model,
            status,
            attempt: attemptLabel,
            hasBody: Boolean(bodyText.trim())
          });
        } catch (transportError) {
          console.warn("[analytics-ai] transport_fallback_https_failed", {
            providerHost: getProviderHost(baseUrl),
            model,
            attempt: attemptLabel,
            error:
              transportError instanceof Error
                ? transportError.message.slice(0, 200)
                : "unknown_transport_error"
          });
        }
      }

      if (status < 200 || status >= 300) {
        const details = bodyText || "";
        const detailLower = details.toLowerCase();

        if (status === 429) {
          throw new Error("AI лимит запросов временно превышен. Попробуйте позже.");
        }
        if (status === 402) {
          throw new Error("AI недоступен из-за ограничений биллинга. Попробуйте позже.");
        }
        if (
          status === 400 &&
          (
            detailLower.includes("context length") ||
            detailLower.includes("max context") ||
            detailLower.includes("max_tokens") ||
            detailLower.includes("token")
          )
        ) {
          throw new Error("AI запрос слишком большой для модели. Попробуйте сузить фильтры.");
        }

        throw new Error(`AI upstream error (${status})`);
      }

      if (!bodyText.trim()) {
        console.warn("[analytics-ai] provider_empty_body_final", {
          providerHost: getProviderHost(baseUrl),
          model,
          status,
          attempt: attemptLabel
        });
        throw new Error("AI provider returned empty content");
      }

      let data: unknown = null;
      try {
        data = JSON.parse(bodyText) as unknown;
      } catch {
        console.warn("[analytics-ai] provider_non_json_body", {
          providerHost: getProviderHost(baseUrl),
          model,
          status: response.status,
          attempt: attemptLabel,
          bodyPreview: bodyText.slice(0, 280)
        });
      }

      const content = extractMessageContentText(getMessageContentFromPayload(data));
      if (!content) {
        logProviderResponseShape({
          reason: "empty_content",
          data,
          model,
          baseUrl,
          status
        });
        throw new Error("AI provider returned empty content");
      }

      const root = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      const choices = Array.isArray(root?.choices) ? root.choices : null;
      const firstChoice =
        choices && choices[0] && typeof choices[0] === "object"
          ? (choices[0] as Record<string, unknown>)
          : null;

      if (typeof firstChoice?.finish_reason === "string" && firstChoice.finish_reason === "length") {
        console.warn("[analytics-ai] provider_truncated_output", {
          providerHost: getProviderHost(baseUrl),
          model,
          attempt: attemptLabel
        });
        throw new Error("AI provider response was truncated");
      }

      const jsonText = content.trim();
      let parsedJson: unknown;
      try {
        parsedJson = parseJsonFromModelText(jsonText);
      } catch {
        console.warn("[analytics-ai] provider_invalid_json", {
          providerHost: getProviderHost(baseUrl),
          model,
          attempt: attemptLabel,
          contentLength: jsonText.length
        });
        throw new Error("AI provider returned invalid JSON");
      }
      return safeParseAiResponse(parsedJson);
    } finally {
      clearTimeout(timer);
    }
  };

  const attempts: Array<{
    label: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
  }> = [];

  for (const baseUrl of baseUrls) {
    attempts.push({
      label: `json_primary@${baseUrl}`,
      model: primaryModel,
      baseUrl,
      timeoutMs: 14_000,
      temperature: 0.2,
      maxTokens: 1600,
      jsonMode: true
    });
    attempts.push({
      label: `text_primary@${baseUrl}`,
      model: primaryModel,
      baseUrl,
      timeoutMs: 12_000,
      temperature: 0,
      maxTokens: 1200,
      jsonMode: false
    });

    if (fallbackModel !== primaryModel) {
      attempts.push({
        label: `text_fallback_model@${baseUrl}`,
        model: fallbackModel,
        baseUrl,
        timeoutMs: 12_000,
        temperature: 0,
        maxTokens: 1200,
        jsonMode: false
      });
    }
  }

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      return await runOnce({
        payload: buildPayload({
          model: attempt.model,
          temperature: attempt.temperature,
          maxTokens: attempt.maxTokens,
          jsonMode: attempt.jsonMode
        }),
        timeoutMs: attempt.timeoutMs,
        model: attempt.model,
        baseUrl: attempt.baseUrl,
        attemptLabel: attempt.label
      });
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const retryable =
        message.includes("empty content") ||
        message.includes("invalid json") ||
        message.includes("truncated") ||
        message.includes("upstream error (5");

      console.warn("[analytics-ai] attempt_failed", {
        attempt: attempt.label,
        model: attempt.model,
        retryable,
        reason: error instanceof Error ? error.message.slice(0, 240) : "unknown_error"
      });

      if (!retryable) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI provider returned empty content");
}

function normalizeMistralBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

async function callMistral(params: {
  context: AnalyticsContext;
  question?: string;
}): Promise<AnalyticsAiResponse> {
  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not configured");
  }

  const baseUrl = normalizeMistralBaseUrl(process.env.MISTRAL_BASE_URL ?? "https://api.mistral.ai");
  const primaryModel = process.env.MISTRAL_MODEL ?? "mistral-small-latest";
  const fallbackModel = process.env.MISTRAL_FALLBACK_MODEL ?? "mistral-medium-latest";
  const timeoutMs = 18_000;

  const buildPayload = (config: {
    model: string;
    temperature: number;
    maxTokens: number;
    jsonMode: boolean;
  }) => ({
    model: config.model,
    temperature: config.temperature,
    max_tokens: config.maxTokens,
    ...(config.jsonMode
      ? {
          response_format: {
            type: "json_object" as const
          }
        }
      : {}),
    stream: false,
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
  });

  const runOnce = async (config: {
    attempt: string;
    payload: ReturnType<typeof buildPayload>;
    model: string;
  }): Promise<AnalyticsAiResponse> => {
    const { attempt, payload, model } = config;
    const requestBody = JSON.stringify(payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: requestBody,
        signal: controller.signal
      });

      const bodyText = await response.text().catch(() => "");

      if (!response.ok) {
        const detailLower = bodyText.toLowerCase();
        if (response.status === 401) {
          throw new Error("AI провайдер не принял ключ авторизации.");
        }
        if (response.status === 402) {
          throw new Error("AI недоступен из-за ограничений биллинга. Попробуйте позже.");
        }
        if (response.status === 429) {
          throw new Error("AI лимит запросов временно превышен. Попробуйте позже.");
        }
        if (
          response.status === 400 &&
          (
            detailLower.includes("context") ||
            detailLower.includes("token") ||
            detailLower.includes("max_tokens")
          )
        ) {
          throw new Error("AI запрос слишком большой для модели. Попробуйте сузить фильтры.");
        }
        throw new Error(`AI upstream error (${response.status})`);
      }

      if (!bodyText.trim()) {
        console.warn("[analytics-ai] mistral_empty_body", {
          attempt,
          providerHost: getProviderHost(baseUrl),
          model
        });
        throw new Error("AI provider returned empty content");
      }

      let data: unknown = null;
      try {
        data = JSON.parse(bodyText) as unknown;
      } catch {
        console.warn("[analytics-ai] mistral_non_json_body", {
          attempt,
          providerHost: getProviderHost(baseUrl),
          model,
          bodyPreview: bodyText.slice(0, 280)
        });
      }

      const content = extractMessageContentText(getMessageContentFromPayload(data));
      if (!content) {
        logProviderResponseShape({
          reason: "mistral_empty_content",
          data,
          model,
          baseUrl
        });
        throw new Error("AI provider returned empty content");
      }

      const parsedJson = parseJsonFromModelText(content);
      return safeParseAiResponse(parsedJson);
    } finally {
      clearTimeout(timer);
    }
  };

  const attempts: Array<{
    attempt: string;
    payload: ReturnType<typeof buildPayload>;
    model: string;
  }> = [
    {
      attempt: "mistral_json_primary",
      model: primaryModel,
      payload: buildPayload({
        model: primaryModel,
        temperature: 0.2,
        maxTokens: 1800,
        jsonMode: true
      })
    },
    {
      attempt: "mistral_text_primary",
      model: primaryModel,
      payload: buildPayload({
        model: primaryModel,
        temperature: 0,
        maxTokens: 1400,
        jsonMode: false
      })
    }
  ];

  if (fallbackModel !== primaryModel) {
    attempts.push({
      attempt: "mistral_text_fallback_model",
      model: fallbackModel,
      payload: buildPayload({
        model: fallbackModel,
        temperature: 0,
        maxTokens: 1400,
        jsonMode: false
      })
    });
  }

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await runOnce(attempt);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const retryable =
        message.includes("empty content") ||
        message.includes("invalid json") ||
        message.includes("truncated") ||
        message.includes("upstream error (5");

      console.warn("[analytics-ai] attempt_failed", {
        provider: "mistral",
        attempt: attempt.attempt,
        model: attempt.model,
        retryable,
        reason: error instanceof Error ? error.message.slice(0, 240) : "unknown_error"
      });

      if (!retryable) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI provider returned empty content");
}

function buildLocalFallbackAnalysis(context: AnalyticsContext, question?: string): AnalyticsAiResponse {
  const streamsDelta = context.overview.streams_change_percent;
  const payStreamsDelta = context.overview.pay_streams_change_percent;
  const topRelease = context.top_releases[0] ?? null;
  const topCountry = context.top_countries[0] ?? null;
  const topPlatform = context.top_platforms[0] ?? null;

  const trendLabel =
    streamsDelta == null
      ? "динамика не определена"
      : streamsDelta > 0
        ? `рост ${streamsDelta}%`
        : streamsDelta < 0
          ? `снижение ${Math.abs(streamsDelta)}%`
          : "без изменений";

  const payTrendLabel =
    payStreamsDelta == null
      ? "динамика pay streams не определена"
      : payStreamsDelta > 0
        ? `рост pay streams ${payStreamsDelta}%`
        : payStreamsDelta < 0
          ? `снижение pay streams ${Math.abs(payStreamsDelta)}%`
          : "pay streams без изменений";

  const summaryQuestion =
    question && question.trim().length > 0
      ? ` Учтён вопрос: «${clipText(question.trim(), 120)}».`
      : "";

  const keyFindings: AnalyticsAiResponse["key_findings"] = [
    {
      title: "Текущая динамика по стримам",
      details: `За выбранный период зафиксирован ${trendLabel}, при этом ${payTrendLabel}.`,
      based_on: `overview.total_streams=${context.overview.total_streams}, overview.total_pay_streams=${context.overview.total_pay_streams}, streams_change_percent=${streamsDelta ?? "null"}, pay_streams_change_percent=${payStreamsDelta ?? "null"}`
    }
  ];

  if (topRelease) {
    keyFindings.push({
      title: "Лидирующий релиз",
      details: `Сильнее всего трафик даёт релиз «${topRelease.title}» (${topRelease.streams} streams).`,
      based_on: `top_releases[0]: release_id=${topRelease.release_id}, streams=${topRelease.streams}, trend=${topRelease.trend}`
    });
  }

  if (topCountry || topPlatform) {
    keyFindings.push({
      title: "Ключевая география и площадка",
      details: `Основной вклад сейчас дают ${topCountry ? `страна ${topCountry.country}` : "страны из топа"} и ${topPlatform ? `площадка ${topPlatform.platform}` : "ведущие площадки"}.`,
      based_on: `top_countries[0]=${topCountry ? `${topCountry.country}/${topCountry.streams}` : "n/a"}, top_platforms[0]=${topPlatform ? `${topPlatform.platform}/${topPlatform.streams}` : "n/a"}`
    });
  }

  const recommendations: AnalyticsAiResponse["recommendations"] = [
    {
      title: "Сфокусировать промо на лидирующем релизе",
      details: topRelease
        ? `Усильте продвижение «${topRelease.title}» и рядом протестируйте 1-2 похожих креатива, чтобы масштабировать текущий спрос.`
        : "Выберите 1 релиз с максимальными streams за период и масштабируйте его промо первым.",
      priority: "high"
    },
    {
      title: "Закрепить сильные страны и площадки",
      details:
        "Повторите успешные сценарии в странах/площадках из топа, а эксперименты запускайте в отдельном бюджетном пуле, чтобы не просадить базовую воронку.",
      priority: "medium"
    },
    {
      title: "Контроль weekly-ритма релизов",
      details:
        "Держите стабильный ритм релизов и сравнивайте 7-дневные окна по streams/pay streams, чтобы быстро ловить просадки до накопления эффекта.",
      priority: "medium"
    }
  ];

  const risks: AnalyticsAiResponse["risks"] = [
    {
      title: "Зависимость от одного источника трафика",
      details:
        "Если доля топ-страны или топ-площадки слишком высокая, любое изменение алгоритмов может заметно просадить результат."
    }
  ];

  if (streamsDelta != null && streamsDelta < 0) {
    risks.push({
      title: "Нисходящий тренд по охвату",
      details:
        "Текущая динамика streams отрицательная — без быстрого обновления промо и контент-плана снижение может ускориться."
    });
  }

  const nextSteps: string[] = [
    "Соберите weekly-срез по streams/pay streams за последние 4 недели и сравните с предыдущими 4 неделями.",
    "Выделите 1 релиз и 1 площадку для приоритетного теста креативов на 7 дней.",
    "По итогам недели зафиксируйте, что масштабировать, а что отключить."
  ];

  return {
    summary:
      `Автоанализ построен на локальной аналитике кабинета: ${trendLabel}, ${payTrendLabel}.${summaryQuestion}`,
    key_findings: keyFindings,
    recommendations: recommendations,
    risks,
    next_steps: nextSteps,
    best_performing: {
      release: topRelease?.title ?? null,
      track: context.top_tracks[0]?.track ?? null,
      country: topCountry?.country ?? null,
      platform: topPlatform?.platform ?? null,
      genre: context.genre_performance[0]?.genre ?? null
    }
  };
}

async function resolveLatestAndPreviousReportDates(prisma: PrismaClient, params: {
  user_id: string;
  artistId?: string;
  release_id?: string;
}): Promise<{ latest: Date | null; previous: Date | null }> {
  if (!hasAnalyticsDataStorage(prisma)) {
    return { latest: null, previous: null };
  }

  const grouped = await prisma.analytics_report_snapshots.groupBy({
    by: ["report_date"],
    where: {
      user_id: params.user_id,
      ...(params.release_id ? { release_id: params.release_id } : {}),
      ...(params.artistId ? { Release: { artistProfileId: params.artistId } } : {})
    },
    _sum: {
      streams: true
    },
    orderBy: {
      report_date: "desc"
    },
    take: 2
  });

  return {
    latest: grouped[0]?.report_date ?? null,
    previous: grouped[1]?.report_date ?? null
  };
}

async function ensureOwnership(prisma: PrismaClient, params: {
  user_id: string;
  artistId?: string;
  release_id?: string;
}): Promise<void> {
  if (params.artistId) {
    const artist = await prisma.artistProfile.findFirst({
      where: {
        id: params.artistId,
        userId: params.user_id
      },
      select: { id: true }
    });

    if (!artist) {
      throw new Error("Artist not found for this user");
    }
  }

  if (params.release_id) {
    const release = await prisma.release.findFirst({
      where: {
        id: params.release_id,
        userId: params.user_id,
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
      analytics_ai_insights?: Partial<AnalyticsAiInsightRepo>;
    }).analytics_ai_insights;

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
    const user_id = input.user_id;
    const artistId = normalizeId(input.artistId);
    const release_id = normalizeId(input.release_id);
    const platform = input.platform?.trim() || undefined;
    const period_days = clampPeriodDays(input.period_days);

    await ensureOwnership(this.prisma, {
      user_id,
      artistId,
      release_id
    });

    if (!hasAnalyticsDataStorage(this.prisma)) {
      return buildEmptyContext({
        user_id,
        artistId,
        release_id,
        period_days
      });
    }

    let latest: Date | null = null;
    let previous: Date | null = null;
    try {
      const range = await resolveLatestAndPreviousReportDates(this.prisma, {
        user_id,
        artistId,
        release_id
      });
      latest = range.latest;
      previous = range.previous;
    } catch (error) {
      if (isAnalyticsDataStorageError(error)) {
        return buildEmptyContext({
          user_id,
          artistId,
          release_id,
          period_days
        });
      }
      throw error;
    }

    if (!latest) {
      return {
        user_id: user_id,
        artist_id: artistId ?? null,
        selected_release_id: release_id ?? null,
        period_days: period_days,
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
          user_id,
          release_id,
          platform,
          days: period_days
        })
      : null;

    const rangeStart = new Date(latest);
    rangeStart.setUTCHours(0, 0, 0, 0);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - period_days + 1);

    const snapshotBaseWhere = {
      user_id,
      ...(release_id ? { release_id } : {}),
      ...(platform ? { platform } : {}),
      ...(artistId ? { Release: { artistProfileId: artistId } } : {})
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
      this.prisma.analytics_report_snapshots.aggregate({
        where: {
          ...snapshotBaseWhere,
          report_date: latest
        },
        _sum: {
          streams: true,
          pay_streams: true
        }
      }),
      previous
        ? this.prisma.analytics_report_snapshots.aggregate({
            where: {
              ...snapshotBaseWhere,
              report_date: previous
            },
            _sum: {
              streams: true,
              pay_streams: true
            }
          })
        : Promise.resolve({ _sum: { streams: 0, pay_streams: 0 } }),
      this.prisma.analytics_report_snapshots.groupBy({
        by: ["report_date"],
        where: {
          ...snapshotBaseWhere,
          report_date: {
            gte: rangeStart,
            lte: latest
          }
        },
        _sum: {
          streams: true,
          pay_streams: true
        },
        orderBy: {
          report_date: "asc"
        }
      }),
      this.prisma.analytics_report_snapshots.groupBy({
        by: ["country"],
        where: {
          ...snapshotBaseWhere,
          report_date: latest
        },
        _sum: {
          streams: true,
          pay_streams: true
        },
        orderBy: {
          _sum: {
            streams: "desc"
          }
        },
        take: 12
      }),
      previous
        ? this.prisma.analytics_report_snapshots.groupBy({
            by: ["country"],
            where: {
              ...snapshotBaseWhere,
              report_date: previous
            },
            _sum: {
              streams: true,
              pay_streams: true
            }
          })
        : Promise.resolve([]),
      this.prisma.analytics_report_snapshots.groupBy({
        by: ["platform"],
        where: {
          ...snapshotBaseWhere,
          report_date: latest
        },
        _sum: {
          streams: true,
          pay_streams: true
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
        ? this.prisma.analytics_report_snapshots.groupBy({
            by: ["platform"],
            where: {
              ...snapshotBaseWhere,
              report_date: previous
            },
            _sum: {
              streams: true,
              pay_streams: true
            }
          }).catch((error) => {
            if (isUnknownSnapshotPlatformFieldError(error)) return [];
            throw error;
          })
        : Promise.resolve([]),
      this.prisma.analytics_report_snapshots.groupBy({
        by: ["release_id"],
        where: {
          ...snapshotBaseWhere,
          report_date: latest
        },
        _sum: {
          streams: true
        }
      }),
      this.prisma.analytics_report_snapshots.groupBy({
        by: ["release_id"],
        where: {
          ...snapshotBaseWhere,
          report_date: latest
        },
        _sum: {
          streams: true,
          pay_streams: true
        },
        orderBy: {
          _sum: {
            streams: "desc"
          }
        },
        take: 8
      }),
      previous
        ? this.prisma.analytics_report_snapshots.groupBy({
            by: ["release_id"],
            where: {
              ...snapshotBaseWhere,
              report_date: previous
            },
            _sum: {
              streams: true,
              pay_streams: true
            }
          })
        : Promise.resolve([]),
      this.prisma.analytics_report_snapshots.groupBy({
        by: ["release_id", "track_name"],
        where: {
          ...snapshotBaseWhere,
          report_date: latest,
          track_name: {
            not: null
          }
        },
        _sum: {
          streams: true,
          pay_streams: true
        },
        orderBy: {
          _sum: {
            streams: "desc"
          }
        },
        take: 10
      }),
      previous
        ? this.prisma.analytics_report_snapshots.groupBy({
            by: ["release_id", "track_name"],
            where: {
              ...snapshotBaseWhere,
              report_date: previous,
              track_name: {
                not: null
              }
            },
            _sum: {
              streams: true
            }
          })
        : Promise.resolve([]),
      this.prisma.analytics_report_snapshots.findMany({
        where: {
          ...snapshotBaseWhere,
          report_date: latest
        },
        select: {
          streams: true,
          pay_streams: true,
          Release: {
            select: {
              genre: true
            }
          }
        }
      }),
      this.prisma.analytics_daily_summaries.findMany({
        where: {
          user_id,
          release_id: {
            not: null
          },
          report_date: latest,
          ...(artistId ? { Release: { artistProfileId: artistId } } : {})
        },
        select: {
          release_id: true,
          total_streams: true,
          total_pay_streams: true,
          Release: {
            select: {
              title: true,
              releaseDate: true
            }
          }
        },
        orderBy: {
          Release: {
            releaseDate: "desc"
          }
        },
        take: 8
      })
    ]);

    const releaseIds = Array.from(
      new Set([
        ...releaseGroupsCurrent.map((item) => item.release_id),
        ...trackGroupsCurrent.map((item) => item.release_id),
        ...releaseComparisonRows
          .map((item) => item.release_id)
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
            User: {
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
        item.release_id,
        {
          streams: item._sum.streams ?? 0,
          pay_streams: item._sum.pay_streams ?? 0
        }
      ])
    );

    const topReleases: AnalyticsContext["top_releases"] = releaseGroupsCurrent
      .map((item) => {
        const meta = releaseMetaById.get(item.release_id);
        const currentStreams = item._sum.streams ?? 0;
        const currentPayStreams = item._sum.pay_streams ?? 0;
        const previousValues = previousReleaseById.get(item.release_id);
        const previousStreams = previousValues?.streams ?? 0;
        const changePercent = calculateChangePercent(currentStreams, previousStreams);

        return {
          release_id: item.release_id,
          title: meta?.title ?? "Unknown release",
          artist: meta?.User.name ?? "Unknown artist",
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
        `${item.release_id}:${item.track_name ?? ""}`,
        item._sum.streams ?? 0
      ])
    );

    const topTracks: AnalyticsContext["top_tracks"] = trackGroupsCurrent.map((item) => {
      const key = `${item.release_id}:${item.track_name ?? ""}`;
      const currentStreams = item._sum.streams ?? 0;
      const previousStreams = previousTrackByKey.get(key) ?? 0;

      return {
        track: item.track_name ?? "Unknown track",
        release: releaseMetaById.get(item.release_id)?.title ?? "Unknown release",
        streams: currentStreams,
        pay_streams: item._sum.pay_streams ?? 0,
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
        pay_streams: item._sum.pay_streams ?? 0,
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
        pay_streams: item._sum.pay_streams ?? 0,
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
        pay_streams: number;
        rows: number;
      }
    >();

    for (const row of latestRowsForGenre) {
      const genre = row.Release?.genre || "Unknown";
      const entry = genreAccumulator.get(genre) ?? { streams: 0, pay_streams: 0, rows: 0 };
      entry.streams += row.streams;
      entry.pay_streams += row.pay_streams;
      entry.rows += 1;
      genreAccumulator.set(genre, entry);
    }

    const previousGenreAccumulator = new Map<string, number>();
    if (previous) {
      const previousRowsForGenre = await this.prisma.analytics_report_snapshots.findMany({
        where: {
          ...snapshotBaseWhere,
          report_date: previous
        },
        select: {
          streams: true,
          Release: {
            select: {
              genre: true
            }
          }
        }
      });

      for (const row of previousRowsForGenre) {
        const genre = row.Release?.genre || "Unknown";
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
          pay_streams: value.pay_streams,
          avg_change_percent: calculateChangePercent(value.streams, previousStreams)
        };
      })
      .sort((a, b) => b.streams - a.streams)
      .slice(0, 8);

    const previousReleasesComparison: AnalyticsContext["previous_releases_comparison"] = releaseComparisonRows
      .filter((item): item is typeof item & { release_id: string } => Boolean(item.release_id))
      .filter((item) => item.release_id !== release_id)
      .map((item) => ({
        release_id: item.release_id,
        title: item.Release?.title ?? "Unknown release",
        release_date: item.Release?.releaseDate
          ? toDateKey(item.Release.releaseDate)
          : toDateKey(latest),
        streams_30d: item.total_streams,
        pay_streams_30d: item.total_pay_streams
      }))
      .slice(0, 7);

    const currentStreams = overview?.totalStreams ?? (currentTotal._sum.streams ?? 0);
    const currentPayStreams = overview?.totalPayStreams ?? (currentTotal._sum.pay_streams ?? 0);
    const previousStreams = previousTotal._sum.streams ?? 0;
    const previousPayStreams = previousTotal._sum.pay_streams ?? 0;
    const chart: AnalyticsContext["chart"] = overview
      ? overview.chart.map((item) => ({
          date: item.date,
          streams: item.streams,
          pay_streams: item.pay_streams
        }))
      : chartGroups.map((item) => ({
          date: toDateKey(item.report_date),
          streams: item._sum.streams ?? 0,
          pay_streams: item._sum.pay_streams ?? 0
        }));

    const releasesCount = releasesCurrent.length;
    const topCountry = countriesCurrent[0]?.country ?? null;

    return {
      user_id: user_id,
      artist_id: artistId ?? null,
        selected_release_id: release_id ?? null,
      period_days: period_days,
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
    const normalizedQuestion = normalizeQuestion(question);
    try {
      const provider = resolveAiProvider();
      console.info("[analytics-ai] provider_selected", { provider });
      if (provider === "mistral") {
        try {
          return await callMistral({
            context,
            question: normalizedQuestion
          });
        } catch (mistralError) {
          logAnalyticsAiRawError("mistral_provider", mistralError);
          // Safety fallback to DeepSeek if explicitly unavailable.
          if (process.env.DEEPSEEK_API_KEY?.trim()) {
            return await callDeepSeek({
              context,
              question: normalizedQuestion
            });
          }
          throw mistralError;
        }
      }

      return await callDeepSeek({
        context,
        question: normalizedQuestion
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      const canFallback =
        message.includes("empty content") ||
        message.includes("invalid json") ||
        message.includes("truncated") ||
        message.includes("upstream error (5") ||
        message.includes("https_request_timeout");

      if (canFallback) {
        console.warn("[analytics-ai] using_local_fallback_analysis", {
          reason: error instanceof Error ? error.message.slice(0, 220) : "unknown_error"
        });
        return buildLocalFallbackAnalysis(context, normalizedQuestion);
      }

      throw error;
    }
  }

  async saveInsight(params: {
    user_id: string;
    artistId?: string;
    release_id?: string;
    period_days: number;
    filtersHash: string;
    contextSnapshot: unknown;
    status: AnalyticsAiInsightStatus;
    aiResponse?: unknown;
    error_message?: string;
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
              error_message: params.error_message ?? null,
              contextSnapshot: params.contextSnapshot as never,
              period_days: params.period_days,
              filtersHash: params.filtersHash,
              artistId: params.artistId ?? null,
              release_id: params.release_id ?? null
            },
            select: {
              id: true,
              status: true,
              period_days: true,
              filtersHash: true,
              contextSnapshot: true,
              aiResponse: true,
              error_message: true,
              created_at: true,
              updated_at: true
            }
          })
        : await repo.create({
            data: {
              user_id: params.user_id,
              artistId: params.artistId ?? null,
              release_id: params.release_id ?? null,
              period_days: params.period_days,
              filtersHash: params.filtersHash,
              contextSnapshot: params.contextSnapshot as never,
              status: params.status,
              aiResponse: (params.aiResponse ?? null) as never,
              error_message: params.error_message ?? null
            },
            select: {
              id: true,
              status: true,
              period_days: true,
              filtersHash: true,
              contextSnapshot: true,
              aiResponse: true,
              error_message: true,
              created_at: true,
              updated_at: true
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
    user_id: string;
    artistId?: string;
    release_id?: string;
    platform?: string;
    period_days?: number;
    question?: string;
  }): Promise<AnalyticsAiInsightView | null> {
    const artistId = normalizeId(params.artistId);
    const release_id = normalizeId(params.release_id);
    const platform = params.platform?.trim() || undefined;
    const period_days = clampPeriodDays(params.period_days);
    const question = normalizeQuestion(params.question);
    const repo = this.analyticsAiInsightRepo;

    await ensureOwnership(this.prisma, {
      user_id: params.user_id,
      artistId,
      release_id
    });

    const filtersHash = createFiltersHash({
      user_id: params.user_id,
      artistId,
      release_id,
      platform,
      period_days,
      question
    });

    let row: AnalyticsAiInsightRow | null;
    try {
      row = await repo.findFirst({
        where: {
          user_id: params.user_id,
          filtersHash
        },
        orderBy: {
          created_at: "desc"
        },
        select: {
          id: true,
          status: true,
          period_days: true,
          filtersHash: true,
          contextSnapshot: true,
          aiResponse: true,
          error_message: true,
          created_at: true,
          updated_at: true
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
            user_id: params.user_id,
            artistId: artistId ?? null,
            release_id: release_id ?? null,
            period_days
          },
          orderBy: {
            created_at: "desc"
          },
          select: {
            id: true,
            status: true,
            period_days: true,
            filtersHash: true,
            contextSnapshot: true,
            aiResponse: true,
            error_message: true,
            created_at: true,
            updated_at: true
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
    const user_id = params.role === "ADMIN" && params.targetUserId ? params.targetUserId : params.user_id;
    const artistId = normalizeId(params.artistId);
    const release_id = normalizeId(params.release_id);
    const platform = params.platform?.trim() || undefined;
    const period_days = clampPeriodDays(params.period_days);
    const question = normalizeQuestion(params.question);

    await ensureOwnership(this.prisma, {
      user_id,
      artistId,
      release_id
    });

    const filtersHash = createFiltersHash({
      user_id,
      artistId,
      release_id,
      platform,
      period_days,
      question
    });

    let repo: AnalyticsAiInsightRepo;
    try {
      repo = this.analyticsAiInsightRepo;
    } catch (error) {
      if (error instanceof Error && error.message.includes(AI_STORAGE_UNAVAILABLE_MESSAGE)) {
        return this.requestTransientAnalysis({
          user_id,
          artistId,
          release_id,
          platform,
          period_days,
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
          user_id,
          status: AnalyticsAiInsightStatus.PROCESSING
        },
        orderBy: {
          created_at: "desc"
        },
        select: {
          id: true,
          status: true,
          period_days: true,
          filtersHash: true,
          contextSnapshot: true,
          aiResponse: true,
          error_message: true,
          created_at: true,
          updated_at: true
        }
      });
    } catch (error) {
      if (isAnalyticsAiStorageError(error)) {
        return this.requestTransientAnalysis({
          user_id,
          artistId,
          release_id,
          platform,
          period_days,
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
          user_id,
          filtersHash,
          status: AnalyticsAiInsightStatus.SUCCESS,
          created_at: {
            gte: new Date(Date.now() - 6 * 60 * 60 * 1000)
          }
        },
        orderBy: {
          created_at: "desc"
        },
        select: {
          id: true,
          status: true,
          period_days: true,
          filtersHash: true,
          contextSnapshot: true,
          aiResponse: true,
          error_message: true,
          created_at: true,
          updated_at: true
        }
      });
    } catch (error) {
      if (isAnalyticsAiStorageError(error)) {
        return this.requestTransientAnalysis({
          user_id,
          artistId,
          release_id,
          platform,
          period_days,
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

    const aiAccess = await checkAiAccess(this.prisma, user_id);
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
      user_id,
      artistId,
      release_id,
      platform,
      period_days,
      question
    });

    const contextSnapshot = {
      question: question ?? null,
      analytics_context: context
    };

    let processingInsight: AnalyticsAiInsightView;
    try {
      processingInsight = await this.saveInsight({
        user_id,
        artistId,
        release_id,
        period_days,
        filtersHash,
        contextSnapshot,
        status: AnalyticsAiInsightStatus.PROCESSING
      });
    } catch (error) {
      if (isAnalyticsAiStorageError(error)) {
        return this.requestTransientAnalysis({
          user_id,
          artistId,
          release_id,
          platform,
          period_days,
          question,
          filtersHash
        });
      }
      throw error;
    }

    try {
      await incrementAiUsage(this.prisma, user_id);

      console.info("[analytics-ai] request", {
        user_id,
        artistId: artistId ?? null,
        release_id: release_id ?? null,
        period_days,
        insightId: processingInsight.id,
        contextBytes: JSON.stringify(contextSnapshot).length
      });

      const aiResponse = await this.analyze(context, question);

      const successInsight = await this.saveInsight({
        user_id,
        artistId,
        release_id,
        period_days,
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
      logAnalyticsAiRawError("requestAnalysis", error);
      const rawErrorMessage = error instanceof Error ? error.message.slice(0, 500) : "AI analyze failed";
      const error_message = sanitizeAnalyticsAiErrorMessage(rawErrorMessage);

      try {
        const failedInsight = await this.saveInsight({
          user_id,
          artistId,
          release_id,
          period_days,
          filtersHash,
          contextSnapshot,
          status: AnalyticsAiInsightStatus.FAILED,
          error_message,
          existingInsightId: processingInsight.id
        });

        return {
          status: "failed",
          insight: failedInsight
        };
      } catch (saveError) {
        if (isAnalyticsAiStorageError(saveError)) {
          return this.requestTransientAnalysis({
            user_id,
            artistId,
            release_id,
            platform,
            period_days,
            question,
            filtersHash
          });
        }
        throw saveError;
      }
    }
  }

  private async requestTransientAnalysis(params: {
    user_id: string;
    artistId?: string;
    release_id?: string;
    platform?: string;
    period_days: number;
    question?: string;
    filtersHash: string;
  }): Promise<RequestAnalysisResult> {
    let context: AnalyticsContext;
    try {
      context = await this.buildContext({
        user_id: params.user_id,
        artistId: params.artistId,
        release_id: params.release_id,
        platform: params.platform,
        period_days: params.period_days,
        question: params.question
      });
    } catch (error) {
      if (isAnalyticsDataStorageError(error)) {
        context = buildEmptyContext({
          user_id: params.user_id,
          artistId: params.artistId,
          release_id: params.release_id,
          period_days: params.period_days
        });
      } else {
        throw error;
      }
    }

    const created_at = new Date().toISOString();
    const transientId = `transient-${Date.now()}`;

    try {
      const aiResponse = await this.analyze(context, params.question);
      return {
        status: "success",
        insight: {
          id: transientId,
          status: "success",
          period_days: params.period_days,
          filters_hash: params.filtersHash,
          question: params.question ?? null,
          created_at: created_at,
          updated_at: created_at,
          error_message: null,
          response: aiResponse
        }
      };
    } catch (error) {
      logAnalyticsAiRawError("requestTransientAnalysis", error);
      const rawMessage = error instanceof Error ? error.message.slice(0, 500) : "AI analyze failed";
      const message = sanitizeAnalyticsAiErrorMessage(rawMessage);
      return {
        status: "failed",
        insight: {
          id: transientId,
          status: "failed",
          period_days: params.period_days,
          filters_hash: params.filtersHash,
          question: params.question ?? null,
          created_at: created_at,
          updated_at: created_at,
          error_message: message,
          response: null
        }
      };
    }
  }
}
