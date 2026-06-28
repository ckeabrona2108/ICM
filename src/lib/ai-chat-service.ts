import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { getAiStudioModelCatalog } from "@/lib/ai-studio-model-service";
import { buildChatAssistantText } from "@/lib/ai-generation-service";
import { spendAiTokensForChat } from "@/lib/ai-token-service";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";

export type AiChatRole = "user" | "assistant";

export interface AiChatMessageRecord {
  id: string;
  threadId: string;
  role: AiChatRole;
  content: string;
  modelCode: string | null;
  createdAt: string;
}

export interface AiChatThreadRecord {
  id: string;
  title: string;
  modelCode: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
  lastMessagePreview: string | null;
}

export interface AiChatThreadPayload extends AiChatThreadRecord {
  messages: AiChatMessageRecord[];
}

export interface AiChatSendSuccess {
  ok: true;
  newBalance: number;
  transactionId: string;
  thread: AiChatThreadRecord;
  userMessage: AiChatMessageRecord;
  assistantMessage: AiChatMessageRecord;
}

export interface AiChatSendFailure {
  ok: false;
  error: string;
}

type AiChatBootstrapClient = Pick<PrismaClient, "$executeRawUnsafe">;
type AiChatQueryClient = Pick<PrismaClient, "$queryRaw" | "$queryRawUnsafe" | "$executeRaw" | "$executeRawUnsafe">;

type AiChatThreadRow = {
  id: string;
  title: string;
  model_code: string;
  created_at: Date;
  updated_at: Date;
  last_message_at: Date | null;
  message_count?: number;
  last_message_preview?: string | null;
};

type AiChatMessageRow = {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  model_code: string | null;
  created_at: Date;
};

function hasChatDelegates(prisma: PrismaClient) {
  const db = prisma as PrismaClient & Record<string, unknown>;
  return Boolean(db.ai_chat_threads && db.ai_chat_messages);
}

async function ensureAiChatStorageSchema(prisma: AiChatBootstrapClient): Promise<void> {
  if (typeof prisma.$executeRawUnsafe !== "function") {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "icecream"."ai_chat_threads" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL,
      "title" TEXT NOT NULL,
      "model_code" TEXT NOT NULL,
      "last_message_at" TIMESTAMP(6),
      "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_chat_threads_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ai_chat_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "icecream"."ai_chat_messages" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "thread_id" UUID NOT NULL,
      "user_id" UUID NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "model_code" TEXT,
      "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ai_chat_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "icecream"."ai_chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ai_chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ai_chat_threads_user_id_updated_at_idx"
    ON "icecream"."ai_chat_threads"("user_id", "updated_at")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ai_chat_threads_user_id_last_message_at_idx"
    ON "icecream"."ai_chat_threads"("user_id", "last_message_at")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ai_chat_messages_thread_id_created_at_idx"
    ON "icecream"."ai_chat_messages"("thread_id", "created_at")
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ai_chat_messages_user_id_created_at_idx"
    ON "icecream"."ai_chat_messages"("user_id", "created_at")
  `);
}

async function rawListAiChatThreads(prisma: AiChatQueryClient, userId: string): Promise<AiChatThreadRecord[]> {
  const rows = await prisma.$queryRaw<AiChatThreadRow[]>(Prisma.sql`
    SELECT
      t.id,
      t.title,
      t.model_code,
      t.created_at,
      t.updated_at,
      t.last_message_at,
      COUNT(m.id)::int AS message_count,
      (
        SELECT m2.content
        FROM "icecream"."ai_chat_messages" m2
        WHERE m2.thread_id = t.id
        ORDER BY m2.created_at DESC
        LIMIT 1
      ) AS last_message_preview
    FROM "icecream"."ai_chat_threads" t
    LEFT JOIN "icecream"."ai_chat_messages" m ON m.thread_id = t.id
    WHERE t.user_id = CAST(${userId} AS uuid)
    GROUP BY t.id
    ORDER BY t.updated_at DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    modelCode: row.model_code,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastMessageAt: row.last_message_at?.toISOString() ?? null,
    messageCount: row.message_count ?? 0,
    lastMessagePreview: row.last_message_preview ?? null
  }));
}

