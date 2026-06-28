import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import {
  getAiPendingTokenBalance,
  incrementAiPendingTokenBalance
} from "@/lib/ai-studio-activation";
import { getAiStudioSubscriptionBonusTokensByTariffId } from "@/lib/ai-studio";
import { hasUserAiTokenBalanceColumn } from "@/lib/ai-token-balance-column";
import { isAnyPrismaColumnMissingError, isAnyPrismaTableMissingError } from "@/lib/prisma-errors";

export const aiTokenPackageCodeSchema = z.enum([
  "starter",
  "creator",
  "pro_creator",
  "studio",
  "mega_studio",
  "ultra_studio"
]);

export const aiTokenPurchaseRequestSchema = z.object({
  packageCode: aiTokenPackageCodeSchema,
  returnPath: z.string().trim().min(1).max(500).optional()
});

export const adminAiTokenAdjustRequestSchema = z.object({
  userId: z.string().trim().min(1, "User id is required."),
  amount: z.number().int("Amount must be an integer."),
  reason: z.string().trim().min(3, "Reason is required.").max(500)
});

export type AiTokenPackageCode = z.infer<typeof aiTokenPackageCodeSchema>;

export interface AiTokenPackageRecord {
  id: string;
  code: AiTokenPackageCode;
  name: string;
  tokenAmount: number;
  bonusTokens: number;
  priceRub: number;
  active: boolean;
}

export interface AiTokenTransactionRecord {
  id: string;
  userId: string;
  packageCode: string | null;
  type: string;
  amountTokens: number;
  amountRub: number | null;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export interface AiTokenMutationSuccess {
  ok: true;
  newBalance: number;
  transactionId: string;
}

export interface AiTokenMutationFailure {
  ok: false;
  error: string;
}

export interface AiPendingTokenMutationSuccess {
  ok: true;
  pendingBalance: number;
  totalTokens: number;
}

type AiTokenUserClient = Pick<PrismaClient, "user" | "ai_token_transactions" | "$queryRaw">;
type AiTokenMutationClient = Pick<
  PrismaClient,
  "user" | "ai_token_transactions" | "$queryRaw" | "$executeRawUnsafe"
> &
  Partial<Pick<PrismaClient, "$transaction">>;

export const AI_TOKEN_PACKAGE_FALLBACKS: AiTokenPackageRecord[] = [
  {
    id: "starter",
    code: "starter",
    name: "Starter",
    tokenAmount: 1000,
    bonusTokens: 0,
    priceRub: 500,
    active: true
  },
  {
    id: "creator",
    code: "creator",
    name: "Creator",
    tokenAmount: 2500,
    bonusTokens: 100,
    priceRub: 1250,
    active: true
  },
  {
    id: "pro_creator",
    code: "pro_creator",
    name: "Pro Creator",
    tokenAmount: 5000,
    bonusTokens: 300,
    priceRub: 2500,
    active: true
  },
  {
    id: "studio",
    code: "studio",
    name: "Studio",
    tokenAmount: 10000,
    bonusTokens: 1000,
    priceRub: 5000,
    active: true
  },
  {
    id: "mega_studio",
    code: "mega_studio",
    name: "Mega Studio",
    tokenAmount: 15000,
    bonusTokens: 2000,
    priceRub: 7500,
    active: true
  },
  {
    id: "ultra_studio",
    code: "ultra_studio",
    name: "Ultra Studio",
    tokenAmount: 20000,
    bonusTokens: 3000,
    priceRub: 10000,
    active: true
  },
];

function toInteger(value: Prisma.Decimal | number | null | undefined): number {
  return Math.trunc(Number(value ?? 0));
}

async function readFallbackPackages(
  prisma: Pick<PrismaClient, "$queryRaw"> & Partial<Pick<PrismaClient, "ai_token_packages">>
): Promise<AiTokenPackageRecord[]> {
  const db = prisma as Record<string, unknown> & Partial<PrismaClient>;
  if (!db.ai_token_packages || typeof (db.ai_token_packages as { findMany?: unknown }).findMany !== "function") {
    return AI_TOKEN_PACKAGE_FALLBACKS;
  }

  try {
    const aiTokenPackages = prisma.ai_token_packages;
    if (!aiTokenPackages) {
      return AI_TOKEN_PACKAGE_FALLBACKS;
    }

    const rows = await aiTokenPackages.findMany({
      where: { active: true },
      orderBy: { price_rub: "asc" }
    });

    const rowsByCode = new Map(
      rows
        .map((row) => [row.code, row] as const)
        .filter(([code]) => aiTokenPackageCodeSchema.safeParse(code).success)
    );

    return AI_TOKEN_PACKAGE_FALLBACKS.map((fallback) => {
      const row = rowsByCode.get(fallback.code);
      if (!row) return fallback;
      return {
        id: row.id,
        code: aiTokenPackageCodeSchema.parse(row.code),
        name: fallback.name,
        tokenAmount: fallback.tokenAmount,
        bonusTokens: fallback.bonusTokens,
        priceRub: fallback.priceRub,
        active: row.active
      };
    });
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["ai_token_packages"])) {
      return AI_TOKEN_PACKAGE_FALLBACKS;
    }
    throw error;
  }
}

