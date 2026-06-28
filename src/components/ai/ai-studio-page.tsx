"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import {
  Archive,
  AudioLines,
  Bot,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CircleAlert,
  ImagePlus,
  Loader2,
  Music2,
  PlayCircle,
  Settings2,
  Sparkles,
  UploadCloud,
  Video
} from "lucide-react";

import type { AiStudioWorkspaceTab } from "@/app/(dashboard)/dashboard/ai-studio/page-data";
import type {
  AiStudioChatMessageResponse,
  AiStudioChatThreadResponse,
  AiStudioModelCatalogResponse,
  AiStudioModelOptionResponse,
  AiTokenPackageResponse,
  AiStudioGenerateRequest,
  AiStudioGenerateResponse
} from "@/lib/api/contracts";
import type { AiStudioEntitlements, AiStudioSection } from "@/lib/ai-studio";
import type { AiChatThreadPayload as AiStudioChatThreadPayload } from "@/lib/ai-chat-service";
import { formatAiTokenAmount } from "@/lib/ai-studio";
import { formatRubCurrency } from "@/lib/currency-format";
import { DashboardEmptyState } from "@/components/layout/dashboard-shell";
import { useCurrentUser } from "@/components/user/user-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getAiStudioVideoDurationTokenCost, resolveAiStudioGenerationCostTokens } from "@/lib/ai-studio";
import { cn } from "@/lib/utils";

const WORKSPACE_TABS: Array<{
  id: AiStudioWorkspaceTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "chat", label: "Чаты", icon: Bot },
  { id: "image", label: "Изображения", icon: ImagePlus },
  { id: "video", label: "Видео", icon: Video },
  { id: "audio", label: "Аудио", icon: Music2 },
  { id: "uploads", label: "Загрузки", icon: UploadCloud },
  { id: "archive", label: "Архив", icon: Archive }
];

const SECTION_LABELS: Record<AiStudioSection, string> = {
  chat: "Чаты",
  image: "Изображения",
  video: "Видео",
  audio: "Аудио"
};

const TAB_TO_SECTION: Partial<Record<AiStudioWorkspaceTab, AiStudioSection>> = {
  chat: "chat",
  image: "image",
  video: "video",
  audio: "audio"
};

const MODEL_PARAM_PRESETS: Record<AiStudioSection, { label: string; options: string[] }[]> = {
  chat: [
    { label: "Mode", options: ["GPT-4o", "Native", "Priority"] },
    { label: "Queue", options: ["Standard", "Priority"] },
    { label: "Access", options: ["Early access", "Stable"] }
  ],
  image: [
    { label: "Style", options: ["Cover", "Promo", "Poster", "Abstract"] },
    { label: "Quality", options: ["Fast", "Pro", "Ultra"] },
    { label: "Format", options: ["1:1", "4:5", "16:9"] }
  ],
  video: [
    { label: "Duration", options: ["5 sec", "8 sec", "10 sec"] },
    { label: "Quality", options: ["480p", "720p", "1080p"] },
    { label: "Format", options: ["9:16", "16:9", "1:1"] }
  ],
  audio: [
    { label: "Type", options: ["Песня", "Инструментал", "Кавер"] },
    { label: "Style", options: ["Pop", "Trap", "R&B", "Ambient"] },
    { label: "Length", options: ["Short", "Standard", "Extended"] }
  ]
};

const SECTION_PROMPTS: Record<AiStudioSection, string> = {
  chat: "Напишите задачу для AI-ассистента...",
  image: "Опишите визуал, обложку или промо-арт...",
  video: "Опишите сцену, движение и настроение видео...",
  audio: "Опишите стиль, BPM, настроение и референсы..."
};

const MODEL_FALLBACKS: Record<AiStudioSection, string[]> = {
  chat: ["GPT-4o", "Native", "Priority"],
  image: ["Ideogram v4", "FLUX Ultra", "GPT Image 1.5", "Gemini 3 Pro Image"],
  video: ["Grok Imagine Video", "Seedance 2.0", "Kling 3 Pro", "Veo 3"],
  audio: ["MiniMax Music", "Lyria 2", "ElevenLabs Music", "Stable Audio 2.5"]
};

const SECTION_COST_LABELS: Record<AiStudioSection, string> = {
  chat: "25 токенов",
  image: "10 токенов",
  video: "500 токенов",
  audio: "150 токенов"
};

export interface AiStudioHistoryItem {
  id: string;
  createdAt: string;
  section: string;
  modelCode: string;
  prompt: string;
  status: string;
  costTokens: number;
  resultUrl: string | null;
}

export interface AiStudioUploadItem {
  id: string;
  createdAt: string;
  fileName: string;
  storageKey: string;
  url: string | null;
  mimeType: string;
  sizeBytes: number;
  section: string;
}

export interface AiStudioPageProps {
  activeTab: AiStudioWorkspaceTab;
  userName: string;
  aiStudioStatus: "preparing" | "active";
  aiTokenBalance: number;
  pendingAiTokenBalance: number;
  royaltyBalance: number;
  entitlements: AiStudioEntitlements;
  initialModelCatalog: AiStudioModelCatalogResponse;
  chatThreads: AiStudioChatThreadResponse[];
  activeChatThreadId: string | null;
  activeChatThread: AiStudioChatThreadPayload | null;
  history: AiStudioHistoryItem[];
  uploads: AiStudioUploadItem[];
  notifications?: Array<{
    id: string;
    kind: string;
    title: string;
    message: string;
    ctaLabel: string | null;
    ctaHref: string | null;
    createdAt: string;
  }>;
  paymentStatus?: "success" | "pending" | "waiting_for_capture" | "succeeded" | "canceled" | "already_confirmed" | "preparing" | null;
  paymentSummary?: {
    packageName: string;
    baseTokens: number;
    bonusTokens: number;
    totalTokens: number;
  } | null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitizeUploadFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "reference-file";
}

function inferUploadContentType(file: File) {
  if (file.type) return file.type;
  const name = file.name.toLowerCase();
  if (/\.(png)$/u.test(name)) return "image/png";
  if (/\.(jpe?g)$/u.test(name)) return "image/jpeg";
  if (/\.(webp)$/u.test(name)) return "image/webp";
  if (/\.(gif)$/u.test(name)) return "image/gif";
  if (/\.(mp3)$/u.test(name)) return "audio/mpeg";
  if (/\.(wav)$/u.test(name)) return "audio/wav";
  if (/\.(ogg)$/u.test(name)) return "audio/ogg";
  if (/\.(m4a)$/u.test(name)) return "audio/mp4";
  if (/\.(flac)$/u.test(name)) return "audio/flac";
  return "application/octet-stream";
}

function getDefaultModelId(models: AiStudioModelOptionResponse[]) {
  return models.find((item) => item.recommended)?.id ?? models[0]?.id ?? "";
}

function getModelPrice(model?: AiStudioModelOptionResponse | null) {
  return model?.priceTokens ?? 0;
}

function buildModelLabelLookup(catalog: AiStudioModelCatalogResponse) {
  const lookup = new Map<string, string>();
  for (const section of Object.values(catalog.sections)) {
    for (const model of section) {
      lookup.set(model.id, model.label);
    }
  }
  return lookup;
}

function getModelDisplayName(modelCode: string, lookup: Map<string, string>) {
  return lookup.get(modelCode) ?? modelCode;
}

function formatTokenCost(value: number) {
  return `${formatAiTokenAmount(value)} токенов`;
}

function getModelInputs(model: {
  supportsReference?: boolean;
  supportsAudio?: boolean;
  supportsVideo?: boolean;
  supportsImage?: boolean;
}) {
  const inputs = ["Текст"];
  if (model.supportsImage || model.supportsReference) inputs.push("Изображение");
  if (model.supportsVideo) inputs.push("Видео");
  if (model.supportsAudio) inputs.push("Аудио");
  return inputs.join(" + ");
}

interface AiStudioReferenceFile {
  id: string;
  name: string;
  size: number;
  kind: "image" | "audio";
  storageKey: string;
  url: string | null;
}

interface PresignedUploadTarget {
  key: string;
  url: string;
  method?: string;
  bucket?: string | null;
  mock?: boolean;
}

interface AiUploadMutationResponse {
  upload: AiStudioUploadItem;
}

interface AiStudioPreviewGeneration {
  id: string;
  section: AiStudioSection;
  modelCode: string;
  prompt: string;
  resultUrl: string | null;
  createdAt: string;
}

interface AiStudioMediaConversationItem {
  id: string;
  section: AiStudioSection;
  prompt: string;
  modelCode: string;
  createdAt: string;
  status: "pending" | "ready";
  resultUrl: string | null;
}

