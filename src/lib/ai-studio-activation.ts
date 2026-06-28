import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { isAnyPrismaColumnMissingError, isAnyPrismaTableMissingError } from "@/lib/prisma-errors";

export type AiStudioSystemStatus = "preparing" | "active";
export type AiStudioOrderStatus = "pending_payment" | "preparing" | "completed" | "failed" | "refunded";

type QueryClient = Pick<PrismaClient, "$queryRaw">;

type PreparingOrderRecord = {
  id: string;
  userId: string;
  type: string;
  metadata: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMetadataValue<T>(metadata: unknown, key: string, fallback: T): T {
  if (!isRecord(metadata) || !(key in metadata)) {
    return fallback;
  }
  return metadata[key] as T;
}

export function readAiTokenTotalFromOrderMetadata(metadata: unknown): number {
  const baseTokens = Math.max(0, Math.trunc(Number(readMetadataValue(metadata, "tokenAmount", 0))));
  const bonusTokens = Math.max(0, Math.trunc(Number(readMetadataValue(metadata, "bonusTokens", 0))));
  return baseTokens + bonusTokens;
}

export async function getAiStudioSystemStatus(prisma: QueryClient): Promise<AiStudioSystemStatus> {
  try {
    const rows = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status
      FROM "icecream"."ai_studio_system_state"
      WHERE id = 1
      LIMIT 1
    `;

    const status = String(rows[0]?.status ?? "preparing").trim().toLowerCase();
    return status === "active" ? "active" : "preparing";
  } catch {
    return "preparing";
  }
}

export async function getAiPendingTokenBalance(prisma: QueryClient, userId: string): Promise<number> {
  try {
    const rows = await prisma.$queryRaw<Array<{ balance: number | null }>>`
      SELECT COALESCE("aiPendingTokenBalance", 0) AS balance
      FROM "icecream"."user"
      WHERE "id" = ${userId}::uuid
      LIMIT 1
    `;
    return Math.max(0, Math.trunc(Number(rows[0]?.balance ?? 0)));
  } catch (error) {
    if (isAnyPrismaColumnMissingError(error, ["user.aiPendingTokenBalance", "aiPendingTokenBalance"])) {
      return 0;
    }
    throw error;
  }
}

export async function incrementAiPendingTokenBalance(params: {
  prisma: QueryClient;
  userId: string;
  amount: number;
}): Promise<number> {
  const rows = await params.prisma.$queryRaw<Array<{ balance: number }>>`
    UPDATE "icecream"."user"
    SET "aiPendingTokenBalance" = GREATEST(0, COALESCE("aiPendingTokenBalance", 0) + ${Math.trunc(params.amount)})
    WHERE "id" = ${params.userId}::uuid
    RETURNING "aiPendingTokenBalance" AS balance
  `;

  return Math.max(0, Math.trunc(Number(rows[0]?.balance ?? 0)));
}

export async function zeroAiPendingTokenBalances(prisma: QueryClient, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  const normalized = [...new Set(userIds.map((userId) => userId.trim()).filter(Boolean))];
  if (normalized.length === 0) return;

  await prisma.$queryRaw`
    UPDATE "icecream"."user"
    SET "aiPendingTokenBalance" = 0
    WHERE "id" = ANY(${normalized}::uuid[])
  `;
}

export async function getOrderPaymentStatus(prisma: QueryClient, orderId: string): Promise<AiStudioOrderStatus> {
  try {
    const rows = await prisma.$queryRaw<Array<{ payment_status: string | null }>>`
      SELECT payment_status
      FROM "icecream"."orders"
      WHERE "id" = ${orderId}::uuid
      LIMIT 1
    `;
    const status = String(rows[0]?.payment_status ?? "pending_payment").trim().toLowerCase();
    if (status === "preparing" || status === "completed" || status === "failed" || status === "refunded") {
      return status;
    }
    return "pending_payment";
  } catch (error) {
    if (isAnyPrismaColumnMissingError(error, ["orders.payment_status", "payment_status"])) {
      return "pending_payment";
    }
    throw error;
  }
}

export async function setOrderPaymentStatus(params: {
  prisma: QueryClient;
  orderId: string;
  status: AiStudioOrderStatus;
  completedAt?: Date | null;
}): Promise<void> {
  await params.prisma.$queryRaw`
    UPDATE "icecream"."orders"
    SET
      "payment_status" = ${params.status},
      "completed_at" = ${params.completedAt ?? null}
    WHERE "id" = ${params.orderId}::uuid
  `;
}

export async function transitionOrderPaymentStatus(params: {
  prisma: QueryClient;
  orderId: string;
  fromStatus: AiStudioOrderStatus;
  toStatus: AiStudioOrderStatus;
  completedAt?: Date | null;
}): Promise<boolean> {
  const rows = await params.prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "icecream"."orders"
    SET
      "payment_status" = ${params.toStatus},
      "completed_at" = ${params.completedAt ?? null}
    WHERE "id" = ${params.orderId}::uuid
      AND "payment_status" = ${params.fromStatus}
    RETURNING "id"
  `;

  return rows.length > 0;
}

export async function listPreparingAiTokenOrders(prisma: QueryClient): Promise<PreparingOrderRecord[]> {
  try {
    return await prisma.$queryRaw<PreparingOrderRecord[]>`
      SELECT "id", "userId" AS "userId", "type", "metadata"
      FROM "icecream"."orders"
      WHERE "payment_status" = 'preparing'
      ORDER BY "createdAt" ASC
    `;
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["orders"])) {
      return [];
    }
    throw error;
  }
}

