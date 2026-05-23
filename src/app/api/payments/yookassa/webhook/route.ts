import { NextResponse } from "next/server";

import { applyYooKassaWebhookOrder } from "@/lib/payment-order-service";
import { prisma } from "@/lib/prisma";
import {
  getWebhookMetadata,
  getWebhookPaymentId,
  getWebhookStatus,
  parseYooKassaWebhookPayload
} from "@/lib/yookassa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const yooKassaPayload = parseYooKassaWebhookPayload(payload);
  const providerPaymentId = yooKassaPayload ? getWebhookPaymentId(yooKassaPayload) : null;
  const status = yooKassaPayload ? getWebhookStatus(yooKassaPayload) : "pending";
  const webhookMetadata = yooKassaPayload ? getWebhookMetadata(yooKassaPayload) : {};
  const orderId =
    typeof webhookMetadata.orderId === "string" && webhookMetadata.orderId.trim()
      ? webhookMetadata.orderId.trim()
      : payload && typeof payload === "object" && "orderId" in payload
        ? String((payload as { orderId?: unknown }).orderId ?? "").trim()
        : "";

  if (!orderId && !providerPaymentId) {
    return NextResponse.json({ error: "Order id or payment id is required" }, { status: 400 });
  }

  const result = await applyYooKassaWebhookOrder({
    prisma,
    orderId,
    providerPaymentId,
    status
  });

  if (!result.ok && result.status === "not_found") {
    return NextResponse.json({ error: result.error ?? "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, result }, { status: 200 });
}
