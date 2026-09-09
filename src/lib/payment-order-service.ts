import type { Prisma, PrismaClient } from "@prisma/client";

import {
  activateAiStudioSystemStatus,
  createAiStudioActivationNotification,
  getAiStudioSystemStatus,
  getOrderPaymentStatus,
  listPreparingAiTokenOrders,
  readAiTokenTotalFromOrderMetadata,
  setAiStudioSystemStatus,
  setOrderPaymentStatus,
  transitionOrderPaymentStatus,
  zeroAiPendingTokenBalances
} from "@/lib/ai-studio-activation";
import {
  grantAiTokensForPaidPackage,
  grantAiTokensForSubscriptionBonus,
  queueAiTokensForPaidPackage,
  queueAiTokensForSubscriptionBonus
} from "@/lib/ai-token-service";
import { getAiStudioSubscriptionBonusTokensByTariffId } from "@/lib/ai-studio";
import {
  buildStandalonePaymentUsage,
  mergeReleaseRolesPaymentUsage
} from "@/lib/release-quota";
import { normalizeSubscriptionBillingPeriod } from "@/lib/subscription-billing";
import { grantSubscriptionFromConfirmedPayment } from "@/lib/subscription-payment-service";
import { sendAiTokensCreditedEmail, sendAiTokensPendingEmail } from "@/lib/user-event-email";
import {
  getYooKassaPayment,
  getYooKassaPaymentStatus,
  isConfirmedYooKassaPayment,
  type YooKassaPaymentDetails,
  type YooKassaPaymentStatus
} from "@/lib/yookassa";

type OrderType = "subscription" | "release";

interface PaymentOrderResult {
  ok: boolean;
  status: YooKassaPaymentStatus | "not_found" | "already_confirmed" | "preparing";
  applied: boolean;
  orderId?: string;
  aiStudioStatus?: "preparing" | "active";
  paymentSummary?: {
    packageName: string;
    baseTokens: number;
    bonusTokens: number;
    totalTokens: number;
  } | null;
  error?: string;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function markSubmittedToModeration(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { submittedToModeration: true } as Prisma.InputJsonValue;
  }
  return {
    ...(value as Record<string, unknown>),
    submittedToModeration: true
  } as Prisma.InputJsonValue;
}

function mapTariffToSubscribeLevel(value: unknown): "standard" | "professional" | "enterprise" {
  const tariff = typeof value === "string" ? value.trim().toLowerCase() : "standard";
  if (tariff === "enterprise") return "enterprise";
  if (tariff === "pro") return "professional";
  return "standard";
}

function readProviderPaymentId(metadata: unknown): string | null {
  const payload = readMetadata(metadata);
  const providerPaymentId = payload.providerPaymentId;
  if (typeof providerPaymentId !== "string") return null;
  const normalized = providerPaymentId.trim();
  return normalized.length > 0 ? normalized : null;
}

