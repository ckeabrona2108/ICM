import type { AiStudioSection } from "@/lib/ai-studio";

/**
 * AI Studio model catalog (fal.ai endpoints) and how each model expects its input.
 *
 * Prices follow the studio rule: 1 token ≈ $0.001 of provider cost (see AI_TOKEN_USD_RATE).
 * Models whose fal.ai price is not a flat per-image/per-second figure are estimates and must be
 * checked with a real test generation before relying on the margin (marked `priceVerified: false`).
 * Catalog checked against the fal.ai models API on 2026-11-12.
 */

type ImageSizeMode = "aspect_ratio" | "image_size";

interface BaseModelSpec {
  id: string;
  label: string;
  priceTokens: number;
  priceVerified: boolean;
  supportsReference?: boolean;
}

export interface ImageModelSpec extends BaseModelSpec {
  section: "image";
  sizeMode: ImageSizeMode;
  /** Model accepts quality low/medium/high. */
  qualityParam?: boolean;
  /** Allowed aspect ratios when sizeMode is aspect_ratio. */
  aspectRatios?: string[];
}

export interface VideoModelSpec extends BaseModelSpec {
  section: "video";
  /** USD per second at the default resolution; tokens per duration are derived from it. */
  usdPerSecond: number;
  resolutions: string[];
  aspectRatios: string[];
  durationAsString?: boolean;
}

export interface AudioModelSpec extends BaseModelSpec {
  section: "audio";
  kind: "mureka" | "elevenlabs" | "lyria" | "minimax";
  /** Endpoint used when the user switches on «Без слов». */
  instrumentalId?: string;
}

export interface ChatModelSpec extends BaseModelSpec {
  section: "chat";
}

export type StudioModelSpec = ImageModelSpec | VideoModelSpec | AudioModelSpec | ChatModelSpec;

const COMMON_ASPECTS = ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "4:5", "9:16"];

export const IMAGE_MODELS: ImageModelSpec[] = [
  { section: "image", id: "bytedance/seedream/v5.5/text-to-image", label: "Seedream 5.5", priceTokens: 30, priceVerified: true, sizeMode: "image_size" },
  { section: "image", id: "google/nano-banana-2.1", label: "Nano Banana 2.1", priceTokens: 150, priceVerified: false, sizeMode: "aspect_ratio", aspectRatios: COMMON_ASPECTS, supportsReference: true },
  { section: "image", id: "openai/gpt-image-2.6/flare/text-to-image", label: "GPT Image 2.6", priceTokens: 150, priceVerified: false, sizeMode: "image_size", qualityParam: true },
  { section: "image", id: "ideogram/v4.5", label: "Ideogram 4.5", priceTokens: 60, priceVerified: false, sizeMode: "image_size", qualityParam: true },
  { section: "image", id: "minimax/h3-image/text-to-image", label: "MiniMax H3 Image", priceTokens: 40, priceVerified: false, sizeMode: "image_size" },
  { section: "image", id: "blackforestlabs/flux-3/text-to-image", label: "FLUX 3", priceTokens: 50, priceVerified: true, sizeMode: "aspect_ratio", aspectRatios: COMMON_ASPECTS },
  { section: "image", id: "blackforestlabs/flux-3/klein/text-to-image", label: "FLUX.3 Klein", priceTokens: 10, priceVerified: true, sizeMode: "image_size" },
  { section: "image", id: "krea/v3/text-to-image", label: "Krea 3", priceTokens: 30, priceVerified: true, sizeMode: "image_size" },
  { section: "image", id: "fal-ai/flux-pro/v1.1-ultra", label: "FLUX Ultra", priceTokens: 60, priceVerified: true, sizeMode: "aspect_ratio", aspectRatios: ["21:9", "16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16", "9:21"] }
];

