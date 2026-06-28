import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { getAiStudioModelCatalog } from "@/lib/ai-studio-model-service";
import { callFalEndpoint } from "@/lib/fal";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { spendAiTokensForGeneration } from "@/lib/ai-token-service";
import { resolveAiStudioGenerationCostTokens } from "@/lib/ai-studio";

export const aiStudioReferenceFileSchema = z.object({
  name: z.string().trim().min(1, "Reference file name is required."),
  kind: z.enum(["image", "audio"]),
  size: z.number().int().min(0),
  uploadId: z.string().trim().optional(),
  storageKey: z.string().trim().optional(),
  url: z.string().trim().optional()
});

export const aiStudioGenerateRequestSchema = z.object({
  section: z.enum(["chat", "image", "video", "audio"]),
  prompt: z.string().trim().min(6, "Prompt is required.").max(5000),
  modelId: z.string().trim().min(1, "Model is required."),
  parameters: z.record(z.string()).default({}),
  referenceFiles: z.array(aiStudioReferenceFileSchema).max(8).default([]),
  mode: z.string().trim().optional(),
  priority: z.string().trim().optional(),
  earlyAccess: z.boolean().default(false)
});

export type AiStudioGenerateRequest = z.infer<typeof aiStudioGenerateRequestSchema>;

export interface AiStudioGenerateGeneration {
  id: string;
  section: string;
  modelCode: string;
  prompt: string;
  status: string;
  costTokens: number;
  resultUrl: string | null;
  createdAt: string;
}

export interface AiStudioGenerateSuccess {
  ok: true;
  newBalance: number;
  transactionId: string;
  previewUrl?: string | null;
  generation: AiStudioGenerateGeneration | null;
  assistantText?: string | null;
}

export interface AiStudioGenerateFailure {
  ok: false;
  error: string;
}

type AiGenerationRecord = {
  id: string;
  section: string;
  model_code: string;
  prompt: string;
  status: string;
  cost_tokens: number;
  result_url: string | null;
  created_at: Date;
};

type AiStudioGenerationBootstrapClient = Pick<PrismaClient, "$executeRawUnsafe">;