function readExpectedAmountRub(metadata: unknown): number | null {
  const payload = readMetadata(metadata);
  const value = payload.amountRub;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function assertVerifiedPaymentMatchesOrder(params: {
  orderId: string;
  metadata: unknown;
  payment: YooKassaPaymentDetails;
}) {
  const storedProviderPaymentId = readProviderPaymentId(params.metadata);
  if (storedProviderPaymentId && storedProviderPaymentId !== params.payment.providerPaymentId) {
    throw new Error(`YooKassa payment mismatch for order ${params.orderId}: provider payment id differs.`);
  }

  const providerOrderId = params.payment.metadata.orderId?.trim();
  if (providerOrderId && providerOrderId !== params.orderId) {
    throw new Error(`YooKassa payment mismatch for order ${params.orderId}: provider metadata orderId differs.`);
  }

  const expectedAmountRub = readExpectedAmountRub(params.metadata);
  if (expectedAmountRub != null && params.payment.amountRub != null && expectedAmountRub !== params.payment.amountRub) {
    throw new Error(
      `YooKassa payment mismatch for order ${params.orderId}: expected ${expectedAmountRub} RUB, received ${params.payment.amountRub} RUB.`
    );
  }
}

async function verifyConfirmedYooKassaPaymentForOrder(params: {
  orderId: string;
  metadata: unknown;
  providerPaymentId?: string | null;
}): Promise<YooKassaPaymentDetails> {
  const providerPaymentId = params.providerPaymentId?.trim() || readProviderPaymentId(params.metadata);
  if (!providerPaymentId) {
    throw new Error(`Provider payment id is missing for order ${params.orderId}.`);
  }

  const payment = await getYooKassaPayment(providerPaymentId);
  assertVerifiedPaymentMatchesOrder({
    orderId: params.orderId,
    metadata: params.metadata,
    payment
  });
  return payment;
}

function readAiTokenPaymentSummary(metadata: unknown): PaymentOrderResult["paymentSummary"] {
  const payload = readMetadata(metadata);
  if (payload.purpose !== "ai_tokens") {
    return null;
  }

  const packageName =
    typeof payload.packageName === "string" && payload.packageName.trim().length > 0
      ? payload.packageName.trim()
      : "AI-токены";
  const baseTokens = Math.max(0, Math.trunc(Number(payload.tokenAmount ?? 0)));
  const bonusTokens = Math.max(0, Math.trunc(Number(payload.bonusTokens ?? 0)));
  const totalTokens = baseTokens + bonusTokens;

  return {
    packageName,
    baseTokens,
    bonusTokens,
    totalTokens
  };
}

function readSubscriptionPaymentSummary(metadata: unknown): PaymentOrderResult["paymentSummary"] {
  const payload = readMetadata(metadata);
  const tariffId = typeof payload.tariffId === "string" ? payload.tariffId.trim().toLowerCase() : "standard";
  const billingPeriod = normalizeSubscriptionBillingPeriod(payload.billingPeriod);
  const bonusTokens = getAiStudioSubscriptionBonusTokensByTariffId(tariffId, billingPeriod);
  if (bonusTokens <= 0) {
    return null;
  }

  const packageName =
    tariffId === "enterprise"
      ? "Подписка ENTERPRISE"
      : tariffId === "pro"
        ? "Подписка PRO"
        : "Подписка STANDARD";

  return {
    packageName,
    baseTokens: bonusTokens,
    bonusTokens: 0,
    totalTokens: bonusTokens
  };
}

async function readOrderUserProfile(prisma: PrismaClient, userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true
    }
  });
}

