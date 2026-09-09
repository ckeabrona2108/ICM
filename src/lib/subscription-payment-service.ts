import type { Prisma, PrismaClient } from "@prisma/client";

import * as aiStudioActivation from "@/lib/ai-studio-activation";
import * as aiTokenService from "@/lib/ai-token-service";
import {
  getSubscriptionTariffConfig,
  normalizeSubscriptionBillingPeriod,
  type SubscriptionBillingPeriod,
  type SubscriptionTariffId
} from "@/lib/subscription-billing";
import * as subscriptionLimits from "@/lib/subscription-limits";

type TxClient = Prisma.TransactionClient;

type LockedSubscriptionOrder = {
  id: string;
  userId: string;
  confirmed: boolean;
  payment_status: string;
  metadata: unknown;
};

export type SubscriptionGrantOutcome =
  | "granted"
  | "already_granted"
  | "queued";

export interface SubscriptionGrantResult {
  outcome: SubscriptionGrantOutcome;
  paymentStatus: "completed" | "preparing";
  aiStudioStatus: "preparing" | "active";
  orderId: string;
  userId: string;
  tariffId: SubscriptionTariffId;
  billingPeriod: SubscriptionBillingPeriod;
  amountRub: number;
  providerPaymentId: string | null;
  endsAt: Date | null;
}

export interface SubscriptionRepairCandidate {
  orderId: string;
  userId: string;
  createdAt: string;
  tariffId: SubscriptionTariffId;
  billingPeriod: SubscriptionBillingPeriod;
  amountRub: number;
  providerPaymentId: string | null;
  orderConfirmed: boolean;
  orderPaymentStatus: string;
  providerStatus: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  entitlementActive: boolean;
  entitlementPlan: string | null;
  entitlementEndsAt: string | null;
  repairAction: "grant_and_complete" | "complete_order_only";
}

type ParsedSubscriptionOrder = {
  tariffId: SubscriptionTariffId;
  billingPeriod: SubscriptionBillingPeriod;
  amountRub: number;
  providerPaymentId: string | null;
};

function readMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeTariffId(value: unknown): SubscriptionTariffId | null {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "standard" || normalized === "pro" || normalized === "enterprise") {
    return normalized;
  }
  return null;
}