async function ensureAiGenerationStorageSchema(prisma: AiStudioGenerationBootstrapClient): Promise<void> {
  if (typeof prisma.$executeRawUnsafe !== "function") {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "icecream"."ai_generations" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL,
      "ai_model_id" UUID,
      "section" TEXT NOT NULL,
      "model_code" TEXT NOT NULL,
      "prompt" TEXT NOT NULL,
      "input_files" JSONB,
      "parameters" JSONB,
      "cost_tokens" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL DEFAULT 'queued',
      "result_url" TEXT,
      "error_message" TEXT,
      "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ai_generations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ai_generations_user_id_created_at_idx"
    ON "icecream"."ai_generations"("user_id", "created_at")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ai_generations_section_status_idx"
    ON "icecream"."ai_generations"("section", "status")
  `);
}

function isGenerationStorageError(error: unknown): boolean {
  if (isAnyPrismaTableMissingError(error, ["ai_generations"])) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /relation .*ai_generations.* does not exist|table .*ai_generations.* does not exist|column .*ai_model_id.* does not exist/i.test(
    message
  );
}

function encodeDataUrl(text: string, mime = "text/plain;charset=utf-8"): string {
  return `data:${mime},${encodeURIComponent(text)}`;
}

function parseDurationSeconds(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:[.,]\d+)?)/u);
  if (!match) return null;
  const duration = Number(match[1].replace(",", "."));
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function mapSectionFalInput(params: {
  section: "image" | "video" | "audio";
  prompt: string;
  modelName: string;
  parameters?: Record<string, string>;
}): Record<string, unknown> {
  const result: Record<string, unknown> = {
    prompt: params.prompt
  };
  const parameters = params.parameters ?? {};

  if (params.section === "image") {
    if (parameters.Style) result.style = parameters.Style;
    if (parameters.Quality) result.quality = parameters.Quality;
    if (parameters.Format) result.aspect_ratio = parameters.Format;
    result.num_images = 1;
    result.output_format = "png";
    result.safety_tolerance = "4";
    return result;
  }

  if (params.section === "video") {
    if (parameters.Duration) result.duration = parseDurationSeconds(parameters.Duration) ?? parameters.Duration;
    if (parameters.Quality) result.resolution = parameters.Quality;
    if (parameters.Format) result.aspect_ratio = parameters.Format;
    result.sync_mode = false;
    result.limit_generations = true;
    return result;
  }

  if (parameters.Type) result.type = parameters.Type;
  if (parameters.Style) result.style = parameters.Style;
  if (parameters.Length) result.length = parameters.Length;
  result.model = params.modelName;
  return result;
}

export function buildChatAssistantText(prompt: string): string {
  const normalized = prompt.trim().toLowerCase();
  if (/кто ты|who are you|что ты такое|ты кто/u.test(normalized)) {
    return "Я ICECREAMMUSIC AI Агент. Я помогаю с чатом, обложками, видео, музыкой, референсами и токенами внутри AI Студии.";
  }
  if (!normalized) {
    return "Напишите задачу, и я помогу разобрать её по шагам или собрать готовый промпт для генерации.";
  }

  const wantsActionPlan =
    /(?:нужн|надо|сделай|помоги|придумай|опиши|объясни|разбер|улучши|сгенерируй|настрой|собер)/u.test(normalized) ||
    normalized.includes("?");

  if (/обложк|cover|арт|art|poster|visual|визуал/u.test(normalized)) {
    return [
      "Понял задачу по визуалу.",
      "Я помогу собрать композицию, стиль, цветовой акцент и короткий промпт для генерации.",
      "Если нужно, могу сразу предложить минимал, cinematic или promo-вариант."
    ].join(" ");
  }

  if (/музык|трек|песня|сведение|bpm|beat|lyrics|лирик/u.test(normalized)) {
    return [
      "Понял задачу по музыке.",
      "Я помогу с идеей трека, структурой, настроением, BPM и текстовым промптом для генерации.",
      "Если хочешь, могу сразу предложить куплет, припев и аранжировочную схему."
    ].join(" ");
  }

  if (/видео|reel|тизер|clip|ролик|монтаж/u.test(normalized)) {
    return [
      "Понял задачу по видео.",
      "Я помогу сформировать сцену, движение, длительность, темп монтажа и визуальный стиль.",
      "Если нужно, сделаю короткий бриф под вертикальный или горизонтальный формат."
    ].join(" ");
  }

  if (wantsActionPlan) {
    return [
      "Понял задачу.",
      "Вот как я бы это разложил: сначала цель, затем формат, затем ограничения и финальный результат.",
      "Если хочешь, я сразу соберу это в готовый промпт или пошаговый план."
    ].join(" ");
  }

  return [
    "Понял.",
    "Я могу помочь уточнить задачу, предложить вариант ответа или превратить запрос в рабочий промпт.",
    "Напишите, что именно нужно получить в финале."
  ].join(" ");
}

async function buildMediaPreview(params: {
  section: "image" | "video" | "audio";
  prompt: string;
  modelName: string;
  modelId: string;
  parameters?: Record<string, string>;
}): Promise<{ resultUrl: string; assistantText: string | null }> {
  const falInput = mapSectionFalInput({
    section: params.section,
    prompt: params.prompt,
    modelName: params.modelName,
    parameters: params.parameters
  });
  const timeoutMs = params.section === "video" ? 90_000 : params.section === "audio" ? 45_000 : 30_000;

  try {
    const result = await callFalEndpoint({
      modelId: params.modelId,
      input: falInput,
      timeoutMs
    });

    if (result.resultUrl) {
      return {
        resultUrl: result.resultUrl,
        assistantText: null
      };
    }
  } catch (error) {
    console.error("[ai-generation] fal_media_error", {
      section: params.section,
      modelId: params.modelId,
      error: error instanceof Error ? error.message : String(error ?? "unknown")
    });
    throw error instanceof Error ? error : new Error("Не удалось получить результат генерации.");
  }

  throw new Error("Модель не вернула медиафайл. Попробуйте другой запрос или другую модель.");
}

export async function createAiStudioGeneration(params: {
  prisma: PrismaClient;
  userId: string;
  request: AiStudioGenerateRequest;
}): Promise<AiStudioGenerateSuccess | AiStudioGenerateFailure> {
  const catalog = await getAiStudioModelCatalog();
  const models = catalog.sections[params.request.section] ?? [];
  const selectedModel =
    params.request.section === "chat"
      ? {
          id: params.request.modelId,
          label: params.request.modelId,
          priceTokens: params.request.priority === "Priority" ? 35 : 25
        }
      : models.find((item) => item.id === params.request.modelId);

  if (!selectedModel) {
    return { ok: false as const, error: "Модель не найдена." };
  }

  const costTokens = resolveAiStudioGenerationCostTokens({
    section: params.request.section,
    modelCode: selectedModel.id,
    modelPriceTokens: selectedModel.priceTokens ?? 0,
    parameters: params.request.parameters
  });
  if (costTokens <= 0) {
    return { ok: false as const, error: "Неверная стоимость модели." };
  }

  await ensureAiGenerationStorageSchema(params.prisma);

  const preview =
    params.request.section === "chat"
      ? {
          resultUrl: encodeDataUrl(buildChatAssistantText(params.request.prompt)),
          assistantText: buildChatAssistantText(params.request.prompt)
        }
      : await buildMediaPreview({
          section: params.request.section,
          prompt: params.request.prompt,
          modelName: selectedModel.label,
          modelId: selectedModel.id,
          parameters: params.request.parameters
        });

  let generationRecord: AiGenerationRecord | null = null;

  try {
    generationRecord = await params.prisma.ai_generations.create({
      data: {
        user_id: params.userId,
        ai_model_id: null,
        section: params.request.section,
        model_code: selectedModel.id,
        prompt: params.request.prompt,
        input_files: params.request.referenceFiles.length > 0 ? params.request.referenceFiles : undefined,
        parameters:
          Object.keys(params.request.parameters).length > 0
            ? {
                ...params.request.parameters,
                mode: params.request.mode ?? null,
                priority: params.request.priority ?? null,
                earlyAccess: params.request.earlyAccess
              }
            : {
                mode: params.request.mode ?? null,
                priority: params.request.priority ?? null,
                earlyAccess: params.request.earlyAccess
              },
        cost_tokens: costTokens,
        status: "queued"
      }
    });
  } catch (error) {
    if (!isGenerationStorageError(error)) {
      throw error;
    }
  }

  const spendResult = await spendAiTokensForGeneration({
    prisma: params.prisma,
    userId: params.userId,
    amount: costTokens,
    generationId: generationRecord?.id ?? "00000000-0000-0000-0000-000000000000",
    section: params.request.section,
    modelCode: selectedModel.id,
    modelName: selectedModel.label,
    prompt: params.request.prompt,
    metadata: {
      parameters: params.request.parameters,
      referenceFiles: params.request.referenceFiles,
      mode: params.request.mode ?? null,
      priority: params.request.priority ?? null,
      earlyAccess: params.request.earlyAccess,
      resultUrl: preview.resultUrl
    }
  });

  if (!spendResult.ok) {
    if (generationRecord) {
      await params.prisma.ai_generations
        .delete({
          where: { id: generationRecord.id }
        })
        .catch(() => null);
    }
    return { ok: false as const, error: spendResult.error };
  }

  if (generationRecord) {
    try {
      generationRecord = await params.prisma.ai_generations.update({
        where: { id: generationRecord.id },
        data: {
          status: "completed",
          result_url: preview.resultUrl,
          error_message: null
        }
      });
    } catch (error) {
      if (!isGenerationStorageError(error)) {
        throw error;
      }
    }
  }

  return {
    ok: true as const,
    newBalance: spendResult.newBalance,
    transactionId: spendResult.transactionId,
    previewUrl: preview.resultUrl,
    assistantText: preview.assistantText,
    generation: generationRecord
      ? {
          id: generationRecord.id,
          section: generationRecord.section,
          modelCode: generationRecord.model_code,
          prompt: generationRecord.prompt,
          status: generationRecord.status,
          costTokens: generationRecord.cost_tokens,
          resultUrl: generationRecord.result_url,
          createdAt: generationRecord.created_at.toISOString()
        }
      : null
  };
}