async function applyConfirmedOrder(params: {
  prisma: PrismaClient;
  order: {
    id: string;
    userId: string;
    type: OrderType;
    confirmed: boolean;
    metadata: unknown;
  };
}): Promise<void> {
  const metadata = readMetadata(params.order.metadata);
  const purpose = typeof metadata.purpose === "string" ? metadata.purpose.trim() : "";

  if (purpose === "ai_tokens") {
    const orderPaymentStatus = await getOrderPaymentStatus(params.prisma, params.order.id);
    if (orderPaymentStatus === "completed" || orderPaymentStatus === "preparing") {
      if (!params.order.confirmed) {
        await params.prisma.orders.update({
          where: { id: params.order.id },
          data: { confirmed: true }
        });
      }
      return;
    }

    const packageCode = typeof metadata.packageCode === "string" ? metadata.packageCode.trim() : "";
    const providerPaymentId =
      typeof metadata.providerPaymentId === "string" ? metadata.providerPaymentId.trim() : "";
    if (!packageCode) {
      throw new Error("AI token package code is missing");
    }

    const aiStudioStatus = await getAiStudioSystemStatus(params.prisma);
    if (aiStudioStatus === "preparing") {
      const queued = await params.prisma.$transaction(async (tx) => {
        const claimed = await transitionOrderPaymentStatus({
          prisma: tx,
          orderId: params.order.id,
          fromStatus: "pending_payment",
          toStatus: "preparing",
          completedAt: null
        });
        if (!claimed) {
          return { ok: true as const, skipped: true };
        }

        const pendingResult = await queueAiTokensForPaidPackage({
          prisma: tx,
          userId: params.order.userId,
          packageCode
        });
        if (!pendingResult.ok) {
          throw new Error(pendingResult.error);
        }

        await tx.orders.update({
          where: { id: params.order.id },
          data: { confirmed: true }
        });

        return { ok: true as const, skipped: false };
      });

      if (queued.skipped) {
        return;
      }

      const summary = readAiTokenPaymentSummary(params.order.metadata);
      const user = await readOrderUserProfile(params.prisma, params.order.userId);
      if (summary?.totalTokens) {
        try {
          await sendAiTokensPendingEmail({
            to: user?.email,
            userName: user?.name,
            packageName: summary.packageName,
            totalTokens: summary.totalTokens
          });
        } catch (error) {
          console.error("[ai-token-email] pending package notification failed", {
            orderId: params.order.id,
            error
          });
        }
      }
      return;
    }

    const result = await grantAiTokensForPaidPackage({
      prisma: params.prisma,
      userId: params.order.userId,
      packageCode,
      providerPaymentId: providerPaymentId || null,
      orderId: params.order.id
    });

    if (!result.ok) {
      throw new Error(result.error);
    }

    await params.prisma.orders.update({
      where: { id: params.order.id },
      data: { confirmed: true }
    });
    await setOrderPaymentStatus({
      prisma: params.prisma,
      orderId: params.order.id,
      status: "completed",
      completedAt: new Date()
    });

    const summary = readAiTokenPaymentSummary(params.order.metadata);
    const user = await readOrderUserProfile(params.prisma, params.order.userId);
    if (summary?.totalTokens) {
      try {
        await sendAiTokensCreditedEmail({
          to: user?.email,
          userName: user?.name,
          packageName: summary.packageName,
          totalTokens: summary.totalTokens
        });
      } catch (error) {
        console.error("[ai-token-email] credited package notification failed", {
          orderId: params.order.id,
          error
        });
      }
    }
    return;
  }

  if (params.order.confirmed) {
    await setOrderPaymentStatus({
      prisma: params.prisma,
      orderId: params.order.id,
      status: "completed",
      completedAt: new Date()
    });
    return;
  }

  if (params.order.type === "release") {
    const releaseId = typeof metadata.releaseId === "string" ? metadata.releaseId : null;
    if (releaseId) {
      const release = await params.prisma.release.findFirst({
        where: { id: releaseId, userId: params.order.userId },
        select: { id: true, roles: true }
      });
      await params.prisma.release.updateMany({
        where: { id: releaseId, userId: params.order.userId },
        data: {
          confirmed: true,
          status: "moderating",
          roles: markSubmittedToModeration(
            mergeReleaseRolesPaymentUsage(
              release?.roles ?? null,
              buildStandalonePaymentUsage({ orderId: params.order.id })
            )
          )
        }
      });
    }
    await params.prisma.orders.update({
      where: { id: params.order.id },
      data: { confirmed: true }
    });
    return;
  }

  if (params.order.type === "subscription") {
    const result = await grantSubscriptionFromConfirmedPayment({
      prisma: params.prisma,
      orderId: params.order.id,
      completedAt: new Date()
    });

    const summary = readSubscriptionPaymentSummary(params.order.metadata);
    const user = await readOrderUserProfile(params.prisma, params.order.userId);
    if (summary?.totalTokens) {
      try {
        if (result.paymentStatus === "preparing") {
          await sendAiTokensPendingEmail({
            to: user?.email,
            userName: user?.name,
            packageName: summary.packageName,
            totalTokens: summary.totalTokens
          });
        } else {
          await sendAiTokensCreditedEmail({
            to: user?.email,
            userName: user?.name,
            packageName: summary.packageName,
            totalTokens: summary.totalTokens
          });
        }
      } catch (error) {
        console.error(
          result.paymentStatus === "preparing"
            ? "[ai-token-email] pending subscription notification failed"
            : "[ai-token-email] credited subscription notification failed",
          {
            orderId: params.order.id,
            error
          }
        );
      }
    }
  }
}