function parseAmountRub(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

export function readConfirmedSubscriptionPayment(metadata: unknown): ParsedSubscriptionOrder {
  const payload = readMetadata(metadata);
  const tariffId = normalizeTariffId(payload.tariffId);
  if (!tariffId) {
    throw new Error("Subscription payment metadata is missing a valid tariffId.");
  }

  const billingPeriod = normalizeSubscriptionBillingPeriod(payload.billingPeriod);
  const tariffConfig = getSubscriptionTariffConfig(tariffId, billingPeriod);
  if (!tariffConfig) {
    throw new Error(`Subscription tariff config was not found for ${tariffId}.`);
  }

  const amountRub = parseAmountRub(payload.amountRub);
  if (amountRub != null && amountRub != tariffConfig.amountRub) {
    throw new Error(
      `Subscription payment amount mismatch for ${tariffId}:${billingPeriod}. Expected ${tariffConfig.amountRub}, received ${amountRub}.`
    );
  }

  return {
    tariffId,
    billingPeriod,
    amountRub: amountRub ?? tariffConfig.amountRub,
    providerPaymentId:
      typeof payload.providerPaymentId === "string" && payload.providerPaymentId.trim().length > 0
        ? payload.providerPaymentId.trim()
        : null
  };
}

async function lockSubscriptionOrder(tx: TxClient, orderId: string): Promise<LockedSubscriptionOrder | null> {
  const rows = await tx.$queryRawUnsafe<LockedSubscriptionOrder[]>(
    `
      SELECT
        id,
        "userId" AS "userId",
        confirmed,
        payment_status,
        metadata
      FROM "icecream"."orders"
      WHERE id = $1::uuid
        AND type = 'subscription'
      FOR UPDATE
    `,
    orderId
  );

  return rows[0] ?? null;
}

export async function grantSubscriptionFromConfirmedPayment(params: {
  prisma: PrismaClient;
  orderId: string;
  completedAt?: Date;
}): Promise<SubscriptionGrantResult> {
  const completedAt = params.completedAt ?? new Date();

  return params.prisma.$transaction(async (tx) => {
    const order = await lockSubscriptionOrder(tx, params.orderId);
    if (!order) {
      throw new Error("Subscription order not found.");
    }

    const parsed = readConfirmedSubscriptionPayment(order.metadata);
    const aiStudioStatus = await aiStudioActivation.getAiStudioSystemStatus(tx);

    if (order.payment_status === "completed") {
      const user = await tx.user.findUnique({
        where: { id: order.userId },
        select: { expiresAt: true }
      });
      return {
        outcome: "already_granted",
        paymentStatus: "completed",
        aiStudioStatus,
        orderId: order.id,
        userId: order.userId,
        tariffId: parsed.tariffId,
        billingPeriod: parsed.billingPeriod,
        amountRub: parsed.amountRub,
        providerPaymentId: parsed.providerPaymentId,
        endsAt: user?.expiresAt ?? null
      };
    }

    if (order.confirmed) {
      const finalStatus =
        aiStudioStatus === "preparing" && order.payment_status === "preparing"
          ? "preparing"
          : "completed";

      await aiStudioActivation.setOrderPaymentStatus({
        prisma: tx,
        orderId: order.id,
        status: finalStatus,
        completedAt: finalStatus === "completed" ? completedAt : null
      });

      const user = await tx.user.findUnique({
        where: { id: order.userId },
        select: { expiresAt: true }
      });
      return {
        outcome: "already_granted",
        paymentStatus: finalStatus,
        aiStudioStatus,
        orderId: order.id,
        userId: order.userId,
        tariffId: parsed.tariffId,
        billingPeriod: parsed.billingPeriod,
        amountRub: parsed.amountRub,
        providerPaymentId: parsed.providerPaymentId,
        endsAt: user?.expiresAt ?? null
      };
    }

    const subscription = await subscriptionLimits.applySubscriptionUpgrade({
      tx,
      userId: order.userId,
      plan: subscriptionLimits.mapTariffToPlan(parsed.tariffId)
    });

    if (aiStudioStatus === "preparing") {
      const queued = await aiTokenService.queueAiTokensForSubscriptionBonus({
        prisma: tx,
        userId: order.userId,
        tariffId: parsed.tariffId,
        billingPeriod: parsed.billingPeriod
      });
      if (!queued.ok) {
        throw new Error(queued.error);
      }

      await tx.orders.update({
        where: { id: order.id },
        data: { confirmed: true }
      });

      await aiStudioActivation.setOrderPaymentStatus({
        prisma: tx,
        orderId: order.id,
        status: "preparing",
        completedAt: null
      });

      return {
        outcome: "queued",
        paymentStatus: "preparing",
        aiStudioStatus,
        orderId: order.id,
        userId: order.userId,
        tariffId: parsed.tariffId,
        billingPeriod: parsed.billingPeriod,
        amountRub: parsed.amountRub,
        providerPaymentId: parsed.providerPaymentId,
        endsAt: subscription.endsAt
      };
    }

    const bonusGrant = await aiTokenService.grantAiTokensForSubscriptionBonus({
      prisma: tx,
      userId: order.userId,
      tariffId: parsed.tariffId,
      billingPeriod: parsed.billingPeriod,
      providerPaymentId: parsed.providerPaymentId,
      orderId: order.id
    });
    if (!bonusGrant.ok) {
      throw new Error(bonusGrant.error);
    }

    await tx.orders.update({
      where: { id: order.id },
      data: { confirmed: true }
    });

    await aiStudioActivation.setOrderPaymentStatus({
      prisma: tx,
      orderId: order.id,
      status: "completed",
      completedAt
    });

    return {
      outcome: "granted",
      paymentStatus: "completed",
      aiStudioStatus,
      orderId: order.id,
      userId: order.userId,
      tariffId: parsed.tariffId,
      billingPeriod: parsed.billingPeriod,
      amountRub: parsed.amountRub,
      providerPaymentId: parsed.providerPaymentId,
      endsAt: subscription.endsAt
    };
  });
}

export async function listSubscriptionRepairCandidates(params: {
  prisma: PrismaClient;
  providerStatusResolver: (providerPaymentId: string) => Promise<"pending" | "waiting_for_capture" | "succeeded" | "canceled">;
  limit?: number;
}): Promise<SubscriptionRepairCandidate[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 50, 250));
  const rows = await params.prisma.$queryRawUnsafe<
    Array<{
      id: string;
      userId: string;
      confirmed: boolean;
      payment_status: string;
      createdAt: Date;
      metadata: unknown;
      isSubscribed: boolean;
      subscribeLevel: string | null;
      expiresAt: Date | null;
    }>
  >(
    `
      SELECT
        o.id,
        o."userId" AS "userId",
        o.confirmed,
        o.payment_status,
        o."createdAt" AS "createdAt",
        o.metadata,
        u."isSubscribed" AS "isSubscribed",
        u."subscribeLevel" AS "subscribeLevel",
        u."expiresAt" AS "expiresAt"
      FROM "icecream"."orders" o
      JOIN "icecream"."user" u
        ON u.id = o."userId"
      WHERE o.type = 'subscription'
      ORDER BY o."createdAt" DESC
      LIMIT $1
    `,
    limit
  );

  const candidates: SubscriptionRepairCandidate[] = [];
  const now = Date.now();

  for (const row of rows) {
    let parsed: ParsedSubscriptionOrder;
    try {
      parsed = readConfirmedSubscriptionPayment(row.metadata);
    } catch {
      continue;
    }

    if (!parsed.providerPaymentId) continue;

    const providerStatus = await params.providerStatusResolver(parsed.providerPaymentId);
    if (providerStatus !== "succeeded") continue;

    const entitlementActive =
      Boolean(row.isSubscribed) &&
      Boolean(row.expiresAt && row.expiresAt.getTime() > now);

    if (row.confirmed && row.payment_status === "completed") continue;
    if (!row.confirmed && entitlementActive) continue;

    candidates.push({
      orderId: row.id,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
      tariffId: parsed.tariffId,
      billingPeriod: parsed.billingPeriod,
      amountRub: parsed.amountRub,
      providerPaymentId: parsed.providerPaymentId,
      orderConfirmed: row.confirmed,
      orderPaymentStatus: row.payment_status,
      providerStatus,
      entitlementActive,
      entitlementPlan: row.subscribeLevel,
      entitlementEndsAt: row.expiresAt?.toISOString() ?? null,
      repairAction: row.confirmed ? "complete_order_only" : "grant_and_complete"
    });
  }

  return candidates;
}
