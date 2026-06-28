function readFalKey(): string {
  return process.env.FAL_KEY?.trim() ?? "";
}

function normalizeBaseUrl(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/\/+$/u, "");
}

function normalizeFalModelPath(modelId: string): string {
  return modelId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function buildFalModelCandidates(modelId: string): string[] {
  const trimmed = modelId.trim().replace(/^\/+|\/+$/gu, "");
  if (!trimmed) return [];

  const candidates = new Set<string>([trimmed]);

  if (trimmed.startsWith("fal-ai/")) {
    const stripped = trimmed.slice("fal-ai/".length).trim();
    if (stripped) {
      candidates.add(stripped);
    }
  } else {
    candidates.add(`fal-ai/${trimmed}`);
  }

  return [...candidates];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractUrlFromValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:") || trimmed.startsWith("/")) {
      return trimmed;
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const url = extractUrlFromValue(item);
      if (url) return url;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  for (const key of [
    "url",
    "image_url",
    "video_url",
    "audio_url",
    "file_url",
    "download_url",
    "cdn_url",
    "href"
  ]) {
    const nested = extractUrlFromValue(value[key]);
    if (nested) return nested;
  }

  for (const nestedValue of Object.values(value)) {
    const url = extractUrlFromValue(nestedValue);
    if (url) return url;
  }

  return null;
}

function extractFalRequestId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const requestId = payload.request_id ?? payload.requestId ?? payload.id ?? null;
  return typeof requestId === "string" && requestId.trim() ? requestId.trim() : null;
}

function extractFalStatus(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const raw = payload.status ?? payload.state ?? payload.phase ?? null;
  return typeof raw === "string" && raw.trim() ? raw.trim().toUpperCase() : null;
}

function extractFalOutput(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;
  for (const key of ["output", "result", "data", "response", "payload"]) {
    if (key in payload) return payload[key];
  }
  return payload;
}

async function requestJson(params: {
  url: string;
  apiKey: string;
  body: unknown;
  method?: "GET" | "POST";
  timeoutMs?: number;
}): Promise<{ ok: boolean; status: number; payload: unknown; rawText: string }> {
  const controller = new AbortController();
  const timeoutMs = params.timeoutMs ?? 20_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(params.url, {
      method: params.method ?? "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Key ${params.apiKey}`
      },
      body: params.method === "GET" ? undefined : JSON.stringify(params.body),
      signal: controller.signal
    });

    const rawText = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      payload: rawText ? parseJson(rawText) : null,
      rawText
    };
  } finally {
    clearTimeout(timer);
  }
}