export async function listAiTokenPackages(
  prisma: Pick<PrismaClient, "$queryRaw"> & Partial<Pick<PrismaClient, "ai_token_packages">>
): Promise<AiTokenPackageRecord[]> {
  return readFallbackPackages(prisma);
}

export async function getAiTokenPackage(
  prisma: Pick<PrismaClient, "$queryRaw"> & Partial<Pick<PrismaClient, "ai_token_packages">>,
  packageCode: string
): Promise<AiTokenPackageRecord | null> {
  const parsedCode = aiTokenPackageCodeSchema.safeParse(packageCode);
  if (!parsedCode.success) return null;

  const packages = await listAiTokenPackages(prisma);
  return packages.find((item) => item.code === parsedCode.data) ?? null;
}

export async function listAiTokenTransactions(
  prisma: PrismaClient,
  userId: string,
  take = 50
): Promise<AiTokenTransactionRecord[]> {
  try {
    const rows = await prisma.ai_token_transactions.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take,
      select: {
        id: true,
        user_id: true,
        package_code: true,
        type: true,
        amount_tokens: true,
        amount_rub: true,
        balance_after: true,
        description: true,
        created_at: true
      }
    });

    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      packageCode: row.package_code,
      type: row.type,
      amountTokens: row.amount_tokens,
      amountRub: row.amount_rub ?? null,
      balanceAfter: row.balance_after,
      description: row.description ?? null,
      createdAt: row.created_at.toISOString()
    }));
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["ai_token_transactions"])) {
      return [];
    }
    throw error;
  }
}

export async function getAiTokenBalance(
  prisma: AiTokenUserClient,
  userId: string
): Promise<number> {
  if (await hasUserAiTokenBalanceColumn(prisma)) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { aiTokenBalance: true }
      });

      return toInteger(user?.aiTokenBalance);
    } catch (error) {
      if (isAnyPrismaColumnMissingError(error, ["user.aiTokenBalance", "aiTokenBalance"])) {
        // Fall through to ledger mode.
      } else {
        throw error;
      }
    }
  }

  try {
    const rows = await prisma.ai_token_transactions.findMany({
      where: { user_id: userId },
      orderBy: { created_at: "desc" },
      take: 1,
      select: { balance_after: true }
    });

    return toInteger(rows[0]?.balance_after);
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["ai_token_transactions"])) {
      return 0;
    }
    throw error;
  }
}

export async function getUserAiPendingTokenBalance(
  prisma: PrismaClient,
  userId: string
): Promise<number> {
  return getAiPendingTokenBalance(prisma, userId);
}

type AiTokenTransactionColumnAvailability = {
  description: boolean;
  metadata: boolean;
  generationId: boolean;
};

type AiTokenSchemaBootstrapClient = Pick<PrismaClient, "$executeRawUnsafe" | "$queryRaw">;

