import { prisma } from "@/lib/prisma";
import { hasFalApiKey } from "@/lib/fal";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import type { AiStudioSection } from "@/lib/ai-studio";

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

const FALLBACK_MODEL_CATALOG: Record<AiStudioSection, AiStudioModelOption[]> = {
  chat: [
    {
      id: "gpt-4o",
      label: "GPT-4o",
      provider: "openai",
      task: "chat",
      supportsReference: false,
      supportsAudio: false,
      supportsVideo: false,
      supportsImage: false,
      recommended: true,
      priceTokens: 25,
      inputType: "text"
    },
    {
      id: "claude-3-5-sonnet",
      label: "Claude 3.5 Sonnet",
      provider: "anthropic",
      task: "chat",
      supportsReference: false,
      supportsAudio: false,
      supportsVideo: false,
      supportsImage: false,
      recommended: false,
      priceTokens: 28,
      inputType: "text"
    },
    {
      id: "gemini-2.5-pro",
      label: "Gemini 2.5 Pro",
      provider: "google",
      task: "chat",
      supportsReference: false,
      supportsAudio: false,
      supportsVideo: false,
      supportsImage: false,
      recommended: false,
      priceTokens: 22,
      inputType: "text"
    }
  ],
  image: [
    {
      id: "flux-pro/v1.1-ultra",
      label: "FLUX Ultra",
      provider: "fal",
      task: "text-to-image",
      supportsReference: false,
      supportsAudio: false,
      supportsVideo: false,
      supportsImage: true,
      recommended: true,
      priceTokens: 60,
      inputType: "text"
    },
    {
      id: "ideogram/v4",
      label: "Ideogram v4",
      provider: "fal",
      task: "text-to-image",
      supportsReference: false,
      supportsAudio: false,
      supportsVideo: false,
      supportsImage: true,
      recommended: false,
      priceTokens: 10,
      inputType: "text"
    },
    {
      id: "gemini-3-pro-image-preview",
      label: "Gemini 3 Pro Image",
      provider: "fal",
      task: "text-to-image",
      supportsReference: true,
      supportsAudio: false,
      supportsVideo: false,
      supportsImage: true,
      recommended: false,
      priceTokens: 150,
      inputType: "text+image"
    },
    {
      id: "gpt-image-1.5",
      label: "GPT Image 1.5",
      provider: "fal",
      task: "text-to-image",
      supportsReference: true,
      supportsAudio: false,
      supportsVideo: false,
      supportsImage: true,
      recommended: false,
      priceTokens: 100,
      inputType: "text+image"
    }
  ],
  video: [
    {
      id: "xai/grok-imagine-video/text-to-video",
      label: "Grok Imagine Video",
      provider: "fal",
      task: "text-to-video",
      supportsReference: true,
      supportsAudio: true,
      supportsVideo: false,
      supportsImage: true,
      recommended: true,
      priceTokens: 500,
      inputType: "text+image"
    },
    {
      id: "bytedance/seedance-2.0/text-to-video",
      label: "Seedance 2.0",
      provider: "fal",
      task: "text-to-video",
      supportsReference: true,
      supportsAudio: true,
      supportsVideo: true,
      supportsImage: true,
      recommended: false,
      priceTokens: 600,
      inputType: "text+image+video"
    },
    {
      id: "kling-video/v3/pro/text-to-video",
      label: "Kling 3 Pro",
      provider: "fal",
      task: "text-to-video",
      supportsReference: true,
      supportsAudio: true,
      supportsVideo: false,
      supportsImage: true,
      recommended: false,
      priceTokens: 1500,
      inputType: "text+image"
    },
    {
      id: "veo3.1",
      label: "Veo 3",
      provider: "fal",
      task: "text-to-video",
      supportsReference: false,
      supportsAudio: true,
      supportsVideo: true,
      supportsImage: false,
      recommended: false,
      priceTokens: 4000,
      inputType: "text"
    }
  ],
  audio: [
    {
      id: "minimax-music/v2.6",
      label: "MiniMax Music",
      provider: "fal",
      task: "text-to-audio",
      supportsReference: false,
      supportsAudio: true,
      supportsVideo: false,
      supportsImage: false,
      recommended: true,
      priceTokens: 150,
      inputType: "text"
    },
    {
      id: "lyria2",
      label: "Lyria 2",
      provider: "fal",
      task: "text-to-audio",
      supportsReference: false,
      supportsAudio: true,
      supportsVideo: false,
      supportsImage: false,
      recommended: false,
      priceTokens: 200,
      inputType: "text"
    },
    {
      id: "elevenlabs/music",
      label: "ElevenLabs Music",
      provider: "fal",
      task: "text-to-audio",
      supportsReference: false,
      supportsAudio: true,
      supportsVideo: false,
      supportsImage: false,
      recommended: false,
      priceTokens: 200,
      inputType: "text"
    },
    {
      id: "stable-audio-25/text-to-audio",
      label: "Stable Audio 2.5",
      provider: "fal",
      task: "text-to-audio",
      supportsReference: false,
      supportsAudio: true,
      supportsVideo: false,
      supportsImage: false,
      recommended: false,
      priceTokens: 150,
      inputType: "text"
    }
  ]
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
