import type { subscribe_level } from "@prisma/client";

export type AiStudioPlan = "FREE" | "PRO" | "ENTERPRISE";
export type AiStudioSection = "chat" | "image" | "video" | "audio";

export interface AiStudioAccessInput {
  isSubscribed: boolean;
  subscribeLevel: subscribe_level | null;
  expiresAt: Date | null;
}

export interface AiStudioLimits {
  imagesPerDay: number | null;
  audioPerDay: number | null;
  videoPerDay: number | null;
  chatMessagesPerDay: number | null;
}

export interface AiStudioFileLimits {
  imageMb: number;
  audioMb: number;
  videoMb: number;
}

export interface AiStudioEntitlements {
  plan: AiStudioPlan;
  hasAccess: boolean;
  monthlyBonusTokens: number;
  dailyLimits: AiStudioLimits;
  fileLimits: AiStudioFileLimits;
  priorityQueue: boolean;
  earlyModelAccess: boolean;
}

export interface AiTokenPackage {
  code: string;
  name: string;
  tokens: number;
  bonusTokens: number;
  priceRub: number;
  active: boolean;
}

export const AI_TOKEN_USD_RATE = 0.001;

export const AI_STUDIO_SUBSCRIPTION_BONUS_TOKENS = {
  standard: 0,
  pro: 1000,
  enterprise: 2500
} as const;

export const AI_STUDIO_SECTIONS: Array<{
  id: AiStudioSection;
  label: string;
  description: string;
  accent: string;
}> = [
  {
    id: "chat",
    label: "Чаты",
    description: "Промо-посты, названия треков, bio артиста, lyrics и перевод.",
    accent: "from-cyan-400/30 via-sky-400/15 to-transparent"
  },
  {
    id: "image",
    label: "Изображения",
    description: "Обложки, аватары, баннеры и визуалы для соцсетей.",
    accent: "from-fuchsia-400/30 via-pink-400/15 to-transparent"
  },
  {
    id: "video",
    label: "Видео",
    description: "Reels, TikTok, тизеры релизов и анимация обложек.",
    accent: "from-amber-400/30 via-orange-400/15 to-transparent"
  },
  {
    id: "audio",
    label: "Аудио",
    description: "Скетчи, инструменталы, демо песен и идеи припевов.",
    accent: "from-emerald-400/30 via-green-400/15 to-transparent"
  }
];

export const AI_TOKEN_PACKAGES: AiTokenPackage[] = [
  { code: "starter", name: "Starter", tokens: 1000, bonusTokens: 0, priceRub: 500, active: true },
  { code: "creator", name: "Creator", tokens: 2500, bonusTokens: 100, priceRub: 1250, active: true },
  { code: "pro_creator", name: "Pro Creator", tokens: 5000, bonusTokens: 300, priceRub: 2500, active: true },
  { code: "studio", name: "Studio", tokens: 10000, bonusTokens: 1000, priceRub: 5000, active: true },
  { code: "mega_studio", name: "Mega Studio", tokens: 15000, bonusTokens: 2000, priceRub: 7500, active: true },
  { code: "ultra_studio", name: "Ultra Studio", tokens: 20000, bonusTokens: 3000, priceRub: 10000, active: true }
];

export const AI_CHAT_TEMPLATES = [
  "Написать текст песни",
  "Придумать название трека",
  "Сделать описание релиза",
  "Придумать промо-пост",
  "Создать bio артиста",
  "Перевести текст песни",
  "Улучшить lyrics"
];

export const AI_STUDIO_VIDEO_DURATION_TOKEN_COSTS: Record<string, Record<string, number>> = {
  "xai/grok-imagine-video/text-to-video": {
    "5 sec": 250,
    "8 sec": 400,
    "10 sec": 500
  },
  "bytedance/seedance-2.0/text-to-video": {
    "5 sec": 300,
    "8 sec": 500,
    "10 sec": 600
  },
  "kling-video/v3/pro/text-to-video": {
    "5 sec": 700,
    "8 sec": 1120,
    "10 sec": 1500
  },
  "veo3.1": {
    "5 sec": 2000,
    "8 sec": 3200,
    "10 sec": 4000
  }
};