export async function activateAiStudioSystemStatus(prisma: QueryClient): Promise<{
  alreadyActive: boolean;
}> {
  const currentStatus = await getAiStudioSystemStatus(prisma);
  if (currentStatus === "active") {
    return { alreadyActive: true };
  }

  await prisma.$queryRaw`
    UPDATE "icecream"."ai_studio_system_state"
    SET
      "status" = 'active',
      "activated_at" = CURRENT_TIMESTAMP,
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 1
  `;

  return { alreadyActive: false };
}

export async function setAiStudioSystemStatus(
  prisma: QueryClient,
  status: AiStudioSystemStatus
): Promise<{
  changed: boolean;
  previousStatus: AiStudioSystemStatus;
  currentStatus: AiStudioSystemStatus;
}> {
  const previousStatus = await getAiStudioSystemStatus(prisma);
  if (previousStatus === status) {
    return {
      changed: false,
      previousStatus,
      currentStatus: previousStatus
    };
  }

  await prisma.$queryRaw`
    UPDATE "icecream"."ai_studio_system_state"
    SET
      "status" = ${status},
      "activated_at" = ${status === "active" ? new Date() : null},
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = 1
  `;

  return {
    changed: true,
    previousStatus,
    currentStatus: status
  };
}

export async function createAiStudioActivationNotification(params: {
  prisma: QueryClient;
  userId: string;
  tokens: number;
}): Promise<void> {
  const safeTitle = `AI Studio успешно активирована`;
  const safeMessage =
    `Ваш пакет AI-токенов уже начислен.` +
    `\n\nТеперь доступны:` +
    `\n• генерация изображений` +
    `\n• генерация видео` +
    `\n• генерация музыки` +
    `\n• генерация аудио` +
    `\n• остальные AI-инструменты` +
    `\n\nНачислено: ${params.tokens} AI-токенов.`;

  await params.prisma.$queryRaw`
    INSERT INTO "icecream"."ai_user_notifications"
      ("id", "user_id", "kind", "title", "message", "cta_label", "cta_href")
    VALUES
      (${randomUUID()}, ${params.userId}::uuid, 'success', ${safeTitle}, ${safeMessage}, 'Перейти в AI Studio', '/dashboard/ai-studio/image')
  `;
}

export async function listAiStudioNotifications(prisma: QueryClient, userId: string): Promise<
  Array<{
    id: string;
    kind: string;
    title: string;
    message: string;
    ctaLabel: string | null;
    ctaHref: string | null;
    createdAt: string;
  }>
> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        kind: string;
        title: string;
        message: string;
        cta_label: string | null;
        cta_href: string | null;
        created_at: Date;
      }>
    >`
      SELECT "id", "kind", "title", "message", "cta_label", "cta_href", "created_at"
      FROM "icecream"."ai_user_notifications"
      WHERE "user_id" = ${userId}::uuid
      ORDER BY "created_at" DESC
      LIMIT 10
    `;

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      message: row.message,
      ctaLabel: row.cta_label,
      ctaHref: row.cta_href,
      createdAt: row.created_at.toISOString()
    }));
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["ai_user_notifications"])) {
      return [];
    }
    throw error;
  }
}
