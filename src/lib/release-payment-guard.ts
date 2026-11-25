import type { PrismaClient } from "@prisma/client";

import { applyYooKassaWebhookOrder } from "@/lib/payment-order-service";
import { getYooKassaPayment, type YooKassaPaymentDetails } from "@/lib/yookassa";

/** Same window as the in-app reconciliation: an invoice from the last two weeks may still be paid. */
export const OPEN_ORDER_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
/** A YooKassa payment the artist may still be confirming (3-D Secure, SBP, bank app). */
const PROCESSING_WINDOW_MS = 3 * 60 * 1000;

export type OpenReleasePaymentState = "paid" | "processing" | "none";

/** An invoice of this release still waiting for the payer: the artist is sent back to it. */
export interface ReusableReleaseInvoice {
  orderId: string;
  providerPaymentId: string;
  confirmationUrl: string;
  amountRub: number | null;
}

export interface OpenReleaseOrdersResult {
  state: OpenReleasePaymentState;
  /** Newest invoice still waiting for the payer, with its payment page. */
  reusable: ReusableReleaseInvoice | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readAmountRub(metadata: Record<string, unknown> | null): number | null {
  const value = metadata?.amountRub;
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

/** Decides from YooKassa's answers what the open orders mean. Orders are newest first. */
export function summarizeOpenReleaseOrders(
  orders: ReadonlyArray<{
    id: string;
    createdAt: Date | null;
    metadata: unknown;
    payment: Pick<YooKassaPaymentDetails, "status" | "confirmationUrl" | "providerPaymentId"> | null;
  }>,
  now: Date
): { processing: boolean; succeeded: string[]; reusable: ReusableReleaseInvoice | null } {
  let processing = false;
  let reusable: ReusableReleaseInvoice | null = null;
  const succeeded: string[] = [];
  for (const order of orders) {
    const payment = order.payment;
    if (!payment) continue;
    if (payment.status === "succeeded") {
      succeeded.push(order.id);
      continue;
    }
    const metadata = asRecord(order.metadata);
    const confirmationUrl =
      payment.confirmationUrl ?? (typeof metadata?.confirmationUrl === "string" ? metadata.confirmationUrl : null);
    if (payment.status === "pending" && confirmationUrl && !reusable) {
      reusable = {
        orderId: order.id,
        providerPaymentId: payment.providerPaymentId,
        confirmationUrl,
        amountRub: readAmountRub(metadata)
      };
    }
    const createdAt = order.createdAt ? order.createdAt.getTime() : 0;
    // Money held for capture, or a payment being confirmed right now, must not be paid twice.
    if (
      payment.status === "waiting_for_capture" ||
      (payment.status === "pending" && now.getTime() - createdAt < PROCESSING_WINDOW_MS)
    ) {
      processing = true;
    }
  }
  return { processing, succeeded, reusable };
}

/**
 * Looks at the release's unconfirmed orders and asks YooKassa about them. A payment that already
 * went through is applied right away ("paid"); one being confirmed right now means no other way
 * of covering the release may start yet ("processing"). An invoice still waiting for the payer
 * is returned so "Pay" opens it again instead of starting a second payment for the same release.
 */
export async function settleOpenReleaseOrders(params: {
  prisma: PrismaClient;
  userId: string;
  releaseId: string;
  now?: Date;
}): Promise<OpenReleaseOrdersResult> {
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

  const checked = await Promise.all(
    orders.map(async (order) => {
      const providerPaymentId = asRecord(order.metadata)?.providerPaymentId;
      if (typeof providerPaymentId !== "string" || !providerPaymentId.trim()) return { ...order, payment: null };
      try {
        return { ...order, payment: await getYooKassaPayment(providerPaymentId) };
      } catch (error) {
        console.error("[release:pay] failed to check an open order", { orderId: order.id, error });
        return { ...order, payment: null };
      }
    })
  );
  const summary = summarizeOpenReleaseOrders(checked, now);

  let paid = false;
  for (const orderId of summary.succeeded) {
    const order = checked.find((item) => item.id === orderId);
    const providerPaymentId = order?.payment?.providerPaymentId ?? null;
    try {
      const applied = await applyYooKassaWebhookOrder({
        prisma: params.prisma,
        orderId,
        providerPaymentId,
        status: "succeeded"
      });
      if (applied.ok) paid = true;
    } catch (error) {
      console.error("[release:pay] failed to apply a paid order", { orderId, error });
    }
  }

  if (paid) return { state: "paid", reusable: null };
  return { state: summary.processing ? "processing" : "none", reusable: summary.reusable };
}
