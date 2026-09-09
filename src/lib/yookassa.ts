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

export interface YooKassaPaymentDetails {
  providerPaymentId: string;
  status: YooKassaPaymentStatus;
  paid: boolean;
  amountRub: number | null;
  currency: string | null;
  metadata: Record<string, string>;
  rawStatus: string | null;
}

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

function readWebhookSecret() {
  return process.env.YOOKASSA_WEBHOOK_SECRET?.trim() ?? "";
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

function parseAmountRub(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function normalizeMetadata(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
      if (typeof raw !== "string") return [];
      const normalized = raw.trim();
      return normalized ? [[key, normalized]] : [];
    })
  );
}

export function isYooKassaWebhookAuthorized(requestUrl: string): boolean {
  const secret = readWebhookSecret();
  if (!secret) return true;

  const url = new URL(requestUrl);
  const provided = url.searchParams.get("secret")?.trim() ?? "";
  return provided.length > 0 && provided === secret;
}

export function isConfirmedYooKassaPayment(details: Pick<YooKassaPaymentDetails, "status" | "paid" | "currency">): boolean {
  return details.status === "succeeded" && details.paid === true && (details.currency ?? "").toUpperCase() === "RUB";
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

export async function getYooKassaPayment(providerPaymentId: string): Promise<YooKassaPaymentDetails> {
  const { shopId, secretKey } = readYooKassaCredentials();
  const response = await fetch(`${YOOKASSA_API_BASE}/payments/${encodeURIComponent(providerPaymentId)}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${toBasicAuth(shopId, secretKey)}`
    }
  });

  const json = (await response.json().catch(() => null)) as
    | {
        id?: string;
        status?: string;
        paid?: boolean;
        amount?: { value?: string | number; currency?: string };
        metadata?: Record<string, string>;
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

  return {
    providerPaymentId: json?.id?.trim() || providerPaymentId,
    status: mapYooKassaStatus(json?.status),
    paid: Boolean(json?.paid),
    amountRub: parseAmountRub(json?.amount?.value),
    currency: typeof json?.amount?.currency === "string" ? json.amount.currency.trim().toUpperCase() : null,
    metadata: normalizeMetadata(json?.metadata),
    rawStatus: typeof json?.status === "string" ? json.status : null
  };
}

export async function getYooKassaPaymentStatus(
  providerPaymentId: string
): Promise<YooKassaPaymentStatus> {
  const payment = await getYooKassaPayment(providerPaymentId);
  return payment.status;
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