export const VIDEO_MODELS: VideoModelSpec[] = [
  { section: "video", id: "google/gemini-omni-flash/v1.2/text-to-video", label: "Gemini Omni Flash 1.2", priceTokens: 140, priceVerified: true, usdPerSecond: 0.0273, resolutions: ["360p", "720p", "1080p"], aspectRatios: ["16:9", "9:16"] },
  { section: "video", id: "kling/v4/text-to-video", label: "Kling 4.0", priceTokens: 790, priceVerified: true, usdPerSecond: 0.157, resolutions: ["720p", "1080p"], aspectRatios: ["16:9", "9:16", "1:1", "21:9"] },
  { section: "video", id: "kling/v4/flash/text-to-video", label: "Kling 4.0 Flash", priceTokens: 470, priceVerified: true, usdPerSecond: 0.094, resolutions: ["720p"], aspectRatios: ["16:9", "9:16", "1:1", "21:9"] },
  { section: "video", id: "blackforestlabs/flux-3-max/text-to-video", label: "FLUX 3 Max Video", priceTokens: 220, priceVerified: true, usdPerSecond: 0.0425, resolutions: ["720p", "1080p"], aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"] },
  { section: "video", id: "bytedance/seedance-2.5/us/text-to-video", label: "Seedance 2.5", priceTokens: 2400, priceVerified: false, usdPerSecond: 0.47, resolutions: ["480p", "720p", "1080p"], aspectRatios: ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"], durationAsString: true },
  { section: "video", id: "xai/grok-imagine-video/v1.5/text-to-video", label: "Grok Imagine 1.5", priceTokens: 50, priceVerified: true, usdPerSecond: 0.01, resolutions: ["480p", "720p", "1080p"], aspectRatios: ["16:9", "4:3", "3:2", "1:1", "2:3", "3:4", "9:16"] },
  { section: "video", id: "pixverse/v6/max/text-to-video", label: "PixVerse V6 Max", priceTokens: 50, priceVerified: false, usdPerSecond: 0.009, resolutions: ["360p", "540p", "720p", "1080p"], aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "2:3", "3:2", "21:9"] }
];

export const AUDIO_MODELS: AudioModelSpec[] = [
  { section: "audio", id: "mureka/v9.5/generate/song", label: "Mureka 9.5", priceTokens: 100, priceVerified: false, kind: "mureka", instrumentalId: "mureka/v9.5/generate/instrumental" },
  { section: "audio", id: "elevenlabs/music/v2.5", label: "ElevenLabs Music 2.5", priceTokens: 600, priceVerified: true, kind: "elevenlabs" },
  { section: "audio", id: "google/lyria-3.5", label: "Lyria 3.5", priceTokens: 100, priceVerified: true, kind: "lyria" },
  { section: "audio", id: "minimax/music-3", label: "MiniMax Music 3", priceTokens: 120, priceVerified: true, kind: "minimax" }
];

/** Chat models are called through fal.ai's OpenRouter endpoint. Flat price per message (answer capped). */
export const CHAT_MODELS: ChatModelSpec[] = [
  { section: "chat", id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", priceTokens: 15, priceVerified: true },
  { section: "chat", id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5", priceTokens: 30, priceVerified: true },
  { section: "chat", id: "anthropic/claude-fable-5.2", label: "Claude Fable 5.2", priceTokens: 60, priceVerified: true },
  { section: "chat", id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", priceTokens: 3, priceVerified: true },
  { section: "chat", id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol", priceTokens: 15, priceVerified: true },
  { section: "chat", id: "openai/gpt-6.1-terra", label: "GPT-6.1 Terra", priceTokens: 8, priceVerified: true },
  { section: "chat", id: "openai/gpt-6-luna", label: "GPT-6 Luna", priceTokens: 3, priceVerified: true },
  { section: "chat", id: "google/gemini-4-carbon", label: "Gemini 4 Carbon", priceTokens: 15, priceVerified: true },
  { section: "chat", id: "google/gemini-4-hydrogen", label: "Gemini 4 Hydrogen", priceTokens: 12, priceVerified: true },
  { section: "chat", id: "x-ai/grok-4.7", label: "Grok 4.7", priceTokens: 12, priceVerified: true },
  { section: "chat", id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash", priceTokens: 3, priceVerified: true },
  { section: "chat", id: "moonshotai/kimi-k3.1-pro", label: "Kimi K3.1 Pro", priceTokens: 12, priceVerified: true },
  { section: "chat", id: "qwen/qwen3.8-max-0902", label: "Qwen 3.8 Max", priceTokens: 10, priceVerified: true },
  { section: "chat", id: "z-ai/glm-5.3", label: "GLM 5.3", priceTokens: 5, priceVerified: true },
  { section: "chat", id: "mistralai/mistral-large-4-0", label: "Mistral Large 4", priceTokens: 5, priceVerified: true },
  { section: "chat", id: "minimax/minimax-m3", label: "MiniMax M3", priceTokens: 3, priceVerified: true }
];

export const CHAT_ROUTER_ENDPOINT = "openrouter/router";
export const CHAT_MAX_OUTPUT_TOKENS = 2000;

export const STUDIO_MODELS_BY_SECTION: Record<AiStudioSection, StudioModelSpec[]> = {
  chat: CHAT_MODELS,
  image: IMAGE_MODELS,
  video: VIDEO_MODELS,
  audio: AUDIO_MODELS
};

const ALL_MODELS = new Map<string, StudioModelSpec>(
  Object.values(STUDIO_MODELS_BY_SECTION)
    .flat()
    .map((model) => [model.id, model])
);

export function findStudioModelSpec(id: string): StudioModelSpec | null {
  return ALL_MODELS.get(id) ?? null;
}

export const VIDEO_DURATION_OPTIONS = ["5 sec", "8 sec", "10 sec"] as const;

function durationSeconds(value: string | undefined): number | null {
  const match = /(\d+)/u.exec(value ?? "");
  return match ? Number(match[1]) : null;
}

/** Tokens for one video of the given duration, from the model's per-second cost. */
export function videoDurationTokens(spec: VideoModelSpec, duration: string): number {
  const seconds = durationSeconds(duration) ?? 5;
  return Math.max(10, Math.round((spec.usdPerSecond * seconds * 1000) / 10) * 10);
}

const IMAGE_SIZE_BY_FORMAT: Record<string, string> = {
  "1:1": "square_hd",
  "4:5": "portrait_4_3",
  "3:4": "portrait_4_3",
  "9:16": "portrait_16_9",
  "16:9": "landscape_16_9",
  "4:3": "landscape_4_3"
};

const QUALITY_LEVELS: Record<string, string> = { Fast: "low", Pro: "medium", Ultra: "high" };

const STYLE_HINTS: Record<string, string> = {
  Cover: "music album cover art",
  Promo: "promotional artwork for a music release",
  Poster: "concert poster design",
  Abstract: "abstract artwork"
};

function pick(value: string | undefined, allowed: string[], fallback: string): string {
  if (value && allowed.includes(value)) return value;
  return allowed.includes(fallback) ? fallback : allowed[0] ?? fallback;
}

/** fal.ai input for a catalog model, built only from fields that model accepts. Null for unknown models. */
export function buildStudioModelInput(params: {
  modelId: string;
  prompt: string;
  parameters?: Record<string, string>;
}): { endpointId: string; input: Record<string, unknown> } | null {
  const spec = findStudioModelSpec(params.modelId);
  if (!spec || spec.section === "chat") return null;
  const parameters = params.parameters ?? {};
  const prompt = params.prompt.trim();

  if (spec.section === "image") {
    const styleHint = STYLE_HINTS[parameters.Style ?? ""];
    const input: Record<string, unknown> = {
      prompt: styleHint ? `${prompt}. ${styleHint}` : prompt,
      num_images: 1
    };
    const format = parameters.Format ?? "1:1";
    if (spec.sizeMode === "aspect_ratio") {
      input.aspect_ratio = pick(format, spec.aspectRatios ?? COMMON_ASPECTS, "1:1");
    } else {
      input.image_size = IMAGE_SIZE_BY_FORMAT[format] ?? "square_hd";
    }
    if (spec.qualityParam && parameters.Quality && QUALITY_LEVELS[parameters.Quality]) {
      input.quality = QUALITY_LEVELS[parameters.Quality];
    }
    return { endpointId: spec.id, input };
  }

  if (spec.section === "video") {
    const seconds = durationSeconds(parameters.Duration) ?? 5;
    const format = parameters.Format ?? "16:9";
    const portrait = format === "9:16" || format === "3:4" || format === "2:3";
    return {
      endpointId: spec.id,
      input: {
        prompt,
        duration: spec.durationAsString ? String(seconds) : seconds,
        resolution: pick(parameters.Quality, spec.resolutions, "720p"),
        aspect_ratio: spec.aspectRatios.includes(format) ? format : portrait ? "9:16" : "16:9"
      }
    };
  }

  // Music: description + the user's free-text style, with the «Без слов» switch.
  const style = parameters.Style?.trim() ?? "";
  const instrumental = parameters.Type === "Инструментал";
  const combined = [prompt, style ? `Style: ${style}` : "", instrumental ? "Instrumental, no vocals" : ""]
    .filter(Boolean)
    .join(". ");

  switch (spec.kind) {
    case "mureka":
      return instrumental && spec.instrumentalId
        ? { endpointId: spec.instrumentalId, input: { prompt: [prompt, style].filter(Boolean).join(". ") } }
        : { endpointId: spec.id, input: { prompt, ...(style ? { styles: style } : {}) } };
    case "elevenlabs":
      return {
        endpointId: spec.id,
        input: { prompt: [prompt, style].filter(Boolean).join(". "), force_instrumental: instrumental, music_length_ms: 60_000 }
      };
    case "minimax":
      return {
        endpointId: spec.id,
        input: { prompt: style || prompt, lyrics: instrumental ? "[Instrumental]" : prompt, duration: 60 }
      };
    case "lyria":
    default:
      return { endpointId: spec.id, input: { prompt: combined } };
  }
}
