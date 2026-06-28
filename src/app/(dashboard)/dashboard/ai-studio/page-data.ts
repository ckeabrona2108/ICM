import { prisma } from "@/lib/prisma";
import { getAiStudioEntitlements, hasAiStudioAccess, type AiStudioSection } from "@/lib/ai-studio";
import {
  getAiPendingTokenBalance,
  getAiStudioSystemStatus,
  listAiStudioNotifications
} from "@/lib/ai-studio-activation";
import { getAiStudioModelCatalog } from "@/lib/ai-studio-model-service";
import { getAiChatThread, listAiChatThreads } from "@/lib/ai-chat-service";
import { hasUserAiTokenBalanceColumn } from "@/lib/ai-token-balance-column";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { resolveStoredFileUrl } from "@/lib/s3";
import { getAiTokenBalance } from "@/lib/ai-token-service";

export type AiStudioWorkspaceTab =
  | AiStudioSection
  | "uploads"
  | "archive";

export const AI_STUDIO_WORKSPACE_TABS: AiStudioWorkspaceTab[] = [
  "chat",
  "image",
  "video",
  "audio",
  "uploads",
  "archive"
];

export function isAiStudioWorkspaceTab(value: string): value is AiStudioWorkspaceTab {
  return AI_STUDIO_WORKSPACE_TABS.includes(value as AiStudioWorkspaceTab);
}

const AI_STUDIO_HISTORY_TTL_DAYS = 30;

async function safeFindMany<T>(
  query: () => Promise<T[]>,
  tableNames: string[]
): Promise<T[]> {
  try {
    return await query();
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, tableNames)) {
      return [];
    }
    throw error;
  }
}

function hasPrismaDelegate(client: typeof prisma, delegateName: string, methodName: string): boolean {
  const db = client as typeof prisma & Record<string, unknown>;
  const delegate = db[delegateName] as Record<string, unknown> | undefined;
  return Boolean(delegate && typeof delegate[methodName] === "function");
}

async function safeDeleteMany(
  query: () => Promise<{ count: number }>,
  tableNames: string[]
): Promise<void> {
  try {
    await query();
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, tableNames)) {
      return;
    }
    throw error;
  }
}

export async function getAiStudioPageData(
  userId: string,
  activeTab: AiStudioWorkspaceTab,
  requestedChatThreadId?: string | null
) {
  const hasAiTokenBalanceColumn = await hasUserAiTokenBalanceColumn(prisma);
  const archiveCutoff = new Date(Date.now() - AI_STUDIO_HISTORY_TTL_DAYS * 24 * 60 * 60 * 1000);

  if (activeTab === "archive") {
    await safeDeleteMany(
      () =>
        prisma.ai_generations.deleteMany({
          where: {
            user_id: userId,
            created_at: {
              lt: archiveCutoff
            }
          }
        }),
      ["ai_generations"]
    );
  }

  const shouldLoadArchive = activeTab === "archive";
  const shouldLoadUploads = activeTab === "uploads";
  const shouldLoadChats = activeTab === "chat";

  const [user, history, uploads, modelCatalog, chatThreads] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: hasAiTokenBalanceColumn
        ? {
            name: true,
            isSubscribed: true,
            subscribeLevel: true,
            expiresAt: true,
            balance: true,
            aiTokenBalance: true
          }
        : {
            name: true,
            isSubscribed: true,
            subscribeLevel: true,
            expiresAt: true,
            balance: true
          }
    }),
    safeFindMany(
      () =>
        shouldLoadArchive && hasPrismaDelegate(prisma, "ai_generations", "findMany")
          ? prisma.ai_generations.findMany({
              where: {
                user_id: userId,
                created_at: {
                  gte: archiveCutoff
                }
              },
              orderBy: { created_at: "desc" },
              take: 12,
              select: {
                id: true,
                created_at: true,
                section: true,
                model_code: true,
                prompt: true,
                status: true,
                cost_tokens: true,
                result_url: true
              }
            })
          : Promise.resolve([]),
      ["ai_generations"]
    ),
    safeFindMany(
      () =>
        shouldLoadUploads && hasPrismaDelegate(prisma, "ai_uploads", "findMany")
          ? prisma.ai_uploads.findMany({
              where: { user_id: userId },
              orderBy: { created_at: "desc" },
              take: 12,
              select: {
                id: true,
                created_at: true,
                file_name: true,
                storage_key: true,
                mime_type: true,
                size_bytes: true,
                section: true
              }
            })
          : Promise.resolve([]),
      ["ai_uploads"]
    ),
    getAiStudioModelCatalog(),
    shouldLoadChats ? listAiChatThreads(prisma, userId) : Promise.resolve([])
  ]);

  const activeChatThreadId =
    shouldLoadChats && requestedChatThreadId === "new"
      ? null
      : shouldLoadChats
        ? requestedChatThreadId ?? null
        : null;
  const activeChatThread =
    shouldLoadChats && activeChatThreadId !== null ? await getAiChatThread(prisma, userId, activeChatThreadId) : null;

  if (!user) return null;

  const accessInput = {
    isSubscribed: user.isSubscribed,
    subscribeLevel: user.subscribeLevel,
    expiresAt: user.expiresAt
  };
  const entitlements = getAiStudioEntitlements(accessInput);
  const aiTokenBalance = hasAiTokenBalanceColumn
    ? Number(("aiTokenBalance" in user ? user.aiTokenBalance : 0) ?? 0)
    : await getAiTokenBalance(prisma, userId);
  const [aiStudioStatus, pendingAiTokenBalance, notifications] = await Promise.all([
    getAiStudioSystemStatus(prisma),
    getAiPendingTokenBalance(prisma, userId),
    listAiStudioNotifications(prisma, userId)
  ]);

  return {
    userName: user.name,
    hasAccess: hasAiStudioAccess(accessInput),
    aiStudioStatus,
    aiTokenBalance,
    pendingAiTokenBalance,
    royaltyBalance: user.balance,
    entitlements,
    initialModelCatalog: modelCatalog,
    chatThreads,
    activeChatThreadId,
    activeChatThread,
    history: history.map((item) => ({
      id: item.id,
      createdAt: item.created_at.toISOString(),
      section: item.section,
      modelCode: item.model_code,
      prompt: item.prompt,
      status: item.status,
      costTokens: item.cost_tokens,
      resultUrl: item.result_url
    })),
    uploads: uploads.map((item) => ({
      id: item.id,
      createdAt: item.created_at.toISOString(),
      fileName: item.file_name,
      storageKey: item.storage_key,
      url: resolveStoredFileUrl({ storageKey: item.storage_key }),
      mimeType: item.mime_type,
      sizeBytes: item.size_bytes,
      section: item.section
    })),
    notifications
  };
}