export function getAiStudioVideoDurationTokenCost(modelCode: string, duration: string | null | undefined): number | null {
  if (!duration) return null;
  return AI_STUDIO_VIDEO_DURATION_TOKEN_COSTS[modelCode]?.[duration] ?? null;
}

export function resolveAiStudioGenerationCostTokens(params: {
  section: AiStudioSection;
  modelCode: string;
  modelPriceTokens: number;
  parameters?: Record<string, string>;
}): number {
  if (params.section === "video") {
    const duration = params.parameters?.Duration ?? null;
    const durationTokens = getAiStudioVideoDurationTokenCost(params.modelCode, duration);
    if (durationTokens != null) {
      return Math.max(0, Math.trunc(durationTokens));
    }
  }

  return Math.max(0, Math.trunc(params.modelPriceTokens));
}

function hasActiveSubscription(input: AiStudioAccessInput): boolean {
  if (!input.isSubscribed) return false;
  if (!input.expiresAt) return true;
  return input.expiresAt.getTime() > Date.now();
}

export function resolveAiStudioPlan(input: AiStudioAccessInput): AiStudioPlan {
  if (!hasActiveSubscription(input)) return "FREE";
  if (input.subscribeLevel === "enterprise" || input.subscribeLevel === "premium") {
    return "ENTERPRISE";
  }
  if (input.subscribeLevel === "professional") return "PRO";
  return "FREE";
}

export function hasAiStudioAccess(input: AiStudioAccessInput): boolean {
  const plan = resolveAiStudioPlan(input);
  return plan === "PRO" || plan === "ENTERPRISE";
}

export function getAiStudioSubscriptionBonusTokensByTariffId(tariffId: string | null | undefined): number {
  const normalized = typeof tariffId === "string" ? tariffId.trim().toLowerCase() : "standard";
  if (normalized === "enterprise") return AI_STUDIO_SUBSCRIPTION_BONUS_TOKENS.enterprise;
  if (normalized === "pro") return AI_STUDIO_SUBSCRIPTION_BONUS_TOKENS.pro;
  return AI_STUDIO_SUBSCRIPTION_BONUS_TOKENS.standard;
}

export function getAiStudioEntitlements(input: AiStudioAccessInput): AiStudioEntitlements {
  const plan = resolveAiStudioPlan(input);

  if (plan === "ENTERPRISE") {
    return {
      plan,
      hasAccess: true,
      monthlyBonusTokens: AI_STUDIO_SUBSCRIPTION_BONUS_TOKENS.enterprise,
      dailyLimits: {
        imagesPerDay: null,
        audioPerDay: null,
        videoPerDay: null,
        chatMessagesPerDay: null
      },
      fileLimits: {
        imageMb: 25,
        audioMb: 200,
        videoMb: 1024
      },
      priorityQueue: true,
      earlyModelAccess: true
    };
  }

  if (plan === "PRO") {
    return {
      plan,
      hasAccess: true,
      monthlyBonusTokens: AI_STUDIO_SUBSCRIPTION_BONUS_TOKENS.pro,
      dailyLimits: {
        imagesPerDay: 20,
        audioPerDay: 10,
        videoPerDay: 5,
        chatMessagesPerDay: 100
      },
      fileLimits: {
        imageMb: 10,
        audioMb: 50,
        videoMb: 200
      },
      priorityQueue: false,
      earlyModelAccess: false
    };
  }

  return {
    plan: "FREE",
    hasAccess: false,
    monthlyBonusTokens: 0,
    dailyLimits: {
      imagesPerDay: 0,
      audioPerDay: 0,
      videoPerDay: 0,
      chatMessagesPerDay: 0
    },
    fileLimits: {
      imageMb: 0,
      audioMb: 0,
      videoMb: 0
    },
    priorityQueue: false,
    earlyModelAccess: false
  };
}

export function formatAiTokenAmount(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 0
  }).format(Math.max(0, Math.floor(value)));
}

export function formatTokenUsdValue(tokens: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(tokens * AI_TOKEN_USD_RATE);
}

export function getDailyLimitLabel(value: number | null): string {
  return value == null ? "Без лимита" : `${value}/день`;
}