export async function activateAIStudio(params: { prisma: PrismaClient }) {
  const activation = await activateAiStudioSystemStatus(params.prisma);
  const preparingOrders = await listPreparingAiTokenOrders(params.prisma);

  const creditedByUser = new Map<string, number>();

  for (const order of preparingOrders) {
    const claimed = await transitionOrderPaymentStatus({
      prisma: params.prisma,
      orderId: order.id,
      fromStatus: "preparing",
      toStatus: "completed",
      completedAt: new Date()
    });
    if (!claimed) {
      continue;
    }

    const metadata = readMetadata(order.metadata);
    const purpose = typeof metadata.purpose === "string" ? metadata.purpose.trim() : "";
    const providerPaymentId =
      typeof metadata.providerPaymentId === "string" ? metadata.providerPaymentId.trim() : "";

    if (purpose === "ai_tokens") {
      const packageCode = typeof metadata.packageCode === "string" ? metadata.packageCode.trim() : "";
      if (!packageCode) {
        continue;
      }

      const result = await grantAiTokensForPaidPackage({
        prisma: params.prisma,
        userId: order.userId,
        packageCode,
        providerPaymentId: providerPaymentId || null,
        orderId: order.id
      });
      if (!result.ok) {
        throw new Error(result.error);
      }

      creditedByUser.set(
        order.userId,
        (creditedByUser.get(order.userId) ?? 0) + readAiTokenTotalFromOrderMetadata(order.metadata)
      );
    } else if (order.type === "subscription") {
      const tariffId = typeof metadata.tariffId === "string" ? metadata.tariffId.trim().toLowerCase() : "standard";
      const billingPeriod = normalizeSubscriptionBillingPeriod(metadata.billingPeriod);
      const result = await grantAiTokensForSubscriptionBonus({
        prisma: params.prisma,
        userId: order.userId,
        tariffId,
        billingPeriod,
        providerPaymentId: providerPaymentId || null,
        orderId: order.id
      });
      if (!result.ok) {
        throw new Error(result.error);
      }

      const summary = readSubscriptionPaymentSummary(order.metadata);
      if (summary?.totalTokens) {
        creditedByUser.set(order.userId, (creditedByUser.get(order.userId) ?? 0) + summary.totalTokens);
      }
    } else {
      continue;
    }

    await params.prisma.orders.update({
      where: { id: order.id },
      data: { confirmed: true }
    });
  }

  await zeroAiPendingTokenBalances(params.prisma, [...creditedByUser.keys()]);

  for (const [userId, tokens] of creditedByUser) {
    await createAiStudioActivationNotification({
      prisma: params.prisma,
      userId,
      tokens
    });

    const user = await readOrderUserProfile(params.prisma, userId);
    try {
      await sendAiTokensCreditedEmail({
        to: user?.email,
        userName: user?.name,
        packageName: "AI Studio",
        totalTokens: tokens
      });
    } catch (error) {
      console.error("[ai-token-email] activation notification failed", {
        userId,
        error
      });
    }
  }

  return {
    alreadyActive: activation.alreadyActive,
    processedOrders: preparingOrders.length,
    affectedUsers: creditedByUser.size
  };
}

export async function updateAIStudioStatus(params: {
  prisma: PrismaClient;
  status: "preparing" | "active";
}) {
  if (params.status === "active") {
    const result = await activateAIStudio({ prisma: params.prisma });
    return {
      mode: "active" as const,
      alreadyInStatus: result.alreadyActive,
      processedOrders: result.processedOrders,
      affectedUsers: result.affectedUsers
    };
  }

  const result = await setAiStudioSystemStatus(params.prisma, "preparing");
  return {
    mode: "preparing" as const,
    alreadyInStatus: !result.changed,
    processedOrders: 0,
    affectedUsers: 0
  };
}