async function rawGetAiChatThread(
  prisma: AiChatQueryClient,
  userId: string,
  threadId: string
): Promise<AiChatThreadPayload | null> {
  const threadRows = await prisma.$queryRaw<AiChatThreadRow[]>(Prisma.sql`
    SELECT
      id,
      title,
      model_code,
      created_at,
      updated_at,
      last_message_at
    FROM "icecream"."ai_chat_threads"
    WHERE id = CAST(${threadId} AS uuid) AND user_id = CAST(${userId} AS uuid)
    LIMIT 1
  `);

  const thread = threadRows[0];
  if (!thread) return null;

  const messageRows = await prisma.$queryRaw<AiChatMessageRow[]>(Prisma.sql`
    SELECT
      id,
      thread_id,
      role,
      content,
      model_code,
      created_at
    FROM "icecream"."ai_chat_messages"
    WHERE thread_id = CAST(${threadId} AS uuid) AND user_id = CAST(${userId} AS uuid)
    ORDER BY created_at ASC
  `);

  return {
    id: thread.id,
    title: thread.title,
    modelCode: thread.model_code,
    createdAt: thread.created_at.toISOString(),
    updatedAt: thread.updated_at.toISOString(),
    lastMessageAt: thread.last_message_at?.toISOString() ?? null,
    messageCount: messageRows.length,
    lastMessagePreview: messageRows.at(-1)?.content?.slice(0, 120) ?? null,
    messages: messageRows.map((row) => ({
      id: row.id,
      threadId: row.thread_id,
      role: row.role as AiChatRole,
      content: row.content,
      modelCode: row.model_code,
      createdAt: row.created_at.toISOString()
    }))
  };
}

function isChatStorageError(error: unknown): boolean {
  return isAnyPrismaTableMissingError(error, ["ai_chat_threads", "ai_chat_messages"]);
}

function normalizeChatTitle(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  if (!cleaned) return "Новый чат";
  return cleaned.length > 42 ? `${cleaned.slice(0, 42).trimEnd()}…` : cleaned;
}

function toThreadRecord(row: {
  id: string;
  title: string;
  model_code: string;
  created_at: Date;
  updated_at: Date;
  last_message_at: Date | null;
  _count?: { messages: number };
  messages?: Array<{ content: string; role: string; created_at: Date }>;
}): AiChatThreadRecord {
  const lastMessage = row.messages?.at(0) ?? null;
  return {
    id: row.id,
    title: row.title,
    modelCode: row.model_code,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastMessageAt: row.last_message_at?.toISOString() ?? null,
    messageCount: row._count?.messages ?? row.messages?.length ?? 0,
    lastMessagePreview: lastMessage ? lastMessage.content.slice(0, 120) : null
  };
}

function toMessageRecord(row: {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  model_code: string | null;
  created_at: Date;
}): AiChatMessageRecord {
  return {
    id: row.id,
    threadId: row.thread_id,
    role: row.role as AiChatRole,
    content: row.content,
    modelCode: row.model_code,
    createdAt: row.created_at.toISOString()
  };
}

async function getChatModelMeta(prisma: PrismaClient, modelCode: string) {
  const catalog = await getAiStudioModelCatalog();
  const models = catalog.sections.chat;
  const selected = models.find((item) => item.id === modelCode) ?? models[0] ?? null;
  return selected ?? null;
}