export function AiStudioPage({
  activeTab,
  userName,
  aiStudioStatus,
  aiTokenBalance,
  pendingAiTokenBalance,
  royaltyBalance,
  entitlements,
  initialModelCatalog,
  chatThreads,
  activeChatThreadId,
  activeChatThread,
  history,
  uploads,
  notifications = [],
  paymentStatus = null,
  paymentSummary = null
}: AiStudioPageProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { refresh: refreshUser } = useCurrentUser();
  const activeSection = TAB_TO_SECTION[activeTab] ?? null;
  const isStudioPreparing = aiStudioStatus === "preparing";
  const modelWorkspaceSection =
    activeSection === "image" || activeSection === "video" || activeSection === "audio" ? activeSection : null;
  const showModelWorkspace = activeTab === "image" || activeTab === "video" || activeTab === "audio";
  const [modelCatalog, setModelCatalog] = React.useState(initialModelCatalog);
  const [earlyAccess, setEarlyAccess] = React.useState(false);
  const [aiTokenBalanceValue, setAiTokenBalanceValue] = React.useState(aiTokenBalance);
  const [pendingAiTokenBalanceValue, setPendingAiTokenBalanceValue] = React.useState(pendingAiTokenBalance);
  const [selectedMode, setSelectedMode] = React.useState("Native");
  const [selectedPriority, setSelectedPriority] = React.useState("Standard");
  const [uploadsState, setUploadsState] = React.useState(uploads);
  const [uploadingReferenceCount, setUploadingReferenceCount] = React.useState(0);
  const [referenceFilesBySection, setReferenceFilesBySection] = React.useState<
    Record<AiStudioSection, AiStudioReferenceFile[]>
  >({
    chat: [],
    image: [],
    video: [],
    audio: []
  });
  const [composerCollapsed, setComposerCollapsed] = React.useState(false);
  const [activationModalOpen, setActivationModalOpen] = React.useState(false);
  const [purchaseModalOpen, setPurchaseModalOpen] = React.useState(searchParams.get("buyTokens") === "1");
  const [purchaseConfirmPackage, setPurchaseConfirmPackage] = React.useState<AiTokenPackageResponse | null>(null);
  const [purchaseBusy, setPurchaseBusy] = React.useState(false);
  const [packagesLoading, setPackagesLoading] = React.useState(false);
  const [packagesError, setPackagesError] = React.useState<string | null>(null);
  const [tokenPackages, setTokenPackages] = React.useState<AiTokenPackageResponse[]>([]);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [paymentBannerVisible, setPaymentBannerVisible] = React.useState(Boolean(paymentStatus));
  const [selectedModelBySection, setSelectedModelBySection] = React.useState<Record<AiStudioSection, string>>(() => ({
    chat: getDefaultModelId(initialModelCatalog.sections.chat),
    image: getDefaultModelId(initialModelCatalog.sections.image),
    video: getDefaultModelId(initialModelCatalog.sections.video),
    audio: getDefaultModelId(initialModelCatalog.sections.audio)
  }));
  const [promptBySection, setPromptBySection] = React.useState<Record<AiStudioSection, string>>({
    chat: "",
    image: "",
    video: "",
    audio: ""
  });
  const [selectedParamsBySection, setSelectedParamsBySection] = React.useState<
    Record<AiStudioSection, Record<string, string>>
  >({
    chat: {
      Mode: "GPT-4o",
      Queue: "Standard",
      Access: "Stable"
    },
    image: {
      Style: "Cover",
      Quality: "Fast",
      Format: "1:1"
    },
    video: {
      Duration: "5 sec",
      Quality: "480p",
      Format: "9:16"
    },
    audio: {
      Type: "Песня",
      Style: "Pop",
      Length: "Short"
    }
  });
  const [selectionOpen, setSelectionOpen] = React.useState(false);
  const [selectionField, setSelectionField] = React.useState<"model" | "mode" | "priority" | "param" | null>(null);
  const [selectionParamLabel, setSelectionParamLabel] = React.useState<string | null>(null);
  const [generationProgress, setGenerationProgress] = React.useState(0);
  const [generationBusy, setGenerationBusy] = React.useState(false);
  const [chatThreadsState, setChatThreadsState] = React.useState(chatThreads);
  const [activeChatThreadState, setActiveChatThreadState] = React.useState(activeChatThread);
  const [chatMessages, setChatMessages] = React.useState<AiStudioChatMessageResponse[]>(
    activeChatThread?.messages ?? []
  );
  const [chatModelId, setChatModelId] = React.useState(
    activeChatThread?.modelCode || getDefaultModelId(initialModelCatalog.sections.chat)
  );
  const [chatBusy, setChatBusy] = React.useState(false);
  const [latestGenerationBySection, setLatestGenerationBySection] = React.useState<
    Partial<Record<AiStudioSection, AiStudioPreviewGeneration>>
  >({});
  const [mediaConversationBySection, setMediaConversationBySection] = React.useState<
    Partial<Record<AiStudioSection, AiStudioMediaConversationItem[]>>
  >({});

  React.useEffect(() => {
    setAiTokenBalanceValue(aiTokenBalance);
  }, [aiTokenBalance]);

  React.useEffect(() => {
    setPendingAiTokenBalanceValue(pendingAiTokenBalance);
  }, [pendingAiTokenBalance]);

  React.useEffect(() => {
    setUploadsState(uploads);
  }, [uploads]);

  React.useEffect(() => {
    if (searchParams.get("buyTokens") === "1") {
      setPurchaseModalOpen(true);
    }
  }, [searchParams]);

  React.useEffect(() => {
    const repeatId = searchParams.get("repeat");
    if (!repeatId) return;

    const item = history.find((entry) => entry.id === repeatId);
    if (!item) return;

    setPromptBySection((current) => ({
      ...current,
      [item.section as AiStudioSection]: item.prompt
    }));
    setSelectedModelBySection((current) => ({
      ...current,
      [item.section as AiStudioSection]:
        current[item.section as AiStudioSection] || item.modelCode || current[item.section as AiStudioSection]
    }));
  }, [history, searchParams]);

  React.useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  React.useEffect(() => {
    if (paymentStatus === "success" || paymentStatus === "succeeded" || paymentStatus === "already_confirmed") {
      if (paymentSummary?.totalTokens) {
        setToastMessage(
          `Оплата подтверждена. Начислено ${formatAiTokenAmount(paymentSummary.totalTokens)} AI-токенов.`
        );
      } else {
        setToastMessage("Оплата подтверждена. AI-токены начислены.");
      }
      return;
    }

    if (paymentStatus === "preparing") {
      setToastMessage(
        paymentSummary?.totalTokens
          ? `Оплата подтверждена. ${formatAiTokenAmount(paymentSummary.totalTokens)} AI-токенов ожидают активации AI Studio.`
          : "Оплата подтверждена. AI-токены будут начислены после активации AI Studio."
      );
      return;
    }

    if (paymentStatus === "pending" || paymentStatus === "waiting_for_capture") {
      setToastMessage("Платёж ещё не подтверждён YooKassa. Если деньги списались, обновите страницу через несколько секунд.");
      return;
    }

    if (paymentStatus) {
      setToastMessage("Платёж не был подтверждён.");
    }
  }, [paymentStatus, paymentSummary]);

  React.useEffect(() => {
    setPaymentBannerVisible(Boolean(paymentStatus));
  }, [paymentStatus]);

  React.useEffect(() => {
    if (!paymentStatus || !searchParams.get("pay_order")) return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("pay_order");
    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, paymentStatus, router, searchParams]);

  React.useEffect(() => {
    setChatThreadsState(chatThreads);
  }, [chatThreads]);

  React.useEffect(() => {
    setActiveChatThreadState(activeChatThread);
    setChatMessages(activeChatThread?.messages ?? []);
    setChatModelId(activeChatThread?.modelCode || getDefaultModelId(initialModelCatalog.sections.chat));
    setPromptBySection((current) => ({
      ...current,
      chat: ""
    }));
  }, [activeChatThread, initialModelCatalog.sections.chat]);

  React.useEffect(() => {
    setSelectionOpen(false);
    setSelectionField(null);
    setSelectionParamLabel(null);
    setGenerationProgress(0);
  }, [activeTab]);

  React.useEffect(() => {
    if (!purchaseModalOpen || tokenPackages.length > 0) return;

    let cancelled = false;
    const loadPackages = async () => {
      setPackagesLoading(true);
      setPackagesError(null);
      try {
        const response = await fetch("/api/ai/tokens/packages", {
          method: "GET",
          cache: "no-store"
        });
        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(errorPayload?.error ?? "Не удалось загрузить пакеты токенов.");
        }
        const payload = (await response.json()) as { packages: AiTokenPackageResponse[] };

        if (cancelled) return;
        setTokenPackages(payload.packages);
      } catch (error) {
        if (!cancelled) {
          setPackagesError(error instanceof Error ? error.message : "Не удалось загрузить пакеты токенов.");
        }
      } finally {
        if (!cancelled) setPackagesLoading(false);
      }
    };

    void loadPackages();
    return () => {
      cancelled = true;
    };
  }, [purchaseModalOpen, tokenPackages.length]);

  const showToast = React.useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  const openPurchaseModal = React.useCallback(() => {
    setPackagesError(null);
    setTokenPackages([]);
    setPurchaseModalOpen(true);
  }, []);

  const closePurchaseModal = React.useCallback(() => {
    setPurchaseConfirmPackage(null);
    setPurchaseModalOpen(false);
    setTokenPackages([]);
  }, []);

  const handlePurchasePackage = React.useCallback((tokenPackage: AiTokenPackageResponse) => {
    setPurchaseConfirmPackage(tokenPackage);
  }, []);

  const confirmPurchase = React.useCallback(async () => {
    if (!purchaseConfirmPackage) return;

    setPurchaseBusy(true);
    try {
      const response = await fetch("/api/ai/tokens/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageCode: purchaseConfirmPackage.code,
          returnPath: window.location.pathname
        })
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; confirmationUrl?: string; error?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.confirmationUrl) {
        throw new Error(payload?.error ?? "Не удалось перейти к оплате AI-токенов.");
      }

      setPurchaseConfirmPackage(null);
      setPurchaseModalOpen(false);
      window.location.assign(payload.confirmationUrl);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось перейти к оплате AI-токенов.");
    } finally {
      setPurchaseBusy(false);
    }
  }, [purchaseConfirmPackage, showToast]);

  const currentModels = React.useMemo(
    () => (activeSection && activeSection !== "chat" ? modelCatalog.sections[activeSection] ?? [] : []),
    [activeSection, modelCatalog]
  );
  const visibleModels = React.useMemo(
    () => currentModels.filter((model) => earlyAccess || !/preview|experimental/i.test(model.label)),
    [currentModels, earlyAccess]
  );
  const hasStudioAccessState =
    entitlements.hasAccess || aiTokenBalanceValue > 0 || pendingAiTokenBalanceValue > 0;
  const shouldShowPreparingState = isStudioPreparing && hasStudioAccessState;
  const requiresStudioActivation =
    !shouldShowPreparingState &&
    !entitlements.hasAccess &&
    aiTokenBalanceValue <= 0 &&
    pendingAiTokenBalanceValue <= 0;
  const modelLabelLookup = React.useMemo(() => buildModelLabelLookup(modelCatalog), [modelCatalog]);
  const selectedModel =
    activeSection && activeSection !== "chat"
      ? visibleModels.find((model) => model.id === selectedModelBySection[activeSection]) ?? visibleModels[0] ?? null
      : null;
  const chatModels = React.useMemo(
    () => (modelCatalog.sections.chat ?? []).filter((model) => earlyAccess || !/preview|experimental/i.test(model.label)),
    [modelCatalog.sections.chat, earlyAccess]
  );
  const selectedChatModel = chatModels.find((model) => model.id === chatModelId) ?? chatModels[0] ?? null;
  const currentPrompt = activeSection ? promptBySection[activeSection] : "";
  const referenceFiles = React.useMemo(
    () => (activeSection && activeSection !== "chat" ? referenceFilesBySection[activeSection] ?? [] : []),
    [activeSection, referenceFilesBySection]
  );
  const currentGenerationPreview =
    activeSection && activeSection !== "chat"
      ? latestGenerationBySection[activeSection] ?? null
      : null;
  const currentMediaConversation =
    activeSection && activeSection !== "chat"
      ? mediaConversationBySection[activeSection] ?? []
      : [];
  const mediaModelPrice =
    activeSection && activeSection !== "chat" && selectedModel
      ? resolveAiStudioGenerationCostTokens({
          section: activeSection,
          modelCode: selectedModel.id,
          modelPriceTokens: getModelPrice(selectedModel),
          parameters: selectedParamsBySection[activeSection]
        })
      : 0;
  const chatModelPrice = Math.max(1, Math.trunc(selectedChatModel?.priceTokens ?? 25));
  const canGenerateMedia = Boolean(
    !shouldShowPreparingState &&
      !requiresStudioActivation &&
      activeSection &&
      activeSection !== "chat" &&
      currentPrompt.trim().length >= 6 &&
      uploadingReferenceCount === 0 &&
      aiTokenBalanceValue >= mediaModelPrice &&
      !generationBusy
  );
  const canSendChat = Boolean(
    !shouldShowPreparingState &&
      !requiresStudioActivation &&
      activeTab === "chat" &&
      currentPrompt.trim().length >= 1 &&
      aiTokenBalanceValue >= chatModelPrice &&
      !chatBusy
  );
  const composerCost = activeSection && activeSection !== "chat"
    ? selectedModel
      ? mediaModelPrice
      : SECTION_COST_LABELS[activeSection]
    : 0;
  const mediaDisabledHint = shouldShowPreparingState
    ? "AI Studio подготавливается"
    : requiresStudioActivation
      ? "Генерация станет доступна после активации AI Studio"
      : activeSection && activeSection !== "chat" && aiTokenBalanceValue < mediaModelPrice
        ? `Недостаточно токенов: нужно ${formatAiTokenAmount(mediaModelPrice)}`
        : null;
  const chatDisabledHint = shouldShowPreparingState
    ? "AI Studio подготавливается"
    : requiresStudioActivation
      ? "Отправка станет доступна после активации AI Studio"
      : aiTokenBalanceValue < chatModelPrice
        ? `Недостаточно токенов: нужно ${formatAiTokenAmount(chatModelPrice)}`
        : null;
  const toolbarParams = activeSection && activeSection !== "chat" ? MODEL_PARAM_PRESETS[activeSection] : [];
  const handleGenerate = React.useCallback(async () => {
    if (shouldShowPreparingState) {
      showToast("AI Studio ещё подготавливается. Проверьте статус немного позже.");
      return;
    }
    if (requiresStudioActivation) {
      setActivationModalOpen(true);
      return;
    }
    if (!activeSection || activeSection === "chat" || !canGenerateMedia || generationBusy) return;

    const modelId = selectedModel?.id ?? getDefaultModelId(currentModels);
    if (!modelId) return;

    const requestPrompt = currentPrompt.trim();
    const requestId = crypto.randomUUID();
    setGenerationBusy(true);
    setGenerationProgress(8);
    setMediaConversationBySection((current) => ({
      ...current,
      [activeSection]: [
        ...(current[activeSection] ?? []),
        {
          id: requestId,
          section: activeSection,
          prompt: requestPrompt,
          modelCode: modelId,
          createdAt: new Date().toISOString(),
          status: "pending",
          resultUrl: null
        }
      ]
    }));

    try {
      const payload: AiStudioGenerateRequest = {
        section: activeSection,
        prompt: requestPrompt,
        modelId,
        parameters: activeSection ? selectedParamsBySection[activeSection] : {},
        referenceFiles: referenceFiles.map((file) => ({
          uploadId: file.id,
          name: file.name,
          kind: file.kind,
          size: file.size,
          storageKey: file.storageKey,
          url: file.url ?? undefined
        })),
        mode: selectedMode,
        priority: selectedPriority,
        earlyAccess
      };

      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = (await response.json().catch(() => null)) as AiStudioGenerateResponse | { error?: string } | null;
      if (!response.ok || !result || !("success" in result) || !result.success) {
        throw new Error((result && "error" in result ? result.error : null) ?? "Не удалось запустить генерацию.");
      }

      setAiTokenBalanceValue(result.newBalance ?? aiTokenBalanceValue);
      setGenerationProgress(100);
      if (result.previewUrl || result.generation?.resultUrl) {
        const nextGeneration =
          result.generation
            ? {
                ...result.generation,
                resultUrl: result.previewUrl ?? result.generation.resultUrl
              }
            : {
                id: requestId,
                section: activeSection,
                modelCode: modelId,
                prompt: requestPrompt,
                resultUrl: result.previewUrl ?? null,
                createdAt: new Date().toISOString()
              };

        setLatestGenerationBySection((current) => ({
          ...current,
          [activeSection]: nextGeneration
        }));
        setMediaConversationBySection((current) => ({
          ...current,
          [activeSection]: (current[activeSection] ?? []).map((item) =>
            item.id === requestId
              ? {
                  id: nextGeneration.id,
                  section: activeSection,
                  prompt: nextGeneration.prompt,
                  modelCode: nextGeneration.modelCode,
                  createdAt: nextGeneration.createdAt,
                  status: "ready",
                  resultUrl: nextGeneration.resultUrl
                }
              : item
          )
        }));
      }
      setPromptBySection((current) => ({
        ...current,
        [activeSection]: ""
      }));
      showToast("Генерация добавлена в архив");
      await refreshUser(true);
    } catch (error) {
      setGenerationProgress(0);
      setMediaConversationBySection((current) => ({
        ...current,
        [activeSection]: (current[activeSection] ?? []).filter((item) => item.id !== requestId)
      }));
      showToast(error instanceof Error ? error.message : "Не удалось запустить генерацию.");
    } finally {
      setGenerationBusy(false);
      window.setTimeout(() => setGenerationProgress(0), 600);
    }
  }, [
    activeSection,
    aiTokenBalanceValue,
    canGenerateMedia,
    currentPrompt,
    earlyAccess,
    generationBusy,
    requiresStudioActivation,
    shouldShowPreparingState,
    currentModels,
    referenceFiles,
    refreshUser,
    router,
    selectedMode,
    selectedPriority,
    selectedModel?.id,
    selectedParamsBySection,
    showToast
  ]);

  const handleSendChatMessage = React.useCallback(async () => {
    if (shouldShowPreparingState) {
      showToast("AI Studio ещё подготавливается. Проверьте статус немного позже.");
      return;
    }
    if (requiresStudioActivation) {
      setActivationModalOpen(true);
      return;
    }
    if (activeTab !== "chat" || !canSendChat || chatBusy) return;
    const prompt = currentPrompt.trim();
    if (!prompt || !selectedChatModel) return;

    setChatBusy(true);
    setGenerationProgress(8);

    try {
      const payload = {
        threadId: activeChatThreadState?.id ?? activeChatThreadId,
        modelId: selectedChatModel.id,
        prompt
      };

      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            newBalance?: number;
            transactionId?: string;
            thread?: AiStudioChatThreadResponse;
            userMessage?: AiStudioChatMessageResponse;
            assistantMessage?: AiStudioChatMessageResponse;
            error?: string;
          }
        | null;

      if (!response.ok || !result?.success || !result.thread || !result.userMessage || !result.assistantMessage) {
        throw new Error(result?.error ?? "Не удалось отправить сообщение.");
      }

      setAiTokenBalanceValue(result.newBalance ?? aiTokenBalanceValue);
      setPromptBySection((current) => ({
        ...current,
        chat: ""
      }));
      setChatMessages((current) =>
        [...current, result.userMessage, result.assistantMessage].filter(Boolean) as AiStudioChatMessageResponse[]
      );
      setActiveChatThreadState(result.thread as AiStudioChatThreadPayload);
      setChatThreadsState((current) => {
        const next = current.filter((item) => item.id !== result.thread?.id);
        return [result.thread as AiStudioChatThreadResponse, ...next];
      });
      setChatModelId(result.thread.modelCode);
      router.replace(`/dashboard/ai-studio/chat?chat=${result.thread.id}`);
      showToast("Сообщение отправлено");
      await refreshUser(true);
    } catch (error) {
      setGenerationProgress(0);
      showToast(error instanceof Error ? error.message : "Не удалось отправить сообщение.");
    } finally {
      setChatBusy(false);
      window.setTimeout(() => setGenerationProgress(0), 600);
    }
  }, [
    activeChatThreadId,
    activeChatThreadState?.id,
    activeTab,
    aiTokenBalanceValue,
    canSendChat,
    chatBusy,
    currentPrompt,
    requiresStudioActivation,
    refreshUser,
    router,
    selectedChatModel,
    showToast
  ]);

  const openNewChat = React.useCallback(() => {
    router.push("/dashboard/ai-studio/chat?chat=new");
  }, [router]);

  const selectChatThread = React.useCallback(
    (threadId: string) => {
      router.push(`/dashboard/ai-studio/chat?chat=${threadId}`);
    },
    [router]
  );

  const onChooseModel = (modelId: string) => {
    if (!activeSection) return;
    setSelectedModelBySection((current) => ({
      ...current,
      [activeSection]: modelId
    }));
    setSelectionOpen(false);
    setSelectionField(null);
    setSelectionParamLabel(null);
  };

  const onChooseFieldValue = (value: string) => {
    if (!activeSection) return;
    if (selectionField === "model") {
      if (activeSection === "chat") {
        setChatModelId(value);
        setSelectionOpen(false);
        setSelectionField(null);
        setSelectionParamLabel(null);
      } else {
        onChooseModel(
          visibleModels.find((model) => model.label === value || model.id === value)?.id ??
            selectedModel?.id ??
            value
        );
      }
      return;
    }

    if (selectionField === "mode") {
      setSelectedMode(value);
      setSelectionOpen(false);
      setSelectionField(null);
      setSelectionParamLabel(null);
      return;
    }

    if (selectionField === "priority") {
      setSelectedPriority(value);
      setSelectionOpen(false);
      setSelectionField(null);
      setSelectionParamLabel(null);
      return;
    }

    if (selectionField === "param" && selectionParamLabel) {
      setSelectedParamsBySection((current) => ({
        ...current,
        [activeSection]: {
          ...current[activeSection],
          [selectionParamLabel]: value
        }
      }));
      setSelectionOpen(false);
      setSelectionField(null);
      setSelectionParamLabel(null);
    }
  };

  const onSelectToolbarField = (field: "model" | "mode" | "priority" | "param", label?: string) => {
    if (!activeSection) return;
    setSelectionOpen(true);
    setSelectionField(field);
    setSelectionParamLabel(label ?? null);
  };

  const uploadReferenceFile = React.useCallback(async (section: "image" | "video" | "audio", file: File) => {
    const contentType = inferUploadContentType(file);
    const targetResponse = await fetch("/api/uploads/presigned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: sanitizeUploadFileName(file.name),
        contentType,
        kind: file.type.startsWith("audio/") ? "audio" : undefined
      })
    });

    const target = (await targetResponse.json().catch(() => null)) as PresignedUploadTarget | { error?: string } | null;
    if (!targetResponse.ok || !target || !("url" in target) || !target.url || !target.key) {
      throw new Error(
        target && "error" in target && typeof target.error === "string"
          ? target.error
          : "Не удалось получить ссылку для загрузки файла."
      );
    }

    if (target.mock) {
      throw new Error("Хранилище файлов не настроено. Проверьте S3/MinIO переменные окружения.");
    }

    const uploadResponse = await fetch(target.url, {
      method: target.method ?? "PUT",
      headers: {
        "Content-Type": contentType
      },
      body: file
    });

    if (!uploadResponse.ok) {
      throw new Error("Ошибка загрузки файла в хранилище.");
    }

    const saveResponse = await fetch("/api/ai/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        section,
        fileName: file.name,
        storageKey: target.key,
        mimeType: contentType,
        sizeBytes: file.size
      })
    });

    const saved = (await saveResponse.json().catch(() => null)) as AiUploadMutationResponse | { error?: string } | null;
    if (!saveResponse.ok || !saved || !("upload" in saved) || !saved.upload) {
      throw new Error(
        saved && "error" in saved && typeof saved.error === "string"
          ? saved.error
          : "Не удалось сохранить запись о загруженном файле."
      );
    }

    return saved.upload;
  }, []);

  const onPickReferenceFiles = React.useCallback(async (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => {
      const contentType = inferUploadContentType(file);
      return contentType.startsWith("image/") || contentType.startsWith("audio/");
    });

    if (accepted.length === 0) {
      showToast("Можно загружать только image и audio референсы.");
      return;
    }

    const section = activeSection;
    if (section !== "image" && section !== "video" && section !== "audio") return;

    const currentCount = referenceFilesBySection[section]?.length ?? 0;
    const availableSlots = Math.max(0, 8 - currentCount);
    if (availableSlots === 0) {
      showToast("Можно прикрепить не более 8 референсов.");
      return;
    }

    const queue = accepted.slice(0, availableSlots);
    setUploadingReferenceCount((current) => current + queue.length);

    try {
      const uploaded = await Promise.all(
        queue.map(async (file) => {
          const upload = await uploadReferenceFile(section, file);
          return {
            upload,
            reference: {
              id: upload.id,
              name: upload.fileName,
              size: upload.sizeBytes,
              kind: upload.mimeType.startsWith("audio/") ? ("audio" as const) : ("image" as const),
              storageKey: upload.storageKey,
              url: upload.url
            }
          };
        })
      );

      setUploadsState((current) => {
        const existing = new Set(current.map((item) => item.id));
        const next = [...uploaded.map((item) => item.upload).filter((item) => !existing.has(item.id)), ...current];
        return next.slice(0, 24);
      });
      setReferenceFilesBySection((current) => ({
        ...current,
        [section]: [...current[section], ...uploaded.map((item) => item.reference)].slice(0, 8)
      }));
      showToast(queue.length === 1 ? "Референс загружен" : `Загружено референсов: ${queue.length}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось загрузить референс.");
    } finally {
      setUploadingReferenceCount((current) => Math.max(0, current - queue.length));
    }
  }, [activeSection, referenceFilesBySection, showToast, uploadReferenceFile]);

  const onRemoveReferenceFile = React.useCallback((id: string) => {
    const section = activeSection;
    if (section !== "image" && section !== "video" && section !== "audio") return;
    setReferenceFilesBySection((current) => ({
      ...current,
      [section]: current[section].filter((file) => file.id !== id)
    }));
  }, [activeSection]);

  const handleDeleteUpload = React.useCallback(async (uploadId: string) => {
    try {
      const response = await fetch(`/api/ai/uploads/${encodeURIComponent(uploadId)}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Не удалось удалить файл.");
      }

      setUploadsState((current) => current.filter((item) => item.id !== uploadId));
      setReferenceFilesBySection((current) => ({
        chat: current.chat,
        image: current.image.filter((file) => file.id !== uploadId),
        video: current.video.filter((file) => file.id !== uploadId),
        audio: current.audio.filter((file) => file.id !== uploadId)
      }));
      showToast("Файл удалён");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось удалить файл.");
    }
  }, [showToast]);

  const handleOpenSubscription = React.useCallback(() => {
    setActivationModalOpen(false);
    router.push("/dashboard/subscription");
  }, [router]);

  const handleOpenTokenPurchase = React.useCallback(() => {
    setActivationModalOpen(false);
    openPurchaseModal();
  }, [openPurchaseModal]);

  const composerControls = modelWorkspaceSection ? (
      <div className="flex flex-wrap items-center gap-2">
        <ToolbarDropdown
          label={selectedModel?.label ?? MODEL_FALLBACKS[modelWorkspaceSection][0]}
          onClick={() => onSelectToolbarField("model")}
        />
        {toolbarParams.map((param) => (
          <ToolbarDropdown
            key={param.label}
            label={selectedParamsBySection[modelWorkspaceSection][param.label] ?? param.label}
            onClick={() => onSelectToolbarField("param", param.label)}
          />
        ))}
      </div>
    ) : null;
  return (
    <>
      <div className="grid gap-5 pb-28 motion-safe:animate-[aiStudioEnter_160ms_cubic-bezier(0.22,1,0.36,1)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <AiStudioSidebar
          activeTab={activeTab}
          chatThreads={chatThreadsState}
          activeChatThreadId={activeChatThreadState?.id ?? activeChatThreadId}
          onNewChat={openNewChat}
          onSelectChatThread={selectChatThread}
        />
        <div className="space-y-5">
          <section className="perf-content-auto perf-paint-contain rounded-[28px] border border-white/[0.08] bg-[#10131a]/95 px-5 py-4 shadow-[0_14px_40px_-30px_rgba(11,14,24,0.82)] sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Badge
                  variant="muted"
                  className="mb-2 border-emerald-400/30 bg-emerald-500/12 text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.08)]"
                >
                  AI Студия V1
                </Badge>
                <h1 className="font-display text-[28px] font-bold leading-tight text-white sm:text-[34px]">
                  AI Студия
                </h1>
                <p className="mt-1 max-w-2xl text-[15px] font-medium text-white/66">
                  Создавайте изображения, видео, музыку и контент для продвижения артиста.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] font-medium text-white/44">
                  <span>{userName}</span>
                  <span>•</span>
                  <span>{formatRubCurrency(royaltyBalance)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-2xl border border-white/[0.10] bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">AI-токены</div>
                  <div className="mt-1 text-[20px] font-semibold text-white">{formatAiTokenAmount(aiTokenBalanceValue)}</div>
                </div>
                <div className="rounded-2xl border border-white/[0.10] bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Ожидают</div>
                  <div className="mt-1 text-[20px] font-semibold text-amber-200">{formatAiTokenAmount(pendingAiTokenBalanceValue)}</div>
                </div>
                <div className="rounded-2xl border border-white/[0.10] bg-white/[0.03] px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Тариф</div>
                  <div className="mt-1 text-[20px] font-semibold text-white">{entitlements.plan}</div>
                </div>
                <Button size="sm" className="h-12 px-5" onClick={openPurchaseModal}>
                  Купить токены
                </Button>
              </div>
            </div>
          </section>

          {paymentStatus && paymentBannerVisible ? (
            <PaymentStatusBanner
              status={paymentStatus}
              paymentSummary={paymentSummary}
              onClose={() => setPaymentBannerVisible(false)}
            />
          ) : null}

          {notifications.length > 0 ? <AiStudioNotificationsSection notifications={notifications} /> : null}

          {activeTab === "chat" ? (
            shouldShowPreparingState ? (
              <AiStudioPreparingState pendingTokens={pendingAiTokenBalanceValue} onRefresh={() => router.refresh()} />
            ) : (
              <ChatWorkspace
                title={activeChatThreadState?.title ?? "Новый чат"}
                modelLabel={selectedChatModel?.label ?? "GPT-4o"}
                modelPrice={chatModelPrice}
                aiTokenBalance={aiTokenBalanceValue}
                onOpenModelSelector={() => {
                  setSelectionOpen(true);
                  setSelectionField("model");
                  setSelectionParamLabel(null);
                }}
                messages={chatMessages}
                prompt={currentPrompt}
                onPromptChange={(value) =>
                  setPromptBySection((current) => ({
                    ...current,
                    chat: value
                  }))
                }
                onSend={handleSendChatMessage}
                sending={chatBusy}
                canSend={canSendChat}
                progress={generationProgress}
                onNewChat={openNewChat}
                disabledHint={chatBusy ? null : chatDisabledHint}
              />
            )
          ) : null}

          {showModelWorkspace ? (
            <section className="perf-content-auto perf-paint-contain flex min-h-[calc(100vh-220px)] flex-col rounded-[28px] border border-white/[0.08] bg-[#10131a]/95 px-5 py-5">
              <div className="min-h-[520px] flex-1 rounded-[24px] border border-dashed border-white/[0.08] bg-white/[0.02] p-5">
                {shouldShowPreparingState ? (
                  <AiStudioPreparingState
                    pendingTokens={pendingAiTokenBalanceValue}
                    onRefresh={() => router.refresh()}
                    compact
                  />
                ) : currentMediaConversation.length > 0 ? (
                  <MediaWorkspace conversation={currentMediaConversation} modelLabelLookup={modelLabelLookup} />
                ) : (
                  <div className="flex min-h-[450px] items-center justify-center rounded-[24px] text-center">
                    <div className="max-w-md space-y-3">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/60">
                        <Sparkles className="h-6 w-6" />
                      </div>
                      <div className="text-[18px] font-semibold text-white">
                        {SECTION_LABELS[modelWorkspaceSection ?? "image"]}
                      </div>
                      <p className="text-[14px] font-medium leading-6 text-white/50">
                        Введите prompt и выберите модель в нижней панели. Результат появится здесь сразу после генерации.
                      </p>
                    </div>
                  </div>
                )}
              </div>
              {!shouldShowPreparingState ? (
                <ComposerBar
                  className="mt-4 lg:sticky lg:bottom-0"
                  activeSection={modelWorkspaceSection ?? "image"}
                  prompt={currentPrompt}
                  onPromptChange={(value) =>
                    setPromptBySection((current) => ({
                      ...current,
                      [modelWorkspaceSection ?? "image"]: value
                    }))
                  }
                  modelPrice={mediaModelPrice}
                  canGenerate={canGenerateMedia}
                  costLabel={composerCost}
                  controls={composerControls}
                  onGenerate={handleGenerate}
                  canAddReferences={modelWorkspaceSection !== "video"}
                  referenceFiles={referenceFiles}
                  onAddReference={onPickReferenceFiles}
                  onRemoveReference={onRemoveReferenceFile}
                  generationProgress={generationProgress}
                  generationBusy={generationBusy}
                  onOpenSettings={() => onSelectToolbarField("param", toolbarParams[0]?.label)}
                  collapsed={composerCollapsed}
                  onToggleCollapsed={() => setComposerCollapsed((value) => !value)}
                  disabledHint={generationBusy ? null : mediaDisabledHint}
                />
              ) : null}
            </section>
          ) : null}

          {activeTab === "uploads" ? (
            shouldShowPreparingState ? (
              <AiStudioPreparingState pendingTokens={pendingAiTokenBalanceValue} onRefresh={() => router.refresh()} compact />
            ) : (
              <UploadsSection uploads={uploadsState} onDeleteUpload={handleDeleteUpload} />
            )
          ) : null}
          {activeTab === "archive" ? (
            shouldShowPreparingState ? (
              <AiStudioPreparingState pendingTokens={pendingAiTokenBalanceValue} onRefresh={() => router.refresh()} compact />
            ) : (
              <ArchiveSection history={history} />
            )
          ) : null}

          {activationModalOpen ? (
            <ActivationRequiredModal
              onClose={() => setActivationModalOpen(false)}
              onOpenSubscription={handleOpenSubscription}
              onOpenTokenPurchase={handleOpenTokenPurchase}
            />
          ) : null}

          {purchaseModalOpen ? (
            <TokenPurchaseModal
              balance={aiTokenBalanceValue}
              packages={tokenPackages}
              loading={packagesLoading}
              error={packagesError}
              onClose={closePurchaseModal}
              onChoosePackage={handlePurchasePackage}
            />
          ) : null}

          {purchaseConfirmPackage ? (
            <PurchaseConfirmModal
              packageName={purchaseConfirmPackage.name}
              packageTokens={purchaseConfirmPackage.tokenAmount}
              packageBonusTokens={purchaseConfirmPackage.bonusTokens}
              packagePriceRub={purchaseConfirmPackage.priceRub}
              busy={purchaseBusy}
              onCancel={() => setPurchaseConfirmPackage(null)}
              onConfirm={() => {
                void confirmPurchase();
              }}
            />
          ) : null}

          {toastMessage ? <FloatingToast message={toastMessage} /> : null}

          {selectionOpen && (activeTab === "chat" || showModelWorkspace) ? (
            <SelectionPopover
              section={activeSection ?? "chat"}
              field={selectionField}
              label={selectionParamLabel}
          models={activeSection === "chat" ? chatModels : visibleModels}
          currentModelId={activeSection === "chat" ? chatModelId : selectedModel?.id ?? ""}
          currentParamValue={
            selectionParamLabel
              ? selectedParamsBySection[activeSection ?? "chat"][selectionParamLabel] ?? null
              : null
          }
          onChooseValue={onChooseFieldValue}
          onClose={() => setSelectionOpen(false)}
        />
      ) : null}
        </div>
      </div>

      <style jsx global>{`
        @keyframes aiStudioEnter {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}

function AiStudioPreparingState({
  pendingTokens,
  onRefresh,
  compact = false
}: {
  pendingTokens: number;
  onRefresh: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid place-items-center rounded-[24px] border border-dashed border-white/[0.08] bg-white/[0.02] px-6 text-center", compact ? "min-h-[420px]" : "min-h-[520px]")}>
      <div className="max-w-2xl space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/60">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
        <div className="space-y-2">
          <div className="text-[24px] font-semibold text-white">Подготавливаем вашу AI Studio</div>
          <p className="text-[15px] leading-7 text-white/62">
            Мы уже получили ваш заказ. Сейчас автоматически выполняется подключение вычислительной инфраструктуры и
            подготовка вашей персональной AI-среды.
          </p>
        </div>
        <div className="grid gap-2 rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4 text-left text-[14px] text-white/72">
          <div>✓ AI-токены будут автоматически начислены</div>
          <div>✓ Все AI-инструменты станут доступны</div>
          <div>✓ Генерация начнёт работать без дополнительных действий</div>
        </div>
        <div className="grid gap-2 rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4 text-left text-[14px] text-white/72">
          <div className="flex items-center justify-between gap-3">
            <span>Статус AI Studio</span>
            <span className="text-amber-200">Подготовка</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Ожидающие AI-токены</span>
            <span className="font-semibold text-white">{formatAiTokenAmount(pendingTokens)}</span>
          </div>
        </div>
        <p className="text-[13px] font-medium text-white/48">Мы автоматически уведомим вас сразу после завершения подготовки.</p>
        <Button onClick={onRefresh} className="h-11 px-5">
          Проверить статус
        </Button>
      </div>
    </div>
  );
}

function ActivationRequiredModal({
  onClose,
  onOpenSubscription,
  onOpenTokenPurchase
}: {
  onClose: () => void;
  onOpenSubscription: () => void;
  onOpenTokenPurchase: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="mx-auto mt-20 w-full max-w-2xl rounded-[28px] border border-white/[0.10] bg-[#10131a]/98 p-6 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.84)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/40">AI Studio</div>
            <h3 className="mt-1 text-[28px] font-semibold text-white">Начните создавать с AI Studio</h3>
            <p className="mt-3 max-w-xl text-[15px] leading-7 text-white/62">
              Для запуска генерации необходимо активировать доступ к AI Studio.
            </p>
            <p className="mt-2 max-w-xl text-[15px] leading-7 text-white/62">
              Вы можете оформить подписку или приобрести пакет AI-токенов. После активации будут доступны все
              AI-инструменты без дополнительных настроек.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72 transition-[background-color,border-color,transform,color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white/[0.06] motion-reduce:transition-none"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenSubscription}
            className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-5 text-left transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.05]"
          >
            <div className="text-[18px] font-semibold text-white">Оформить подписку</div>
            <div className="mt-2 text-[14px] leading-6 text-white/56">
              Перейти к тарифам и активировать доступ к AI Studio через подписку.
            </div>
          </button>
          <button
            type="button"
            onClick={onOpenTokenPurchase}
            className="rounded-[24px] border border-[#7b3df5]/28 bg-[#7b3df5]/10 p-5 text-left transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-[#7b3df5]/42 hover:bg-[#7b3df5]/14"
          >
            <div className="text-[18px] font-semibold text-white">Купить AI-токены</div>
            <div className="mt-2 text-[14px] leading-6 text-white/60">
              Открыть покупку токенов и активировать генерацию изображений, видео, аудио и AI-чатов.
            </div>
          </button>
        </div>

        <div className="mt-5 text-[13px] font-medium text-white/44">
          После оформления заказа активация выполняется автоматически.
        </div>
      </div>
    </div>
  );
}

function AiStudioNotificationsSection({
  notifications
}: {
  notifications: NonNullable<AiStudioPageProps["notifications"]>;
}) {
  return (
    <section className="rounded-[28px] border border-white/[0.08] bg-[#10131a]/95 px-5 py-5">
      <div className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-white">
        <Sparkles className="h-4 w-4 text-[#7b3df5]" />
        Обновления AI Studio
      </div>
      <div className="grid gap-3">
        {notifications.map((notification) => (
          <div key={notification.id} className="rounded-[22px] border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[15px] font-semibold text-white">{notification.title}</div>
                <div className="mt-1 whitespace-pre-line text-[14px] leading-6 text-white/62">{notification.message}</div>
              </div>
              <div className="text-[12px] text-white/38">{formatDate(notification.createdAt)}</div>
            </div>
            {notification.ctaLabel && notification.ctaHref ? (
              <div className="mt-3">
                <Link
                  href={notification.ctaHref}
                  className="inline-flex items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05]"
                >
                  {notification.ctaLabel}
                </Link>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function PaymentStatusBanner({
  status,
  paymentSummary,
  onClose
}: {
  status: NonNullable<AiStudioPageProps["paymentStatus"]>;
  paymentSummary?: AiStudioPageProps["paymentSummary"];
  onClose: () => void;
}) {
  const isSuccess = status === "success" || status === "succeeded" || status === "already_confirmed";
  const isPreparing = status === "preparing";
  const isPending = status === "pending" || status === "waiting_for_capture";
  const title = isSuccess
    ? "Оплата подтверждена"
    : isPreparing
      ? "Оплата успешно получена"
    : isPending
      ? "Платёж в обработке"
      : "Платёж не подтверждён";
  const description = isSuccess
    ? paymentSummary?.totalTokens
      ? `Пакет ${paymentSummary.packageName} оплачен. На баланс начислено ${formatAiTokenAmount(paymentSummary.totalTokens)} AI-токенов${paymentSummary.bonusTokens > 0 ? `, включая ${formatAiTokenAmount(paymentSummary.bonusTokens)} бонусных` : ""}.`
      : "AI-токены начислены на баланс. Можно продолжать работу в AI Студии."
    : isPreparing
      ? "Мы начали подготовку вашей AI-среды. После активации AI Studio токены будут начислены автоматически без дополнительных действий."
    : isPending
      ? "YooKassa ещё не прислала финальное подтверждение. Если деньги списались, обновите страницу через несколько секунд."
      : "YooKassa не подтвердила оплату. Попробуйте открыть покупку токенов ещё раз.";

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-[24px] border px-5 py-4 shadow-[0_14px_36px_-26px_rgba(11,14,24,0.76)]",
        isSuccess
          ? "border-emerald-400/20 bg-emerald-500/[0.08]"
          : isPreparing
            ? "border-amber-400/20 bg-amber-500/[0.08]"
          : isPending
            ? "border-sky-400/20 bg-sky-500/[0.08]"
            : "border-rose-400/20 bg-rose-500/[0.08]"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
            isSuccess
              ? "border-emerald-300/24 bg-emerald-400/12 text-emerald-200"
              : isPreparing
                ? "border-amber-300/24 bg-amber-400/12 text-amber-200"
              : isPending
                ? "border-sky-300/24 bg-sky-400/12 text-sky-200"
                : "border-rose-300/24 bg-rose-400/12 text-rose-200"
          )}
        >
          {isSuccess ? <CheckCircle2 className="h-5 w-5" /> : isPreparing ? <Loader2 className="h-5 w-5 animate-spin" /> : isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CircleAlert className="h-5 w-5" />}
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-white">{title}</div>
          <p className="mt-1 max-w-3xl text-[14px] leading-6 text-white/68">{description}</p>
          {isPreparing ? (
            <div className="mt-3 grid gap-2 text-[13px] text-white/78">
              <div>✓ Оплата подтверждена</div>
              <div>⏳ Подготавливаем AI-инфраструктуру</div>
              <div>○ Начисление AI-токенов</div>
              <div>○ AI Studio готова к работе</div>
            </div>
          ) : null}
          {isSuccess && paymentSummary?.totalTokens ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] font-medium text-white/80">
              <span className="rounded-full border border-white/[0.10] bg-white/[0.05] px-3 py-1.5">
                {paymentSummary.packageName}
              </span>
              <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-200">
                +{formatAiTokenAmount(paymentSummary.baseTokens)} токенов
              </span>
              {paymentSummary.bonusTokens > 0 ? (
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-cyan-200">
                  +{formatAiTokenAmount(paymentSummary.bonusTokens)} бонус
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[13px] font-medium text-white/72 transition-[background-color,border-color,color] duration-150 ease-out hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white"
      >
        Скрыть
      </button>
    </div>
  );
}

function ComposerBar({
  className,
  activeSection,
  prompt,
  onPromptChange,
  modelPrice,
  canGenerate,
  costLabel,
  controls,
  onGenerate,
  onAddReference,
  canAddReferences,
  referenceFiles,
  onRemoveReference,
  generationProgress,
  generationBusy,
  onOpenSettings,
  collapsed,
  onToggleCollapsed,
  disabledHint
}: {
  className?: string;
  activeSection: AiStudioSection;
  prompt: string;
  onPromptChange: (value: string) => void;
  modelPrice: number;
  canGenerate: boolean;
  costLabel: string | number;
  controls: React.ReactNode;
  onGenerate: () => void;
  canAddReferences: boolean;
  referenceFiles: AiStudioReferenceFile[];
  onAddReference: (files: FileList | File[]) => void;
  onRemoveReference: (name: string) => void;
  generationProgress: number;
  generationBusy: boolean;
  onOpenSettings: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  disabledHint?: string | null;
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const openFilePicker = () => {
    if (!canAddReferences) return;
    fileInputRef.current?.click();
  };

  const onFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      onAddReference(files);
    }
    event.target.value = "";
  };

  if (collapsed) {
    return (
      <div
        className={cn(
          "perf-fixed-layer perf-paint-contain rounded-[28px] border border-white/[0.08] bg-[#10131a]/96 p-3 shadow-[0_14px_40px_-28px_rgba(11,14,24,0.82)] backdrop-blur-[6px]",
          className
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-medium text-white/64">Панель скрыта</div>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72 transition-[background-color,border-color,transform,color] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
          >
            <ChevronUp className="h-4 w-4" />
            Показать
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "perf-fixed-layer perf-paint-contain rounded-[28px] border border-white/[0.08] bg-[#10131a]/96 p-3 shadow-[0_14px_40px_-28px_rgba(11,14,24,0.82)] backdrop-blur-[6px]",
        className
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        hidden
        multiple
        accept="image/*,audio/*"
        onChange={onFileInputChange}
      />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {controls}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72 transition-[background-color,border-color,transform,color] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
          >
            <ChevronDown className="h-4 w-4" />
            Скрыть
          </button>
        </div>
        <Textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={SECTION_PROMPTS[activeSection]}
          className="min-h-[110px] rounded-[22px] border-white/[0.10] bg-[#0f1218] text-[15px] text-white placeholder:text-white/36 focus-visible:ring-[#7b3df5]"
        />
        <div className="flex flex-wrap items-center gap-2">
          {canAddReferences ? (
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72 transition-[background-color,border-color,transform,color] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
            >
              📎 Добавить референс
            </button>
          ) : null}
          {referenceFiles.map((file) => (
            <span
              key={file.id}
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72"
            >
              <span>{file.name}</span>
              <button
                type="button"
                onClick={() => onRemoveReference(file.id)}
                className="text-white/40 transition-colors duration-150 ease-out hover:text-white motion-reduce:transition-none"
                aria-label={`Удалить ${file.name}`}
              >
                ×
              </button>
            </span>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSettings}
              className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72 transition-[background-color,border-color,transform,color] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <div className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72">
              {modelPrice || costLabel}
            </div>
            <Button
              disabled={!canGenerate || generationBusy}
              onClick={onGenerate}
              className={cn(
                "h-11 px-5 transition-[opacity,filter,box-shadow,transform] duration-150 ease-out",
                !canGenerate && !generationBusy
                  ? "cursor-not-allowed opacity-80 saturate-[0.82] shadow-none"
                  : "shadow-[0_14px_30px_-18px_rgba(123,61,245,0.75)]"
              )}
            >
              {generationBusy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Генерируется
                </>
              ) : (
                "Сгенерировать"
              )}
            </Button>
          </div>
        </div>
        {disabledHint ? (
          <div className="flex justify-end">
            <div className="rounded-full border border-amber-300/28 bg-amber-400/[0.14] px-3.5 py-1.5 text-[12px] font-semibold text-amber-50 shadow-[0_10px_24px_-18px_rgba(251,191,36,0.85)]">
              {disabledHint}
            </div>
          </div>
        ) : null}
        <div className="h-1.5 rounded-full bg-white/[0.06]">
          <div
            className="h-1.5 rounded-full bg-[linear-gradient(90deg,#7b3df5_0%,#22d3ee_100%)] transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `${generationProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarDropdown({
  label,
  onClick
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72 transition-[background-color,border-color,transform,color] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
    >
      <span>{label}</span>
      <ChevronDown className="h-3.5 w-3.5 text-white/44" />
    </button>
  );
}

function ToolbarToggle({
  label,
  checked,
  onToggle
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[13px] font-medium transition-[background-color,border-color,transform,color] duration-150 ease-out motion-reduce:transition-none",
        checked
          ? "border-[#7b3df5]/35 bg-[#7b3df5]/12 text-white"
          : "border-white/[0.10] bg-white/[0.03] text-white/72 hover:border-white/[0.16] hover:bg-white/[0.05]"
      )}
    >
      {label}
      <span className={cn("h-2.5 w-2.5 rounded-full", checked ? "bg-[#9fe9ff]" : "bg-white/25")} />
    </button>
  );
}

function SelectionPopover({
  section,
  field,
  label,
  models,
  currentModelId,
  currentParamValue,
  onChooseValue,
  onClose
}: {
  section: AiStudioSection;
  field: "model" | "mode" | "priority" | "param" | null;
  label: string | null;
  models: AiStudioModelOptionResponse[];
  currentModelId: string;
  currentParamValue: string | null;
  onChooseValue: (value: string) => void;
  onClose: () => void;
}) {
  type SelectionItem = {
    id: string;
    label: string;
    priceTokens?: number | null;
    provider?: string;
    supportsReference?: boolean;
    supportsAudio?: boolean;
    supportsVideo?: boolean;
    supportsImage?: boolean;
  };

  const content: SelectionItem[] =
    field === "model"
      ? models.map((model) => ({
          id: model.id,
          label: model.label,
          priceTokens: model.priceTokens ?? null,
          provider: model.provider,
          supportsReference: model.supportsReference,
          supportsAudio: model.supportsAudio,
          supportsVideo: model.supportsVideo,
          supportsImage: model.supportsImage
        }))
      : field === "mode"
        ? ([{ id: "Native", label: "Native" }, { id: "Priority", label: "Priority" }] satisfies SelectionItem[])
        : field === "priority"
          ? ([{ id: "Standard", label: "Standard" }, { id: "Priority", label: "Priority" }] satisfies SelectionItem[])
          : label
            ? ((MODEL_PARAM_PRESETS[section].find((item) => item.label === label)?.options ?? []).map(
                (item) => ({
                  id: item,
                  label: item,
                  priceTokens:
                    section === "video" && label === "Duration"
                      ? getAiStudioVideoDurationTokenCost(currentModelId, item)
                      : null
                })
              ) satisfies SelectionItem[])
            : [];

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="mx-auto mt-24 w-full max-w-2xl rounded-[28px] border border-white/[0.10] bg-[#131722] p-4 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.84)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/40">
              {field === "param" ? "Параметры" : label ?? (field === "model" ? "Модель" : "Параметр")}
            </div>
            <div className="mt-1 text-[18px] font-semibold text-white">
              {field === "param" ? "Настройки" : field === "model" ? "Модели" : "Опции"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72"
          >
            Закрыть
          </button>
        </div>

        <div className={cn("grid gap-2", field === "model" || field === "param" ? "sm:grid-cols-2" : "sm:grid-cols-2")}>
          {field === "model"
              ? (content as SelectionItem[]).map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => onChooseValue(model.id)}
                  className={cn(
                    "rounded-2xl border p-4 text-left transition-[background-color,border-color,transform] duration-150 ease-out motion-reduce:transition-none",
                    currentModelId === model.id
                      ? "border-[#7b3df5]/45 bg-[#171b26]"
                      : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.05]"
                  )}
                  >
                  <div className="text-[16px] font-semibold text-white">{model.label}</div>
                  <div className="mt-1 text-[13px] font-medium text-white/52">{model.provider ?? "fal"}</div>
                  <div className="mt-2 text-[13px] font-medium text-white/72">{formatTokenCost(model.priceTokens ?? 0)}</div>
                  <div className="mt-3 text-[13px] text-white/66">{getModelInputs(model)}</div>
                </button>
              ))
            : field === "param"
              ? content.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onChooseValue(item.label)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition-[background-color,border-color,transform] duration-150 ease-out motion-reduce:transition-none",
                      currentParamValue === item.label
                        ? "border-[#7b3df5]/45 bg-[#171b26]"
                        : "border-white/[0.08] bg-white/[0.03] hover:border-white/[0.14] hover:bg-white/[0.05]"
                    )}
                  >
                    <div className="text-[16px] font-semibold text-white">{item.label}</div>
                    <div className="mt-1 text-[13px] font-medium text-white/52">
                      {item.priceTokens != null ? formatTokenCost(item.priceTokens) : "Параметр генерации"}
                    </div>
                  </button>
                ))
            : content.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChooseValue(item.id)}
                  className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 text-left text-[15px] font-medium text-white transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.05] motion-reduce:transition-none"
                >
                  {item.label}
                </button>
              ))}
        </div>
      </div>
    </div>
  );
}