async function ensureAiTokenStorageSchema(prisma: AiTokenSchemaBootstrapClient): Promise<void> {
  if (typeof prisma.$executeRawUnsafe !== "function") {
    return;
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "icecream"."ai_token_transactions" (
      "id" UUID NOT NULL DEFAULT gen_random_uuid(),
      "user_id" UUID NOT NULL,
      "package_code" TEXT,
      "type" TEXT NOT NULL,
      "amount_tokens" INTEGER NOT NULL,
      "amount_rub" DOUBLE PRECISION,
      "balance_after" INTEGER NOT NULL,
      "generation_id" UUID,
      "description" TEXT,
      "metadata" JSONB,
      "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ai_token_transactions_pkey" PRIMARY KEY ("id"),
      CONSTRAINT "ai_token_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "icecream"."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ai_token_transactions_user_id_created_at_idx"
    ON "icecream"."ai_token_transactions"("user_id", "created_at")
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "icecream"."ai_token_transactions"
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "metadata" JSONB,
      ADD COLUMN IF NOT EXISTS "generation_id" UUID
  `);
}

async function getAiTokenTransactionColumnAvailability(
  prisma: Pick<PrismaClient, "$queryRaw">
): Promise<AiTokenTransactionColumnAvailability> {
  if (typeof prisma.$queryRaw !== "function") {
    return {
      description: true,
      metadata: true,
      generationId: true
    };
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'icecream'
        AND table_name = 'ai_token_transactions'
        AND column_name IN ('description', 'metadata', 'generation_id')
    `;

    const columns = new Set(rows.map((row) => row.column_name.toLowerCase()));
    return {
      description: columns.has("description"),
      metadata: columns.has("metadata"),
      generationId: columns.has("generation_id")
    };
  } catch {
    return {
      description: false,
      metadata: false,
      generationId: false
    };
  }
}

function buildAiTokenTransactionData(
  data: {
    user_id: string;
    package_code: string | null;
    type: string;
    amount_tokens: number;
    amount_rub: number | null;
    balance_after: number;
    generation_id?: string | null;
    description?: string | null;
    metadata?: Prisma.InputJsonValue | Prisma.JsonNullValueInput;
  },
  availability: AiTokenTransactionColumnAvailability
): Parameters<PrismaClient["ai_token_transactions"]["create"]>[0]["data"] {
  const payload: Record<string, unknown> = {
    user_id: data.user_id,
    package_code: data.package_code,
    type: data.type,
    amount_tokens: data.amount_tokens,
    amount_rub: data.amount_rub,
    balance_after: data.balance_after
  };

  if (availability.generationId && data.generation_id !== undefined) {
    payload.generation_id = data.generation_id;
  }
  if (availability.description && data.description !== undefined) {
    payload.description = data.description;
  }
  if (availability.metadata && data.metadata !== undefined) {
    payload.metadata = data.metadata;
  }

  return payload as Parameters<PrismaClient["ai_token_transactions"]["create"]>[0]["data"];
}

function buildAiTokenTransactionDataMinimal(data: {
  user_id: string;
  package_code: string | null;
  type: string;
  amount_tokens: number;
  amount_rub: number | null;
  balance_after: number;
}): Parameters<PrismaClient["ai_token_transactions"]["create"]>[0]["data"] {
  return {
    user_id: data.user_id,
    package_code: data.package_code,
    type: data.type,
    amount_tokens: data.amount_tokens,
    amount_rub: data.amount_rub,
    balance_after: data.balance_after
  };
}

function isCompatibilityFallbackError(error: unknown): boolean {
  if (isAnyPrismaColumnMissingError(error, ["user.aiTokenBalance", "aiTokenBalance"])) {
    return true;
  }
  if (isAnyPrismaTableMissingError(error, ["ai_token_transactions", "user"])) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /25P02|current transaction is aborted|column .* does not exist|relation .* does not exist|unknown column|has no column|missing column/i.test(
    message
  );
}

function isDuplicateTopupGrantError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? "");
  return /duplicate key value violates unique constraint|unique constraint/i.test(message);
}