async function pollFalRequest(params: {
  statusUrl: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<unknown> {
  const deadline = Date.now() + (params.timeoutMs ?? 90_000);

  while (Date.now() < deadline) {
    const response = await requestJson({
      url: params.statusUrl,
      apiKey: params.apiKey,
      body: {},
      method: "GET",
      timeoutMs: Math.min(20_000, deadline - Date.now())
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error("fal.ai request status was not found.");
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("fal.ai authorization failed.");
      }
      throw new Error(`fal.ai queue request failed (${response.status}).`);
    }

    const payload = response.payload;
    const status = extractFalStatus(payload);
    const output = extractFalOutput(payload);
    const resultUrl = extractUrlFromValue(output);

    if (resultUrl) {
      return output;
    }

    if (status && ["COMPLETED", "COMPLETED_SUCCESS", "DONE", "SUCCESS", "SUCCEEDED", "FINISHED"].includes(status)) {
      return output;
    }

    if (status && ["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(status)) {
      throw new Error("fal.ai generation failed.");
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error("fal.ai request timed out.");
}

async function invokeFalEndpoint(params: {
  modelId: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<unknown> {
  const apiKey = getFalApiKey();
  const baseUrl = normalizeBaseUrl(process.env.FAL_BASE_URL, "https://fal.run");
  const queueBaseUrl = normalizeBaseUrl(process.env.FAL_QUEUE_BASE_URL, "https://queue.fal.run");
  const requestBodies = [params.input, { arguments: params.input }, { input: params.input }];
  const modelCandidates = buildFalModelCandidates(params.modelId);

  if (modelCandidates.length === 0) {
    throw new Error("fal.ai model id is required.");
  }

  for (const candidateModelId of modelCandidates) {
    const modelPath = normalizeFalModelPath(candidateModelId);

    for (const body of requestBodies) {
      const directResponse = await requestJson({
        url: `${baseUrl}/${modelPath}`,
        apiKey,
        body,
        timeoutMs: params.timeoutMs ?? 25_000
      });

      if (directResponse.ok) {
        const directPayload = directResponse.payload;
        const directOutput = extractFalOutput(directPayload);
        const directUrl = extractUrlFromValue(directOutput);
        if (directUrl) {
          return directOutput;
        }

        const requestId = extractFalRequestId(directPayload);
        const statusUrl =
          (isRecord(directPayload) && typeof directPayload.status_url === "string" && directPayload.status_url) ||
          (isRecord(directPayload) && typeof directPayload.statusUrl === "string" && directPayload.statusUrl) ||
          (requestId ? `${queueBaseUrl}/${modelPath}/requests/${encodeURIComponent(requestId)}` : null);

        if (statusUrl) {
          return await pollFalRequest({
            statusUrl,
            apiKey,
            timeoutMs: Math.max(45_000, params.timeoutMs ?? 90_000)
          });
        }

        return directOutput;
      }

      if (![400, 401, 403, 404, 405, 422].includes(directResponse.status)) {
        break;
      }

      if (directResponse.status === 401 || directResponse.status === 403) {
        throw new Error("fal.ai authorization failed.");
      }
    }
  }

  const queueResponse = await requestJson({
    url: `${queueBaseUrl}/${normalizeFalModelPath(modelCandidates[0])}`,
    apiKey: getFalApiKey(),
    body: params.input,
    timeoutMs: params.timeoutMs ?? 25_000
  });

  if (!queueResponse.ok) {
    if (queueResponse.status === 401 || queueResponse.status === 403) {
      throw new Error("fal.ai authorization failed.");
    }
    throw new Error(`fal.ai upstream error (${queueResponse.status}).`);
  }

  const queuePayload = queueResponse.payload;
  const queueOutput = extractFalOutput(queuePayload);
  const queueUrl = extractUrlFromValue(queueOutput);
  if (queueUrl) {
    return queueOutput;
  }

  const queueRequestId = extractFalRequestId(queuePayload);
  const queueStatusUrl =
    (isRecord(queuePayload) && typeof queuePayload.status_url === "string" && queuePayload.status_url) ||
    (isRecord(queuePayload) && typeof queuePayload.statusUrl === "string" && queuePayload.statusUrl) ||
    (queueRequestId
      ? `${queueBaseUrl}/${normalizeFalModelPath(modelCandidates[0])}/requests/${encodeURIComponent(queueRequestId)}`
      : null);

  if (queueStatusUrl) {
    return await pollFalRequest({
      statusUrl: queueStatusUrl,
      apiKey: getFalApiKey(),
      timeoutMs: Math.max(45_000, params.timeoutMs ?? 90_000)
    });
  }

  return queueOutput;
}

export async function callFalEndpoint(params: {
  modelId: string;
  input: Record<string, unknown>;
  timeoutMs?: number;
}): Promise<{ output: unknown; resultUrl: string | null }> {
  const output = await invokeFalEndpoint(params);
  return {
    output,
    resultUrl: extractUrlFromValue(output)
  };
}

export function getFalApiKey(): string {
  const apiKey = readFalKey();
  if (!apiKey) {
    throw new Error("FAL_KEY is not configured");
  }
  return apiKey;
}

export function hasFalApiKey(): boolean {
  return readFalKey().length > 0;
}