export async function listAiChatThreads(
  prisma: PrismaClient,
  userId: string
): Promise<AiChatThreadRecord[]> {
  try {
    await ensureAiChatStorageSchema(prisma);
    if (!hasChatDelegates(prisma)) {
      return await rawListAiChatThreads(prisma as PrismaClient & AiChatQueryClient, userId);
    }

    const rows = await (prisma as PrismaClient & Record<string, unknown>).ai_chat_threads.findMany({
      where: { user_id: userId },
      orderBy: [{ updated_at: "desc" }],
      select: {
        id: true,
        title: true,
        model_code: true,
        created_at: true,
        updated_at: true,
        last_message_at: true,
        _count: {
          select: {
            messages: true
          }
        },
        messages: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            content: true,
            role: true,
            created_at: true
          }
        }
      }
    });

    return rows.map(toThreadRecord);
  } catch (error) {
    if (isChatStorageError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getAiChatThread(
  prisma: PrismaClient,
  userId: string,
  threadId: string
): Promise<AiChatThreadPayload | null> {
  try {
    await ensureAiChatStorageSchema(prisma);
    if (!hasChatDelegates(prisma)) {
      return await rawGetAiChatThread(prisma as PrismaClient & AiChatQueryClient, userId, threadId);
    }

    const row = await (prisma as PrismaClient & Record<string, unknown>).ai_chat_threads.findFirst({
      where: { id: threadId, user_id: userId },
      select: {
        id: true,
        title: true,
        model_code: true,
        created_at: true,
        updated_at: true,
        last_message_at: true,
        _count: {
          select: {
            messages: true
          }
        },
        messages: {
          orderBy: { created_at: "asc" },
          select: {
            id: true,
            thread_id: true,
            role: true,
            content: true,
            model_code: true,
            created_at: true
          }
        }
      }
    });

    if (!row) return null;

    return {
      ...toThreadRecord(row),
      messages: row.messages.map(toMessageRecord)
    };
  } catch (error) {
    if (isChatStorageError(error)) {
      return null;
    }
    throw error;
  }
}

export async function sendAiChatMessage(params: {
  prisma: PrismaClient;
  userId: string;
  threadId?: string | null;
  modelCode: string;
  prompt: string;
}): Promise<AiChatSendSuccess | AiChatSendFailure> {
  const prompt = params.prompt.trim();
  if (prompt.length < 1) {
    return { ok: false as const, error: "Введите сообщение." };
  }

  const selectedModel = await getChatModelMeta(params.prisma, params.modelCode);
  const effectiveModelCode = selectedModel?.id ?? params.modelCode;
  const effectiveModelLabel = selectedModel?.label ?? params.modelCode;
  const costTokens = Math.max(1, Math.trunc(selectedModel?.priceTokens ?? 25));

  try {
    await ensureAiChatStorageSchema(params.prisma);

    if (!hasChatDelegates(params.prisma)) {
      const db = params.prisma as PrismaClient & AiChatQueryClient;
      const thread =
        params.threadId && params.threadId !== "new"
          ? await rawGetAiChatThread(db, params.userId, params.threadId)
          : null;

      const [createdThread] = thread
        ? [thread]
        : await db.$queryRaw<AiChatThreadRow[]>(Prisma.sql`
            INSERT INTO "icecream"."ai_chat_threads" ("user_id", "title", "model_code")
            VALUES (CAST(${params.userId} AS uuid), ${normalizeChatTitle(prompt)}, ${effectiveModelCode})
            RETURNING "id", "title", "model_code", "created_at", "updated_at", "last_message_at"
          `);

      const insertedUserMessages = await db.$queryRaw<AiChatMessageRow[]>(Prisma.sql`
        INSERT INTO "icecream"."ai_chat_messages" ("thread_id", "user_id", "role", "content", "model_code")
        VALUES (CAST(${createdThread.id} AS uuid), CAST(${params.userId} AS uuid), 'user', ${prompt}, ${effectiveModelCode})
        RETURNING "id", "thread_id", "role", "content", "model_code", "created_at"
      `);
      const insertedUserMessage = insertedUserMessages[0];

      const assistantText = buildChatAssistantText(prompt);
      const insertedAssistantMessages = await db.$queryRaw<AiChatMessageRow[]>(Prisma.sql`
        INSERT INTO "icecream"."ai_chat_messages" ("thread_id", "user_id", "role", "content", "model_code")
        VALUES (CAST(${createdThread.id} AS uuid), CAST(${params.userId} AS uuid), 'assistant', ${assistantText}, ${effectiveModelCode})
        RETURNING "id", "thread_id", "role", "content", "model_code", "created_at"
      `);
      const insertedAssistantMessage = insertedAssistantMessages[0];

      await db.$executeRaw(Prisma.sql`
        UPDATE "icecream"."ai_chat_threads"
        SET
          "title" = ${createdThread.title === "Новый чат" ? normalizeChatTitle(prompt) : createdThread.title},
          "model_code" = ${effectiveModelCode},
          "last_message_at" = ${insertedAssistantMessage.created_at},
          "updated_at" = NOW()
        WHERE "id" = CAST(${createdThread.id} AS uuid)
      `);

      const tokenSpendResult = await spendAiTokensForChat({
        prisma: params.prisma,
        userId: params.userId,
        amount: costTokens,
        modelCode: effectiveModelCode,
        modelName: effectiveModelLabel,
        prompt,
        metadata: { threadId: createdThread.id }
      });

      if (!tokenSpendResult.ok) {
        await db.$executeRaw(Prisma.sql`
          DELETE FROM "icecream"."ai_chat_messages"
          WHERE "thread_id" = CAST(${createdThread.id} AS uuid) AND "created_at" >= ${insertedUserMessage.created_at}
        `).catch(() => null);
        const [remainingCount] = await db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM "icecream"."ai_chat_messages"
          WHERE "thread_id" = CAST(${createdThread.id} AS uuid)
        `).catch(() => [{ count: BigInt(0) }]);
        if (remainingCount.count === BigInt(0)) {
          await db.$executeRaw(Prisma.sql`
            DELETE FROM "icecream"."ai_chat_threads"
            WHERE "id" = CAST(${createdThread.id} AS uuid)
          `).catch(() => null);
        }

        return { ok: false as const, error: tokenSpendResult.error };
      }

      const threadRecord = await rawGetAiChatThread(db, params.userId, createdThread.id);
      if (!threadRecord) {
        return { ok: false as const, error: "Не удалось загрузить чат." };
      }

      return {
        ok: true as const,
        newBalance: tokenSpendResult.newBalance,
        transactionId: tokenSpendResult.transactionId,
        thread: threadRecord,
        userMessage: {
          id: insertedUserMessage.id,
          threadId: insertedUserMessage.thread_id,
          role: insertedUserMessage.role as AiChatRole,
          content: insertedUserMessage.content,
          modelCode: insertedUserMessage.model_code,
          createdAt: insertedUserMessage.created_at.toISOString()
        },
        assistantMessage: {
          id: insertedAssistantMessage.id,
          threadId: insertedAssistantMessage.thread_id,
          role: insertedAssistantMessage.role as AiChatRole,
          content: insertedAssistantMessage.content,
          modelCode: insertedAssistantMessage.model_code,
          createdAt: insertedAssistantMessage.created_at.toISOString()
        }
      };
    }

    const thread =
      params.threadId && params.threadId !== "new"
        ? await params.prisma.ai_chat_threads.findFirst({
            where: { id: params.threadId, user_id: params.userId },
            select: { id: true, title: true, model_code: true, created_at: true, updated_at: true, last_message_at: true }
          })
        : null;

    const createdThread =
      thread ??
      (await params.prisma.ai_chat_threads.create({
        data: {
          user_id: params.userId,
          title: normalizeChatTitle(prompt),
          model_code: effectiveModelCode
        },
        select: { id: true, title: true, model_code: true, created_at: true, updated_at: true, last_message_at: true }
      }));

    const assistantText = buildChatAssistantText(prompt);

    const [userMessage, assistantMessage] = await params.prisma.$transaction(async (tx) => {
      const insertedUserMessage = await tx.ai_chat_messages.create({
        data: {
          thread_id: createdThread.id,
          user_id: params.userId,
          role: "user",
          content: prompt,
          model_code: effectiveModelCode
        }
      });

      const insertedAssistantMessage = await tx.ai_chat_messages.create({
        data: {
          thread_id: createdThread.id,
          user_id: params.userId,
          role: "assistant",
          content: assistantText,
          model_code: effectiveModelCode
        }
      });

      await tx.ai_chat_threads.update({
        where: { id: createdThread.id },
        data: {
          title: createdThread.title === "Новый чат" ? normalizeChatTitle(prompt) : createdThread.title,
          model_code: effectiveModelCode,
          last_message_at: insertedAssistantMessage.created_at
        }
      });

      return [insertedUserMessage, insertedAssistantMessage] as const;
    });

    const tokenSpendResult = await spendAiTokensForChat({
      prisma: params.prisma,
      userId: params.userId,
      amount: costTokens,
      modelCode: effectiveModelCode,
      modelName: effectiveModelLabel,
      prompt,
      metadata: {
        threadId: createdThread.id
      }
    });

    if (!tokenSpendResult.ok) {
      await params.prisma.ai_chat_messages
        .deleteMany({
          where: {
            thread_id: createdThread.id,
            created_at: {
              gte: userMessage.created_at
            }
          }
        })
        .catch(() => null);
      const threadMessages = await params.prisma.ai_chat_messages.count({
        where: { thread_id: createdThread.id }
      }).catch(() => 0);
      if (threadMessages === 0) {
        await params.prisma.ai_chat_threads.delete({
          where: { id: createdThread.id }
        }).catch(() => null);
      }

      return { ok: false as const, error: tokenSpendResult.error };
    }

    const threadRecord = await getAiChatThread(params.prisma, params.userId, createdThread.id);
    if (!threadRecord) {
      return { ok: false as const, error: "Не удалось загрузить чат." };
    }

    return {
      ok: true as const,
      newBalance: tokenSpendResult.newBalance,
      transactionId: tokenSpendResult.transactionId,
      thread: threadRecord,
      userMessage: toMessageRecord(userMessage),
      assistantMessage: toMessageRecord(assistantMessage)
    };
  } catch (error) {
    if (error instanceof Error && error.message === "User not found") {
      return { ok: false as const, error: "Пользователь не найден." };
    }
    throw error;
  }
}
