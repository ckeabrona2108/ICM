import type { PrismaClient } from "@prisma/client";

import {
  buildStandalonePaymentUsage,
  mergeReleaseRolesPaymentUsage
} from "@/lib/release-quota";
import { getYooKassaPaymentStatus, type YooKassaPaymentStatus } from "@/lib/yookassa";

type OrderType = "subscription" | "release";

interface PaymentOrderResult {
  ok: boolean;
  status: YooKassaPaymentStatus | "not_found" | "already_confirmed";
  applied: boolean;
  orderId?: string;
  error?: string;
}

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function mapTariffToSubscribeLevel(value: unknown): "standard" | "professional" | "enterprise" {
  const tariff = typeof value === "string" ? value.trim().toLowerCase() : "standard";
  if (tariff === "enterprise") return "enterprise";
  if (tariff === "pro") return "professional";
  return "standard";
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
  if (params.order.confirmed) return;

  const metadata = readMetadata(params.order.metadata);
  await params.prisma.orders.update({
    where: { id: params.order.id },
    data: { confirmed: true }
  });

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
          roles: mergeReleaseRolesPaymentUsage(
            release?.roles ?? null,
            buildStandalonePaymentUsage({ orderId: params.order.id })
          )
        }
      });
    }
    return;
  }

  if (params.order.type === "subscription") {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30);
    await params.prisma.user.update({
      where: { id: params.order.userId },
      data: {
        isSubscribed: true,
        subscribeLevel: mapTariffToSubscribeLevel(metadata.tariffId),
        expiresAt
      }
    });
  }
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

  if (params.status !== "succeeded") {
    return { ok: true, status: params.status, applied: false, orderId: order.id };
  }

  if (order.confirmed) {
    return { ok: true, status: "already_confirmed", applied: false, orderId: order.id };
  }

  await applyConfirmedOrder({
    prisma: params.prisma,
    order: {
      ...order,
      type: order.type as OrderType
    }
  });

  return { ok: true, status: "succeeded", applied: true, orderId: order.id };
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

  if (order.confirmed) {
    return { ok: true, status: "already_confirmed", applied: false, orderId: order.id };
  }

  const metadata = readMetadata(order.metadata);
  const providerPaymentId =
    typeof metadata.providerPaymentId === "string" ? metadata.providerPaymentId.trim() : "";
  if (!providerPaymentId) {
    return {
      ok: false,
      status: "not_found",
      applied: false,
      orderId: order.id,
      error: "Provider payment id is missing"
    };
  }

  const paymentStatus = await getYooKassaPaymentStatus(providerPaymentId);
  if (paymentStatus !== "succeeded") {
    return { ok: true, status: paymentStatus, applied: false, orderId: order.id };
  }

  await applyConfirmedOrder({
    prisma: params.prisma,
    order: {
      ...order,
      type: order.type as OrderType
    }
  });

  return { ok: true, status: "succeeded", applied: true, orderId: order.id };
}
