import { NextResponse } from "next/server";

import { confirmEventTicketOrderPayment } from "@/lib/event-ticketing";
import { applyYooKassaWebhookOrder } from "@/lib/payment-order-service";
import { prisma } from "@/lib/prisma";
import {
  getWebhookMetadata,
  getWebhookPaymentId,
  getWebhookStatus,
  isYooKassaWebhookAuthorized,
  parseYooKassaWebhookPayload
} from "@/lib/yookassa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isYooKassaWebhookAuthorized(request.url)) {
    // Visible in `docker logs`: YooKassa notifications are rejected because the notification URL
    // in the YooKassa dashboard lacks the right ?secret= (YOOKASSA_WEBHOOK_SECRET).
    console.warn("[yookassa:webhook] rejected: secret mismatch", {
      hasSecretParam: new URL(request.url).searchParams.has("secret")
    });
    return NextResponse.json({ error: "Webhook secret mismatch" }, { status: 403 });
  }

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

  if (webhookMetadata.purpose === "event_ticket_order") {
    const result = await confirmEventTicketOrderPayment({
      orderId,
      providerPaymentId,
      status,
      rawPayload: payload,
      requestOrigin: new URL(request.url).origin,
      client: prisma
    });

    if (!result.ok && result.status === "not_found") {
      return NextResponse.json({ error: result.error ?? "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, result }, { status: 200 });
  }

  console.info("[yookassa:webhook] received", { orderId, providerPaymentId, status });
  let result: Awaited<ReturnType<typeof applyYooKassaWebhookOrder>>;
  try {
    result = await applyYooKassaWebhookOrder({
      prisma,
      orderId,
      providerPaymentId,
      status
    });
  } catch (error) {
    // Non-2xx makes YooKassa retry; the in-app reconciliation also picks the order up.
    console.error("[yookassa:webhook] failed to apply", { orderId, providerPaymentId, error });
    return NextResponse.json({ error: "Failed to apply payment" }, { status: 500 });
  }

  if (!result.ok && result.status === "not_found") {
    return NextResponse.json({ error: result.error ?? "Order not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, result }, { status: 200 });
}