function TokenPurchaseModal({
  balance,
  packages,
  loading,
  error,
  onClose,
  onChoosePackage
}: {
  balance: number;
  packages: AiTokenPackageResponse[];
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onChoosePackage: (tokenPackage: AiTokenPackageResponse) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="mx-auto mt-20 w-full max-w-4xl rounded-[28px] border border-white/[0.10] bg-[#10131a]/98 p-5 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.84)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/40">
              AI-токены
            </div>
            <h3 className="mt-1 text-[24px] font-semibold text-white">Купить AI-токены</h3>
            <p className="mt-1 max-w-2xl text-[14px] text-white/58">
              Используйте токены для генерации изображений, видео, аудио и работы с AI-чатами.
            </p>
            <div className="mt-4 inline-flex rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-[14px] text-white/80">
              Ваш баланс: <span className="ml-1 font-semibold text-white">{formatAiTokenAmount(balance)} AI-токенов</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72 transition-[background-color,border-color,transform,color] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white/[0.06] motion-reduce:transition-none"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-5">
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[172px] animate-[pulse_1.6s_ease-in-out_infinite] rounded-[24px] border border-white/[0.08] bg-white/[0.03]"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-[14px] text-rose-100">
              {error}
            </div>
          ) : packages.length === 0 ? (
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-6 text-[14px] text-white/58">
              Пакеты токенов пока недоступны. Попробуйте открыть окно ещё раз через несколько секунд.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {packages.map((tokenPackage) => (
                <button
                  key={tokenPackage.code}
                  type="button"
                  onClick={() => onChoosePackage(tokenPackage)}
                  className="group rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4 text-left transition-[background-color,border-color,transform,opacity] duration-150 ease-out hover:-translate-y-0.5 hover:scale-[1.01] hover:border-white/[0.14] hover:bg-white/[0.05] motion-reduce:transition-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[16px] font-semibold text-white">{tokenPackage.name}</div>
                      <div className="mt-1 text-[13px] text-white/55">{formatAiTokenAmount(tokenPackage.tokenAmount)} токенов</div>
                      {tokenPackage.bonusTokens > 0 ? (
                        <div className="mt-1 text-[12px] font-medium text-emerald-300">
                          🎁 +{formatAiTokenAmount(tokenPackage.bonusTokens)} бонусных токенов
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-full border border-white/[0.08] bg-black/20 px-3 py-1 text-[12px] text-white/70">
                      {formatRubCurrency(tokenPackage.priceRub)}
                    </div>
                  </div>
                  <div className="mt-4 text-[13px] text-white/52">
                    Доступно для генерации изображений, видео, аудио и AI-чатов.
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#7b3df5] px-4 py-2 text-[13px] font-semibold text-white transition-[background-color,transform] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:bg-[#8b4ff7] motion-reduce:transition-none">
                    Купить
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PurchaseConfirmModal({
  packageName,
  packageTokens,
  packageBonusTokens,
  packagePriceRub,
  busy,
  onCancel,
  onConfirm
}: {
  packageName: string;
  packageTokens: number;
  packageBonusTokens: number;
  packagePriceRub: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/66 p-4 backdrop-blur-[4px]">
      <div className="w-full max-w-md rounded-[24px] border border-white/[0.10] bg-[#10131a] p-5 shadow-[0_16px_42px_-28px_rgba(0,0,0,0.82)]">
        <div className="flex items-center gap-2 text-white">
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          <h4 className="text-[18px] font-semibold">Подтвердить покупку?</h4>
        </div>
        <p className="mt-3 text-[14px] text-white/60">
          {packageName} · {formatAiTokenAmount(packageTokens + packageBonusTokens)} токенов ·{" "}
          {formatRubCurrency(packagePriceRub)}
        </p>
        {packageBonusTokens > 0 ? (
          <p className="mt-1 text-[13px] text-emerald-200/90">
            Бонус: +{formatAiTokenAmount(packageBonusTokens)} токенов
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-white/[0.12] bg-white/[0.03] px-4 py-2 text-[14px] text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:bg-white/[0.06] motion-reduce:transition-none"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-[#7b3df5] px-4 py-2 text-[14px] font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:bg-[#8b4ff7] disabled:opacity-50 motion-reduce:transition-none"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  );
}

function FloatingToast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-5 right-5 z-[70] rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[13px] font-medium text-emerald-50 shadow-[0_18px_36px_-24px_rgba(16,185,129,0.55)]">
      {message}
    </div>
  );
}

function AiStudioSidebar({
  activeTab,
  chatThreads,
  activeChatThreadId,
  onNewChat,
  onSelectChatThread
}: {
  activeTab: AiStudioWorkspaceTab;
  chatThreads: AiStudioChatThreadResponse[];
  activeChatThreadId: string | null;
  onNewChat: () => void;
  onSelectChatThread: (threadId: string) => void;
}) {
  return (
    <aside className="perf-paint-contain h-fit rounded-[28px] border border-white/[0.08] bg-[#10131a]/96 p-4 shadow-[0_14px_40px_-30px_rgba(11,14,24,0.82)] xl:sticky xl:top-4">
      <div className="mb-5 rounded-[24px] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
        <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/38">AI Studio</div>
        <div className="mt-1 text-[18px] font-semibold text-white">Инструменты</div>
        <div className="mt-1 text-[13px] text-white/50">Чаты, изображения, видео, аудио и архив.</div>
      </div>

      <div className="space-y-2">
        {WORKSPACE_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/dashboard/ai-studio/${tab.id}`}
              className={cn(
                "flex items-center gap-3 rounded-[20px] border px-4 py-3 transition-[background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
                isActive
                  ? "border-[#7b3df5]/35 bg-[#171b26] text-white shadow-[0_18px_32px_-24px_rgba(123,61,245,0.34)]"
                  : "border-white/[0.08] bg-white/[0.03] text-white/72 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.05]"
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-xl border transition-colors duration-200",
                  isActive ? "border-[#7b3df5]/35 bg-[#7b3df5]/12 text-[#c7b2ff]" : "border-white/[0.08] bg-black/20 text-white/60"
                )}
              >
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-[14px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {activeTab === "chat" ? (
        <div className="mt-5 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/38">Диалоги</div>
              <div className="mt-1 text-[14px] font-medium text-white/72">История чатов</div>
            </div>
            <button
              type="button"
              onClick={onNewChat}
              className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[12px] font-medium text-white/72 transition-[background-color,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
            >
              Новый чат
            </button>
          </div>
          <div className="space-y-2">
            {chatThreads.length > 0 ? (
              chatThreads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onSelectChatThread(thread.id)}
                  className={cn(
                    "w-full rounded-[18px] border p-3 text-left transition-[background-color,border-color,transform] duration-200 ease-out motion-reduce:transition-none",
                    activeChatThreadId === thread.id
                      ? "border-[#7b3df5]/35 bg-[#171b26]"
                      : "border-white/[0.08] bg-black/15 hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.05]"
                  )}
                >
                  <div className="text-[13px] font-medium text-white line-clamp-2">{thread.title}</div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/44">
                    <span>{thread.modelCode}</span>
                    <span>{thread.lastMessageAt ? formatDate(thread.lastMessageAt) : formatDate(thread.createdAt)}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-[18px] border border-dashed border-white/[0.08] bg-black/10 px-3 py-4 text-[12px] leading-5 text-white/46">
                Здесь появится история диалогов. Создайте новый чат, чтобы начать общение.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function ChatWorkspace({
  title,
  modelLabel,
  modelPrice,
  aiTokenBalance,
  onOpenModelSelector,
  messages,
  prompt,
  onPromptChange,
  onSend,
  sending,
  canSend,
  progress,
  onNewChat,
  disabledHint
}: {
  title: string;
  modelLabel: string;
  modelPrice: number;
  aiTokenBalance: number;
  onOpenModelSelector: () => void;
  messages: AiStudioChatMessageResponse[];
  prompt: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  canSend: boolean;
  progress: number;
  onNewChat: () => void;
  disabledHint?: string | null;
}) {
  return (
    <section className="perf-content-auto perf-paint-contain flex min-h-[calc(100vh-260px)] flex-col rounded-[28px] border border-white/[0.08] bg-[#10131a]/96 shadow-[0_14px_40px_-30px_rgba(11,14,24,0.82)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/38">Чаты</div>
          <h2 className="mt-1 text-[20px] font-semibold text-white">{title}</h2>
          <p className="mt-1 text-[13px] text-white/52">GPT-подобный диалог с отдельной историей.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarDropdown label={modelLabel} onClick={onOpenModelSelector} />
          <div className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72">
            {formatAiTokenAmount(aiTokenBalance)} AI
          </div>
          <button
            type="button"
            onClick={onNewChat}
            className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-white/72 transition-[background-color,border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
          >
            Новый чат
          </button>
        </div>
      </div>

      <div className="perf-scroll-shell flex-1 overflow-y-auto px-5 py-5">
        {messages.length > 0 ? (
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[82%] rounded-[24px] border px-4 py-3 text-[14px] leading-6 shadow-[0_20px_50px_-38px_rgba(0,0,0,0.85)]",
                    message.role === "user"
                      ? "border-[#7b3df5]/25 bg-[#7b3df5]/14 text-white"
                      : "border-white/[0.08] bg-white/[0.04] text-white/88"
                  )}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-[24px] border border-dashed border-white/[0.08] bg-white/[0.02] px-6 text-center">
            <div className="max-w-lg space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/60">
                <Bot className="h-6 w-6" />
              </div>
              <div className="text-[18px] font-semibold text-white">Начните новый диалог</div>
              <p className="text-[14px] leading-6 text-white/54">
                Это отдельный GPT-подобный чат внутри AI Studio. Здесь нет генерации изображений, видео или аудио.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.08] p-4">
        <div className="space-y-3 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[13px] font-medium text-white/54">Выбранная модель: {modelLabel}</div>
            <div className="text-[13px] text-white/54">
              Стоимость: <span className="font-semibold text-white">{modelPrice} токенов</span>
            </div>
          </div>
          <Textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Напишите сообщение..."
            className="min-h-[120px] rounded-[22px] border-white/[0.10] bg-[#0f1218] text-[15px] text-white placeholder:text-white/36 focus-visible:ring-[#7b3df5]"
          />
          <div className="flex items-center justify-between gap-3">
            <div className="text-[12px] text-white/42">
              Enter для отправки, Shift+Enter для новой строки.
            </div>
            <Button
              disabled={!canSend || sending}
              onClick={onSend}
              className={cn(
                "h-11 px-5 transition-[opacity,filter,box-shadow,transform] duration-150 ease-out",
                !canSend && !sending
                  ? "cursor-not-allowed opacity-80 saturate-[0.82] shadow-none"
                  : "shadow-[0_14px_30px_-18px_rgba(123,61,245,0.75)]"
              )}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Отправляем
                </>
              ) : (
                "Отправить"
              )}
            </Button>
          </div>
          {disabledHint ? (
            <div className="flex justify-end">
              <div className="rounded-full border border-amber-300/28 bg-amber-400/[0.14] px-3.5 py-1.5 text-[12px] font-semibold text-amber-50 shadow-[0_10px_24px_-18px_rgba(251,191,36,0.85)]">
                {disabledHint}
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/[0.06]">
          <div
            className="h-1.5 rounded-full bg-[linear-gradient(90deg,#7b3df5_0%,#22d3ee_100%)] transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function MediaWorkspace({
  conversation,
  modelLabelLookup
}: {
  conversation: AiStudioMediaConversationItem[];
  modelLabelLookup: Map<string, string>;
}) {
  return (
    <div className="space-y-5">
      {conversation.map((item) => (
        <div key={item.id} className="space-y-3">
          <div className="flex justify-end">
            <div className="max-w-[82%] rounded-[24px] border border-[#7b3df5]/25 bg-[#7b3df5]/14 px-4 py-3 text-[14px] leading-6 text-white shadow-[0_20px_50px_-38px_rgba(0,0,0,0.85)]">
              {item.prompt}
            </div>
          </div>

          <div className="flex justify-start">
            <div className="w-full max-w-5xl">
              {item.status === "ready" ? (
                <MediaConversationResult
                  item={{
                    ...item,
                    modelCode: getModelDisplayName(item.modelCode, modelLabelLookup)
                  }}
                />
              ) : (
                <div className="grid min-h-[320px] place-items-center rounded-[24px] border border-dashed border-white/[0.08] bg-white/[0.03] p-8 shadow-[0_20px_50px_-38px_rgba(0,0,0,0.85)]">
                  <div className="flex flex-col items-center gap-3 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-white/70" />
                    <div className="text-[16px] font-medium text-white/80">Генерируем ответ</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function getResultPreviewKind(
  resultUrl: string | null,
  section?: AiStudioSection | string | null
): "image" | "audio" | "video" | "html" | "text" | "unknown" {
  if (!resultUrl) return "unknown";
  if (resultUrl.startsWith("data:image/")) return "image";
  if (resultUrl.startsWith("data:audio/")) return "audio";
  if (resultUrl.startsWith("data:video/")) return "video";
  if (resultUrl.startsWith("data:text/html")) return "html";
  if (resultUrl.startsWith("data:text/plain")) return "text";
  const normalized = resultUrl.toLowerCase();
  if (/\.(png|jpe?g|webp|gif|avif|svg)(?:\?|#|$)/u.test(normalized)) return "image";
  if (/\.(mp3|wav|ogg|m4a|flac|aac)(?:\?|#|$)/u.test(normalized)) return "audio";
  if (/\.(mp4|webm|mov|m4v)(?:\?|#|$)/u.test(normalized)) return "video";
  if (section === "image") return "image";
  if (section === "audio") return "audio";
  if (section === "video") return "video";
  return "unknown";
}

function decodeDataTextUrl(resultUrl: string | null): string {
  if (!resultUrl || !resultUrl.startsWith("data:text/plain")) return "";
  const commaIndex = resultUrl.indexOf(",");
  if (commaIndex < 0) return "";
  return decodeURIComponent(resultUrl.slice(commaIndex + 1));
}

function getResultDownloadName(generation: { modelCode: string; section: string }, resultUrl: string | null): string {
  const kind = getResultPreviewKind(resultUrl, generation.section);
  const extension =
    kind === "image"
      ? "png"
      : kind === "audio"
        ? "wav"
        : kind === "video"
          ? "mp4"
          : kind === "html"
            ? "html"
            : kind === "text"
              ? "txt"
              : "bin";
  return `${generation.modelCode}-${generation.section}.${extension}`;
}

function MediaConversationResult({ item }: { item: AiStudioMediaConversationItem }) {
  const kind = getResultPreviewKind(item.resultUrl, item.section);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-black/20 shadow-[0_20px_50px_-38px_rgba(0,0,0,0.85)]">
        {kind === "image" ? (
          <img src={item.resultUrl ?? undefined} alt={item.prompt} className="h-full w-full object-cover" />
        ) : kind === "audio" ? (
          <div className="flex min-h-[180px] items-center justify-center p-6">
            <audio controls src={item.resultUrl ?? undefined} className="w-full" />
          </div>
        ) : kind === "video" || kind === "html" ? (
          <video
            controls
            playsInline
            src={item.resultUrl ?? undefined}
            className="h-full max-h-[72vh] w-full bg-black object-contain"
          />
        ) : kind === "text" ? (
          <div className="p-4">
            <pre className="whitespace-pre-wrap rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4 text-[14px] leading-6 text-white/82">
              {decodeDataTextUrl(item.resultUrl)}
            </pre>
          </div>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center p-8 text-white/70">Предпросмотр недоступен</div>
        )}
      </div>

      {item.resultUrl ? (
        <div className="flex flex-wrap gap-2">
          <a
            href={item.resultUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
          >
            Открыть
          </a>
          <a
            href={item.resultUrl}
            download={getResultDownloadName({ modelCode: item.modelCode, section: item.section }, item.resultUrl)}
            className="rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
          >
            Скачать
          </a>
        </div>
      ) : null}
    </div>
  );
}

function GenerationPreviewCard({
  generation,
  compact = false
}: {
  generation: AiStudioPreviewGeneration;
  compact?: boolean;
}) {
  const kind = getResultPreviewKind(generation.resultUrl, generation.section);

  if (compact) {
    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-black/20 shadow-[0_20px_50px_-38px_rgba(0,0,0,0.85)]">
          {kind === "image" ? (
            <img src={generation.resultUrl ?? undefined} alt={generation.prompt} className="h-full w-full object-cover" />
          ) : kind === "audio" ? (
            <div className="flex min-h-[180px] items-center justify-center p-6">
              <audio controls src={generation.resultUrl ?? undefined} className="w-full" />
            </div>
          ) : kind === "video" ? (
            <video
              controls
              playsInline
              src={generation.resultUrl ?? undefined}
              className="h-full max-h-[72vh] w-full bg-black object-contain"
            />
          ) : kind === "html" ? (
            <iframe
              src={generation.resultUrl ?? undefined}
              className="h-[420px] w-full border-0"
              title={generation.prompt}
            />
          ) : kind === "text" ? (
            <div className="p-4">
              <pre className="whitespace-pre-wrap rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4 text-[14px] leading-6 text-white/82">
                {decodeDataTextUrl(generation.resultUrl)}
              </pre>
            </div>
          ) : (
            <div className="flex min-h-[220px] items-center justify-center p-8 text-white/70">
              Предпросмотр недоступен
            </div>
          )}
        </div>

        {generation.resultUrl ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={generation.resultUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
            >
              Открыть
            </a>
            <a
              href={generation.resultUrl}
              download={getResultDownloadName(generation, generation.resultUrl)}
              className="rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
            >
              Скачать
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
      <div className="overflow-hidden rounded-[24px] border border-white/[0.08] bg-black/20">
        {kind === "image" ? (
          <img src={generation.resultUrl ?? undefined} alt={generation.prompt} className="h-full w-full object-cover" />
        ) : kind === "audio" ? (
          <div className="flex min-h-[420px] items-center justify-center p-8">
            <audio controls src={generation.resultUrl ?? undefined} className="w-full max-w-xl" />
          </div>
        ) : kind === "video" ? (
          <video
            controls
            playsInline
            src={generation.resultUrl ?? undefined}
            className="h-[520px] w-full bg-black object-contain"
          />
        ) : kind === "html" ? (
          <iframe
            src={generation.resultUrl ?? undefined}
            className="h-[520px] w-full border-0"
            title={`${generation.modelCode} preview`}
          />
        ) : kind === "text" ? (
          <div className="min-h-[420px] p-5">
            <pre className="whitespace-pre-wrap rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4 text-[14px] leading-6 text-white/82">
              {decodeDataTextUrl(generation.resultUrl)}
            </pre>
          </div>
        ) : (
          <div className="flex min-h-[420px] items-center justify-center p-8 text-white/70">
            Предпросмотр недоступен
          </div>
        )}
      </div>
      <div className="space-y-4 rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-5">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/40">Результат</div>
          <div className="mt-2 text-[22px] font-semibold text-white">{generation.modelCode}</div>
          <p className="mt-2 text-[14px] leading-6 text-white/62">{generation.prompt}</p>
        </div>
        <div className="grid gap-2 text-[13px] text-white/56">
          <div>Статус: готово</div>
          <div>Дата: {formatDate(generation.createdAt)}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {generation.resultUrl ? (
            <>
              <a
                href={generation.resultUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
              >
                Открыть
              </a>
              <a
                href={generation.resultUrl}
                download={getResultDownloadName(generation, generation.resultUrl)}
                className="rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05] motion-reduce:transition-none"
              >
                Скачать
              </a>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function UploadsSection({
  uploads,
  onDeleteUpload
}: {
  uploads: AiStudioUploadItem[];
  onDeleteUpload: (uploadId: string) => void;
}) {
  if (uploads.length === 0) {
    return (
      <DashboardEmptyState
        title="Загрузок пока нет"
        description="Изображения, аудио и видео-референсы появятся здесь после первой загрузки в AI Studio."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {uploads.map((upload) => (
        <Card key={upload.id} className="overflow-hidden p-0">
          <div className="flex aspect-[16/9] items-center justify-center bg-[linear-gradient(135deg,rgba(123,61,245,0.14),rgba(34,211,238,0.08))]">
            {upload.url && upload.mimeType.startsWith("image/") ? (
              <img src={upload.url} alt={upload.fileName} className="h-full w-full object-cover" />
            ) : upload.url && upload.mimeType.startsWith("audio/") ? (
              <div className="w-full px-5">
                <audio controls src={upload.url} className="w-full" />
              </div>
            ) : upload.url && upload.mimeType.startsWith("video/") ? (
              <video controls playsInline src={upload.url} className="h-full w-full bg-black object-contain" />
            ) : upload.section === "image" ? (
              <ImagePlus className="h-10 w-10 text-white/70" />
            ) : upload.section === "video" ? (
              <PlayCircle className="h-10 w-10 text-white/70" />
            ) : (
              <AudioLines className="h-10 w-10 text-white/70" />
            )}
          </div>
          <CardContent className="space-y-4 p-5">
            <div>
              <div className="text-[16px] font-semibold text-white">{upload.fileName}</div>
              <div className="mt-1 text-[13px] font-medium text-white/52">
                {upload.section} · {formatSize(upload.sizeBytes)}
              </div>
            </div>
            <div className="flex items-center justify-between text-[13px] font-medium text-white/50">
              <span>{formatDate(upload.createdAt)}</span>
              <button
                type="button"
                onClick={() => onDeleteUpload(upload.id)}
                className="rounded-full border border-white/[0.10] bg-white/[0.03] px-3 py-1.5 text-white/70 transition-[background-color,border-color,color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:text-white motion-reduce:transition-none"
              >
                Удалить
              </button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ArchiveSection({ history }: { history: AiStudioHistoryItem[] }) {
  if (history.length === 0) {
    return (
      <DashboardEmptyState
        title="Архив генераций пуст"
        description="Когда появятся первые изображения, видео, аудио или чаты, они автоматически будут сохранены в архиве."
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {history.map((item) => (
        <Card key={item.id} className="p-0">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {item.section}
                </div>
                <div className="mt-1 text-[18px] font-semibold text-white">{item.modelCode}</div>
              </div>
              <Badge variant={item.status === "completed" ? "success" : "muted"}>
                {item.status === "completed" ? "Успешно" : item.status}
              </Badge>
            </div>
            {item.resultUrl ? (
              <div className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-black/20">
              {getResultPreviewKind(item.resultUrl, item.section) === "image" ? (
                  <img src={item.resultUrl} alt={item.prompt} className="aspect-[16/10] w-full object-cover" />
                ) : getResultPreviewKind(item.resultUrl, item.section) === "audio" ? (
                  <div className="p-4">
                    <audio controls src={item.resultUrl} className="w-full" />
                  </div>
                ) : getResultPreviewKind(item.resultUrl, item.section) === "video" ? (
                  <video controls playsInline src={item.resultUrl} className="aspect-[16/10] w-full bg-black object-contain" />
                ) : getResultPreviewKind(item.resultUrl, item.section) === "html" ? (
                  <iframe src={item.resultUrl} className="aspect-[16/10] w-full border-0" title={item.modelCode} />
                ) : getResultPreviewKind(item.resultUrl, item.section) === "text" ? (
                  <div className="p-4">
                    <pre className="line-clamp-8 whitespace-pre-wrap rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-4 text-[13px] leading-6 text-white/78">
                      {decodeDataTextUrl(item.resultUrl)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="grid gap-2 text-[14px] font-medium text-white/66">
              <div>{item.costTokens} токенов</div>
              <div>{formatDate(item.createdAt)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {item.resultUrl ? (
                <a
                  href={item.resultUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05]"
                >
                  Открыть
                </a>
              ) : null}
              {item.resultUrl ? (
                <a
                  href={item.resultUrl}
                  download={getResultDownloadName({ modelCode: item.modelCode, section: item.section }, item.resultUrl)}
                  className="inline-flex items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05]"
                >
                  Скачать
                </a>
              ) : null}
              <Link
                href={`/dashboard/ai-studio/${item.section}?repeat=${item.id}`}
                className="inline-flex items-center justify-center rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[13px] font-medium text-white/80 transition-[background-color,border-color,transform] duration-150 ease-out hover:-translate-y-0.5 hover:border-white/[0.16] hover:bg-white/[0.05]"
              >
                Повторить
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
