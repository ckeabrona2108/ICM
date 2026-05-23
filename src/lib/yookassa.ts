import { randomUUID } from "node:crypto";

interface YooKassaCreatePaymentParams {
  amountRub: number;
  description: string;
  returnUrl: string;
  customerEmail?: string | null;
  metadata?: Record<string, string>;
  idempotenceKey?: string;
}

interface YooKassaCreatePaymentResult {
  providerPaymentId: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  confirmationUrl?: string;
  expiresAt?: string;
}

export type YooKassaPaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

interface YooKassaWebhookPayload {
  event?: string;
  object?: {
    id?: string;
    status?: string;
    paid?: boolean;
    metadata?: Record<string, string>;
    expires_at?: string;
  };
}

const YOOKASSA_API_BASE = "https://api.yookassa.ru/v3";

function readYooKassaCredentials() {
  const shopId = process.env.YOOKASSA_SHOP_ID?.trim() ?? "";
  const secretKey = process.env.YOOKASSA_SECRET_KEY?.trim() ?? "";

  if (!shopId || !secretKey) {
    throw new Error("YOOKASSA credentials are not configured");
  }

  return { shopId, secretKey };
}

function toBasicAuth(shopId: string, secretKey: string): string {
  return Buffer.from(`${shopId}:${secretKey}`).toString("base64");
}

function mapYooKassaStatus(status: string | undefined) {
  if (status === "waiting_for_capture") return "waiting_for_capture" as const;
  if (status === "succeeded") return "succeeded" as const;
  if (status === "canceled") return "canceled" as const;
  return "pending" as const;
}

function normalizeReceiptDescription(value: string): string {
  const normalized = value.trim() || "Оплата ICECREAMMUSIC";
  return normalized.length > 128 ? normalized.slice(0, 128) : normalized;
}

export async function createYooKassaPayment(
  params: YooKassaCreatePaymentParams
): Promise<YooKassaCreatePaymentResult> {
  const { shopId, secretKey } = readYooKassaCredentials();
  const idempotenceKey = params.idempotenceKey ?? randomUUID();
  const customerEmail = params.customerEmail?.trim();

  const response = await fetch(`${YOOKASSA_API_BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
      Authorization: `Basic ${toBasicAuth(shopId, secretKey)}`
    },
    body: JSON.stringify({
      amount: {
        value: params.amountRub.toFixed(2),
        currency: "RUB"
      },
      capture: true,
      confirmation: {
        type: "redirect",
        return_url: params.returnUrl
      },
      description: params.description,
      ...(customerEmail
        ? {
            receipt: {
              customer: {
                email: customerEmail
              },
              items: [
                {
                  description: normalizeReceiptDescription(params.description),
                  quantity: "1.00",
                  amount: {
                    value: params.amountRub.toFixed(2),
                    currency: "RUB"
                  },
                  vat_code: 1,
                  payment_mode: "full_payment",
                  payment_subject: "service"
                }
              ]
            }
          }
        : {}),
      metadata: params.metadata ?? {}
    })
  });

  const json = (await response.json().catch(() => null)) as
    | {
        id?: string;
        status?: string;
        confirmation?: { confirmation_url?: string };
        expires_at?: string;
        description?: string;
      }
    | null;

  if (!response.ok || !json?.id) {
    throw new Error(
      `YooKassa create payment failed: ${response.status}${
        json?.description ? ` (${json.description})` : ""
      }`
    );
  }

  return {
    providerPaymentId: json.id,
    status: mapYooKassaStatus(json.status),
    confirmationUrl: json.confirmation?.confirmation_url,
    expiresAt: json.expires_at
  };
}

export async function getYooKassaPaymentStatus(
  providerPaymentId: string
): Promise<YooKassaPaymentStatus> {
  const { shopId, secretKey } = readYooKassaCredentials();
  const response = await fetch(`${YOOKASSA_API_BASE}/payments/${encodeURIComponent(providerPaymentId)}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${toBasicAuth(shopId, secretKey)}`
    }
  });

  const json = (await response.json().catch(() => null)) as
    | {
        status?: string;
        description?: string;
      }
    | null;

  if (!response.ok) {
    throw new Error(
      `YooKassa get payment failed: ${response.status}${
        json?.description ? ` (${json.description})` : ""
      }`
    );
  }

  return mapYooKassaStatus(json?.status);
}

export function parseYooKassaWebhookPayload(payload: unknown): YooKassaWebhookPayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return payload as YooKassaWebhookPayload;
}

export function getWebhookPaymentId(payload: YooKassaWebhookPayload): string | null {
  const id = payload.object?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function getWebhookStatus(payload: YooKassaWebhookPayload) {
  return mapYooKassaStatus(payload.object?.status);
}

export function getWebhookMetadata(payload: YooKassaWebhookPayload) {
  return payload.object?.metadata ?? {};
}
