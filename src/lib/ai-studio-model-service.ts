import { prisma } from "@/lib/prisma";
import { hasFalApiKey } from "@/lib/fal";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import type { AiStudioSection } from "@/lib/ai-studio";
import { STUDIO_MODELS_BY_SECTION, type StudioModelSpec } from "@/lib/ai-studio-fal-models";

export interface AiStudioModelOption {
  id: string;
  label: string;
  provider: string;
  task: string;
  supportsReference: boolean;
  supportsAudio: boolean;
  supportsVideo: boolean;
  supportsImage: boolean;
  recommended: boolean;
  priceTokens: number;
  inputType: string | null;
}

export interface AiStudioModelCatalogResponse {
  source: "backend" | "database";
  provider: string;
  configured: boolean;
  sections: Record<AiStudioSection, AiStudioModelOption[]>;
}

function toModelOption(spec: StudioModelSpec, index: number): AiStudioModelOption {
  const inputType = spec.supportsReference ? "text,image" : "text";
  return {
    id: spec.id,
    label: spec.label,
    provider: spec.section === "chat" ? "openrouter" : "fal",
    task: detectTask(spec.section, inputType),
    supportsReference: Boolean(spec.supportsReference),
    supportsAudio: false,
    supportsVideo: false,
    supportsImage: Boolean(spec.supportsReference),
    recommended: index === 0,
    priceTokens: spec.priceTokens,
    inputType
  };
}

// The studio catalog lives in ai-studio-fal-models.ts (one place for ids, prices and input formats).
const FALLBACK_MODEL_CATALOG: Record<AiStudioSection, AiStudioModelOption[]> = {
  chat: STUDIO_MODELS_BY_SECTION.chat.map(toModelOption),
  image: STUDIO_MODELS_BY_SECTION.image.map(toModelOption),
  video: STUDIO_MODELS_BY_SECTION.video.map(toModelOption),
  audio: STUDIO_MODELS_BY_SECTION.audio.map(toModelOption)
};

function isAiStudioSection(value: string): value is AiStudioSection {
  return value === "chat" || value === "image" || value === "video" || value === "audio";
}

function detectTask(section: AiStudioSection, inputType: string | null): string {
  if (section === "image") {
    return inputType?.includes("image") ? "image-to-image" : "text-to-image";
  }
  if (section === "video") {
    if (inputType?.includes("video")) return "video-to-video";
    if (inputType?.includes("image")) return "image-to-video";
    return "text-to-video";
  }
  if (section === "audio") return "text-to-audio";
  return "chat";
}

function mapSupportsReference(inputType: string | null): boolean {
  if (!inputType) return false;
  return /(image|audio|video|reference|upload)/i.test(inputType);
}

function getFallbackCatalog(): AiStudioModelCatalogResponse {
  return {
    source: "backend",
    provider: "fal",
    configured: hasFalApiKey(),
    sections: FALLBACK_MODEL_CATALOG
  };
}

export async function getAiStudioModelCatalog(): Promise<AiStudioModelCatalogResponse> {
  const fallback = getFallbackCatalog();
  const db = prisma as typeof prisma & Record<string, unknown>;

  if (!db.ai_models || typeof (db.ai_models as { findMany?: unknown }).findMany !== "function") {
    return fallback;
  }

  try {
    const models = await prisma.ai_models.findMany({
      where: { active: true },
      orderBy: [{ section: "asc" }, { price_tokens: "asc" }, { name: "asc" }],
      select: {
        code: true,
        name: true,
        provider: true,
        section: true,
        input_type: true,
        supports_image: true,
        supports_audio: true,
        supports_video: true,
        price_tokens: true
      }
    });

    if (models.length === 0) {
      return fallback;
    }

    const sections: Record<AiStudioSection, AiStudioModelOption[]> = {
      chat: [],
      image: [],
      video: [],
      audio: []
    };

    for (const model of models) {
      if (!isAiStudioSection(model.section)) continue;

      sections[model.section].push({
        id: model.code,
        label: model.name,
        provider: model.provider,
        task: detectTask(model.section, model.input_type),
        supportsReference: mapSupportsReference(model.input_type),
        supportsAudio: model.supports_audio,
        supportsVideo: model.supports_video,
        supportsImage: model.supports_image,
        recommended: sections[model.section].length === 0,
        priceTokens: model.price_tokens,
        inputType: model.input_type
      });
    }

    const providers = new Set(
      Object.values(sections)
        .flat()
        .map((item) => item.provider)
    );

    return {
      source: "database",
      provider: providers.size === 1 ? [...providers][0] ?? "mixed" : "mixed",
      configured: hasFalApiKey() || !providers.has("fal"),
      sections
    };
  } catch (error) {
    if (isPrismaTableMissingError(error, "ai_models")) {
      return fallback;
    }
    throw error;
  }
}

export function getPrimaryFalModel(
  catalog: AiStudioModelCatalogResponse,
  section: AiStudioSection
): AiStudioModelOption | null {
  const options = catalog.sections[section];
  if (!options || options.length === 0) return null;
  return options.find((item) => item.recommended) ?? options[0] ?? null;
}
