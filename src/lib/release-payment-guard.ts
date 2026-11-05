import type { PrismaClient } from "@prisma/client";

import { applyYooKassaWebhookOrder } from "@/lib/payment-order-service";
import { getYooKassaPayment } from "@/lib/yookassa";

const OPEN_ORDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** A YooKassa payment the artist may still be confirming (3-D Secure, SBP, bank app). */
const PROCESSING_WINDOW_MS = 3 * 60 * 1000;

export type OpenReleasePaymentState = "paid" | "processing" | "none";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Looks at the release's unconfirmed orders from the last day and asks YooKassa about them.
 * A payment that already went through is applied right away ("paid"); one that is still being
 * confirmed means a new payment must not be started yet ("processing"). This stops a second
 * charge when the artist comes back before the webhook arrives and presses "Pay" again.
 */
export async function settleOpenReleaseOrders(params: {
  prisma: PrismaClient;
  userId: string;
  releaseId: string;
  now?: Date;
}): Promise<OpenReleasePaymentState> {
  const now = params.now ?? new Date();
  const orders = await params.prisma.orders.findMany({
    where: {
      userId: params.userId,
      type: "release",
      confirmed: false,
      createdAt: { gte: new Date(now.getTime() - OPEN_ORDER_LOOKBACK_MS) },
      metadata: { path: ["releaseId"], equals: params.releaseId }
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, metadata: true }
  });

  let processing = false;
  for (const order of orders) {
    const providerPaymentId = asRecord(order.metadata)?.providerPaymentId;
    if (typeof providerPaymentId !== "string" || !providerPaymentId.trim()) continue;

    try {
      const payment = await getYooKassaPayment(providerPaymentId);
      if (payment.status === "succeeded") {
        const applied = await applyYooKassaWebhookOrder({
          prisma: params.prisma,
          orderId: order.id,
          providerPaymentId,
          status: "succeeded"
        });
        if (applied.ok) return "paid";
        continue;
      }
      const createdAt = order.createdAt ? order.createdAt.getTime() : 0;
      if (
        (payment.status === "pending" || payment.status === "waiting_for_capture") &&
        now.getTime() - createdAt < PROCESSING_WINDOW_MS
      ) {
        processing = true;
      }
    } catch (error) {
      console.error("[release:pay] failed to check an open order", { orderId: order.id, error });
    }
  }

  return processing ? "processing" : "none";
}