export async function applyYooKassaWebhookOrder(params: {
  prisma: PrismaClient;
  orderId?: string;
  providerPaymentId?: string | null;
  status: YooKassaPaymentStatus;
}): Promise<PaymentOrderResult> {
  const orderSelect = {
    id: true,
    userId: true,
    type: true,
    confirmed: true,
    metadata: true
  } as const;

  const order = params.orderId
    ? await params.prisma.orders.findUnique({
        where: { id: params.orderId },
        select: orderSelect
      })
    : (
        await params.prisma.orders.findMany({
          select: orderSelect,
          orderBy: { createdAt: "desc" },
          take: 100
        })
      ).find((item) => readMetadata(item.metadata).providerPaymentId === params.providerPaymentId) ?? null;

  if (!order) {
    return { ok: false, status: "not_found", applied: false, error: "Order not found" };
  }

  const paymentSummary = readAiTokenPaymentSummary(order.metadata) ?? readSubscriptionPaymentSummary(order.metadata);
  const orderPaymentStatus = await getOrderPaymentStatus(params.prisma, order.id);

  if (params.status !== "succeeded") {
    return {
      ok: true,
      status: params.status,
      applied: false,
      orderId: order.id,
      paymentSummary,
      aiStudioStatus: await getAiStudioSystemStatus(params.prisma)
    };
  }

  const verifiedPayment = await verifyConfirmedYooKassaPaymentForOrder({
    orderId: order.id,
    metadata: order.metadata,
    providerPaymentId: params.providerPaymentId
  });

  if (!isConfirmedYooKassaPayment(verifiedPayment)) {
    return {
      ok: true,
      status: verifiedPayment.status,
      applied: false,
      orderId: order.id,
      paymentSummary,
      aiStudioStatus: await getAiStudioSystemStatus(params.prisma)
    };
  }

  if (orderPaymentStatus === "preparing") {
    return {
      ok: true,
      status: "preparing",
      applied: false,
      orderId: order.id,
      paymentSummary,
      aiStudioStatus: "preparing"
    };
  }

  if (order.confirmed && orderPaymentStatus === "completed") {
    return {
      ok: true,
      status: "already_confirmed",
      applied: false,
      orderId: order.id,
      paymentSummary,
      aiStudioStatus: await getAiStudioSystemStatus(params.prisma)
    };
  }

  await applyConfirmedOrder({
    prisma: params.prisma,
    order: {
      ...order,
      type: order.type as OrderType
    }
  });

  const aiStudioStatus = await getAiStudioSystemStatus(params.prisma);
  const finalOrderStatus = await getOrderPaymentStatus(params.prisma, order.id);

  return {
    ok: true,
    status: finalOrderStatus === "preparing" ? "preparing" : "succeeded",
    applied: true,
    orderId: order.id,
    paymentSummary,
    aiStudioStatus
  };
}

export async function confirmYooKassaOrderAfterReturn(params: {
  prisma: PrismaClient;
  userId: string;
  orderId: string;
}): Promise<PaymentOrderResult> {
  const order = await params.prisma.orders.findFirst({
    where: {
      id: params.orderId,
      userId: params.userId
    },
    select: {
      id: true,
      userId: true,
      type: true,
      confirmed: true,
      metadata: true
    }
  });

  if (!order) {
    return { ok: false, status: "not_found", applied: false, error: "Order not found" };
  }

  const paymentSummary = readAiTokenPaymentSummary(order.metadata) ?? readSubscriptionPaymentSummary(order.metadata);
  const orderPaymentStatus = await getOrderPaymentStatus(params.prisma, order.id);

  if (orderPaymentStatus === "preparing") {
    return {
      ok: true,
      status: "preparing",
      applied: false,
      orderId: order.id,
      paymentSummary,
      aiStudioStatus: "preparing"
    };
  }

  if (order.confirmed && orderPaymentStatus === "completed") {
    return {
      ok: true,
      status: "already_confirmed",
      applied: false,
      orderId: order.id,
      paymentSummary,
      aiStudioStatus: await getAiStudioSystemStatus(params.prisma)
    };
  }

  const verifiedPayment = await verifyConfirmedYooKassaPaymentForOrder({
    orderId: order.id,
    metadata: order.metadata
  });
  if (!isConfirmedYooKassaPayment(verifiedPayment)) {
    return {
      ok: true,
      status: verifiedPayment.status,
      applied: false,
      orderId: order.id,
      paymentSummary,
      aiStudioStatus: await getAiStudioSystemStatus(params.prisma)
    };
  }

  await applyConfirmedOrder({
    prisma: params.prisma,
    order: {
      ...order,
      type: order.type as OrderType
    }
  });

  const aiStudioStatus = await getAiStudioSystemStatus(params.prisma);
  const finalOrderStatus = await getOrderPaymentStatus(params.prisma, order.id);

  return {
    ok: true,
    status: finalOrderStatus === "preparing" ? "preparing" : "succeeded",
    applied: true,
    orderId: order.id,
    paymentSummary,
    aiStudioStatus
  };
}