async function findAiTokenTransactionByOrderId(
  prisma: Pick<PrismaClient, "$queryRaw">,
  orderId: string
): Promise<{ id: string; balanceAfter: number } | null> {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string; balance_after: number }>>`
      SELECT "id", "balance_after"
      FROM "icecream"."ai_token_transactions"
      WHERE "metadata"->>'orderId' = ${orderId}
      ORDER BY "created_at" DESC
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      balanceAfter: toInteger(row.balance_after)
    };
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, ["ai_token_transactions"])) {
      return null;
    }
    if (isAnyPrismaColumnMissingError(error, ["ai_token_transactions.metadata", "metadata"])) {
      return null;
    }
    throw error;
  }
}

async function applyAiTokenMutationInTransaction(params: {
  client: AiTokenMutationClient;
  userId: string;
  delta: number;
  transactionData: {
    user_id: string;
    package_code: string | null;
    type: string;
    amount_tokens: number;
    amount_rub: number | null;
    balance_after: number;
    generation_id?: string | null;
    description?: string | null;
    metadata?: Prisma.InputJsonValue | Prisma.JsonNullValueInput;
  };
  minimal?: boolean;
}): Promise<AiTokenMutationSuccess> {
  const hasBalanceColumn = await hasUserAiTokenBalanceColumn(params.client);
  const currentBalance = await getAiTokenBalance(params.client, params.userId);
  const nextBalance = currentBalance + params.delta;
  if (nextBalance < 0) {
    throw new Error("Insufficient AI token balance.");
  }

  const transactionData = {
    ...params.transactionData,
    balance_after: nextBalance
  };

  const shouldUseLedgerOnly = params.minimal || !hasBalanceColumn;
  if (!shouldUseLedgerOnly) {
    try {
      if (params.delta > 0) {
        await params.client.user.update({
          where: { id: params.userId },
          data: {
            aiTokenBalance: {
              increment: params.delta
            }
          }
        });
      } else {
        const affected = await params.client.user.updateMany({
          where: {
            id: params.userId,
            aiTokenBalance: {
              gte: Math.abs(params.delta)
            }
          },
          data: {
            aiTokenBalance: {
              decrement: Math.abs(params.delta)
            }
          }
        });

        if (affected.count === 0) {
          throw new Error("Insufficient AI token balance.");
        }
      }
    } catch (error) {
      if (!isAnyPrismaColumnMissingError(error, ["user.aiTokenBalance", "aiTokenBalance"])) {
        throw error;
      }
      throw error;
    }
  }

  const columnAvailability = params.minimal
    ? { description: false, metadata: false, generationId: false }
    : await getAiTokenTransactionColumnAvailability(params.client);
  const data = params.minimal
    ? buildAiTokenTransactionDataMinimal(transactionData)
    : buildAiTokenTransactionData(transactionData, columnAvailability);
  const created = await params.client.ai_token_transactions.create({ data });

  return {
    ok: true,
    newBalance: nextBalance,
    transactionId: created.id
  };
}

async function runAiTokenMutationWithFallback(params: {
  prisma: AiTokenMutationClient;
  userId: string;
  delta: number;
  transactionData: {
    user_id: string;
    package_code: string | null;
    type: string;
    amount_tokens: number;
    amount_rub: number | null;
    balance_after: number;
    generation_id?: string | null;
    description?: string | null;
    metadata?: Prisma.InputJsonValue | Prisma.JsonNullValueInput;
  };
}): Promise<AiTokenMutationSuccess> {
  await ensureAiTokenStorageSchema(params.prisma);
  const applyMutation = async (minimal = false) => {
    if (typeof params.prisma.$transaction === "function") {
      return params.prisma.$transaction(async (tx) =>
        applyAiTokenMutationInTransaction({
          client: tx,
          userId: params.userId,
          delta: params.delta,
          transactionData: params.transactionData,
          minimal
        })
      );
    }

    return applyAiTokenMutationInTransaction({
      client: params.prisma,
      userId: params.userId,
      delta: params.delta,
      transactionData: params.transactionData,
      minimal
    });
  };

  try {
    return await applyMutation(false);
  } catch (error) {
    if (!isCompatibilityFallbackError(error)) {
      throw error;
    }

    return await applyMutation(true);
  }
}

export async function buyAiTokensInTestMode(params: {
  prisma: PrismaClient;
  userId: string;
  packageCode: string;
}): Promise<AiTokenMutationSuccess | AiTokenMutationFailure> {
  const tokenPackage = await getAiTokenPackage(params.prisma, params.packageCode);
  if (!tokenPackage) {
    return { ok: false as const, error: "Пакет токенов не найден." };
  }

  try {
    const user = await params.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true }
    });
    if (!user) {
      return { ok: false as const, error: "Пользователь не найден." };
    }

    const totalTokens = tokenPackage.tokenAmount + tokenPackage.bonusTokens;

    const mutation = await runAiTokenMutationWithFallback({
      prisma: params.prisma,
      userId: params.userId,
      delta: totalTokens,
      transactionData: {
        user_id: params.userId,
        package_code: tokenPackage.code,
        type: "topup",
        amount_tokens: totalTokens,
        amount_rub: tokenPackage.priceRub,
        balance_after: 0,
        description:
          tokenPackage.bonusTokens > 0
            ? `Тестовое пополнение пакета ${tokenPackage.name} (+${tokenPackage.bonusTokens} бонусных токенов)`
            : `Тестовое пополнение пакета ${tokenPackage.name}`,
        metadata: {
          mode: "test",
          packageCode: tokenPackage.code,
          packageName: tokenPackage.name,
          baseTokens: tokenPackage.tokenAmount,
          bonusTokens: tokenPackage.bonusTokens,
          totalTokens,
          source: "ai-studio"
        }
      }
    });

    return mutation;
  } catch (error) {
    if (error instanceof Error && error.message === "User not found") {
      return { ok: false as const, error: "Пользователь не найден." };
    }
    throw error;
  }
}

export async function grantAiTokensForPaidPackage(params: {
  prisma: AiTokenMutationClient;
  userId: string;
  packageCode: string;
  providerPaymentId?: string | null;
  orderId?: string | null;
}): Promise<AiTokenMutationSuccess | AiTokenMutationFailure> {
  const tokenPackage = await getAiTokenPackage(params.prisma, params.packageCode);
  if (!tokenPackage) {
    return { ok: false as const, error: "Пакет токенов не найден." };
  }

  try {
    const user = await params.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true }
    });
    if (!user) {
      return { ok: false as const, error: "Пользователь не найден." };
    }

    const totalTokens = tokenPackage.tokenAmount + tokenPackage.bonusTokens;

    try {
      return await runAiTokenMutationWithFallback({
        prisma: params.prisma,
        userId: params.userId,
        delta: totalTokens,
        transactionData: {
          user_id: params.userId,
          package_code: tokenPackage.code,
          type: "topup",
          amount_tokens: totalTokens,
          amount_rub: tokenPackage.priceRub,
          balance_after: 0,
          description:
            tokenPackage.bonusTokens > 0
              ? `Покупка пакета ${tokenPackage.name} (+${tokenPackage.bonusTokens} бонусных токенов)`
              : `Покупка пакета ${tokenPackage.name}`,
          metadata: {
            mode: "payment",
            source: "ai-studio",
            packageCode: tokenPackage.code,
            packageName: tokenPackage.name,
            baseTokens: tokenPackage.tokenAmount,
            bonusTokens: tokenPackage.bonusTokens,
            totalTokens,
            providerPaymentId: params.providerPaymentId ?? null,
            orderId: params.orderId ?? null
          }
        }
      });
    } catch (error) {
      if (params.orderId && isDuplicateTopupGrantError(error)) {
        const existing = await findAiTokenTransactionByOrderId(params.prisma, params.orderId);
        if (existing) {
          return {
            ok: true,
            newBalance: existing.balanceAfter,
            transactionId: existing.id
          };
        }
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "User not found") {
      return { ok: false as const, error: "Пользователь не найден." };
    }
    throw error;
  }
}

export async function queueAiTokensForPaidPackage(params: {
  prisma: AiTokenMutationClient;
  userId: string;
  packageCode: string;
}): Promise<AiPendingTokenMutationSuccess | AiTokenMutationFailure> {
  const tokenPackage = await getAiTokenPackage(params.prisma, params.packageCode);
  if (!tokenPackage) {
    return { ok: false as const, error: "Пакет токенов не найден." };
  }

  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true }
  });
  if (!user) {
    return { ok: false as const, error: "Пользователь не найден." };
  }

  const totalTokens = tokenPackage.tokenAmount + tokenPackage.bonusTokens;
  const pendingBalance = await incrementAiPendingTokenBalance({
    prisma: params.prisma,
    userId: params.userId,
    amount: totalTokens
  });

  return {
    ok: true,
    pendingBalance,
    totalTokens
  };
}

export async function queueAiTokensForSubscriptionBonus(params: {
  prisma: AiTokenMutationClient;
  userId: string;
  tariffId: string;
}): Promise<AiPendingTokenMutationSuccess | AiTokenMutationFailure> {
  const bonusTokens = getAiStudioSubscriptionBonusTokensByTariffId(params.tariffId);
  if (bonusTokens <= 0) {
    return {
      ok: true,
      pendingBalance: await getAiPendingTokenBalance(params.prisma, params.userId),
      totalTokens: 0
    };
  }

  const user = await params.prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true }
  });
  if (!user) {
    return { ok: false as const, error: "Пользователь не найден." };
  }

  const pendingBalance = await incrementAiPendingTokenBalance({
    prisma: params.prisma,
    userId: params.userId,
    amount: bonusTokens
  });

  return {
    ok: true,
    pendingBalance,
    totalTokens: bonusTokens
  };
}

export async function grantAiTokensForSubscriptionBonus(params: {
  prisma: AiTokenMutationClient;
  userId: string;
  tariffId: string;
  providerPaymentId?: string | null;
  orderId?: string | null;
}): Promise<AiTokenMutationSuccess | AiTokenMutationFailure> {
  const bonusTokens = getAiStudioSubscriptionBonusTokensByTariffId(params.tariffId);
  if (bonusTokens <= 0) {
    return { ok: true, newBalance: await getAiTokenBalance(params.prisma, params.userId), transactionId: "subscription-bonus-none" };
  }

  try {
    if (params.orderId) {
      const existing = await findAiTokenTransactionByOrderId(params.prisma, params.orderId);
      if (existing) {
        return {
          ok: true,
          newBalance: existing.balanceAfter,
          transactionId: existing.id
        };
      }
    }

    const user = await params.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true }
    });
    if (!user) {
      return { ok: false as const, error: "Пользователь не найден." };
    }

    const normalizedTariffId = params.tariffId.trim().toLowerCase();
    const tariffLabel =
      normalizedTariffId === "enterprise"
        ? "ENTERPRISE"
        : normalizedTariffId === "pro"
          ? "PRO"
          : "STANDARD";

    try {
      return await runAiTokenMutationWithFallback({
        prisma: params.prisma,
        userId: params.userId,
        delta: bonusTokens,
        transactionData: {
          user_id: params.userId,
          package_code: null,
          type: "topup",
          amount_tokens: bonusTokens,
          amount_rub: null,
          balance_after: 0,
          description: `Бонус AI-токенов за подписку ${tariffLabel}`,
          metadata: {
            mode: "subscription_bonus",
            source: "subscription",
            tariffId: normalizedTariffId,
            bonusTokens,
            providerPaymentId: params.providerPaymentId ?? null,
            orderId: params.orderId ?? null
          }
        }
      });
    } catch (error) {
      if (params.orderId && isDuplicateTopupGrantError(error)) {
        const existing = await findAiTokenTransactionByOrderId(params.prisma, params.orderId);
        if (existing) {
          return {
            ok: true,
            newBalance: existing.balanceAfter,
            transactionId: existing.id
          };
        }
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof Error && error.message === "User not found") {
      return { ok: false as const, error: "Пользователь не найден." };
    }
    throw error;
  }
}

export async function adjustAiTokensByAdmin(params: {
  prisma: AiTokenMutationClient;
  adminId: string;
  userId: string;
  amount: number;
  reason: string;
}): Promise<AiTokenMutationSuccess | AiTokenMutationFailure> {
  if (params.amount === 0) {
    return { ok: false as const, error: "Amount must not be zero." };
  }

  try {
    const user = await params.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true }
    });
    if (!user) {
      return { ok: false as const, error: "Пользователь не найден." };
    }

    const mutation = await runAiTokenMutationWithFallback({
      prisma: params.prisma,
      userId: params.userId,
      delta: params.amount,
      transactionData: {
        user_id: params.userId,
        package_code: null,
        type: "admin_adjustment",
        amount_tokens: params.amount,
        amount_rub: null,
        balance_after: 0,
        description: `Админское изменение баланса: ${params.reason}`,
        metadata: {
          adminId: params.adminId,
          reason: params.reason,
          amount: params.amount
        }
      }
    });

    return mutation;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "User not found") {
        return { ok: false as const, error: "Пользователь не найден." };
      }
      if (error.message === "Insufficient AI token balance.") {
        return { ok: false as const, error: "Нельзя списать больше токенов, чем есть на балансе." };
      }
    }
    throw error;
  }
}

export async function spendAiTokensForGeneration(params: {
  prisma: PrismaClient;
  userId: string;
  amount: number;
  generationId: string;
  section: string;
  modelCode: string;
  modelName?: string | null;
  prompt?: string | null;
  metadata?: Prisma.InputJsonValue | Prisma.JsonNullValueInput;
}): Promise<AiTokenMutationSuccess | AiTokenMutationFailure> {
  if (params.amount <= 0) {
    return { ok: false as const, error: "Amount must be positive." };
  }

  const extraMetadata =
    params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
      ? (params.metadata as Record<string, unknown>)
      : {};

  try {
    const user = await params.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true }
    });
    if (!user) {
      return { ok: false as const, error: "Пользователь не найден." };
    }

    const mutation = await runAiTokenMutationWithFallback({
      prisma: params.prisma,
      userId: params.userId,
      delta: -params.amount,
      transactionData: {
        user_id: params.userId,
        package_code: null,
        type: "generation",
        amount_tokens: -params.amount,
        amount_rub: null,
        balance_after: 0,
        generation_id: params.generationId,
        description: `Списание токенов за генерацию ${params.section}: ${params.modelName ?? params.modelCode}`,
        metadata: {
          section: params.section,
          modelCode: params.modelCode,
          modelName: params.modelName ?? null,
          prompt: params.prompt ?? null,
          ...extraMetadata
        }
      }
    });

    return mutation;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "User not found") {
        return { ok: false as const, error: "Пользователь не найден." };
      }
      if (error.message === "Insufficient AI token balance.") {
        return { ok: false as const, error: "Недостаточно AI-токенов." };
      }
    }
    throw error;
  }
}

export async function spendAiTokensForChat(params: {
  prisma: PrismaClient;
  userId: string;
  amount: number;
  modelCode: string;
  modelName?: string | null;
  prompt?: string | null;
  metadata?: Prisma.InputJsonValue | Prisma.JsonNullValueInput;
}): Promise<AiTokenMutationSuccess | AiTokenMutationFailure> {
  if (params.amount <= 0) {
    return { ok: false as const, error: "Amount must be positive." };
  }

  const extraMetadata =
    params.metadata && typeof params.metadata === "object" && !Array.isArray(params.metadata)
      ? (params.metadata as Record<string, unknown>)
      : {};

  try {
    const user = await params.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true }
    });
    if (!user) {
      return { ok: false as const, error: "Пользователь не найден." };
    }

    const mutation = await runAiTokenMutationWithFallback({
      prisma: params.prisma,
      userId: params.userId,
      delta: -params.amount,
      transactionData: {
        user_id: params.userId,
        package_code: null,
        type: "chat",
        amount_tokens: -params.amount,
        amount_rub: null,
        balance_after: 0,
        description: `Списание токенов за чат ${params.modelName ?? params.modelCode}`,
        metadata: {
          section: "chat",
          modelCode: params.modelCode,
          modelName: params.modelName ?? null,
          prompt: params.prompt ?? null,
          ...extraMetadata
        }
      }
    });

    return mutation;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "User not found") {
        return { ok: false as const, error: "Пользователь не найден." };
      }
      if (error.message === "Insufficient AI token balance.") {
        return { ok: false as const, error: "Недостаточно AI-токенов." };
      }
    }
    throw error;
  }
}
