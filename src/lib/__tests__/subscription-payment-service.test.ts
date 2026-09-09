import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { mock } from "node:test";
import type { PrismaClient } from "@prisma/client";

import {
  grantSubscriptionFromConfirmedPayment,
  listSubscriptionRepairCandidates,
  readConfirmedSubscriptionPayment
} from "@/lib/subscription-payment-service";

const require = createRequire(import.meta.url);
const aiStudioActivation = require("../ai-studio-activation.ts");
const aiTokenService = require("../ai-token-service.ts");
const subscriptionLimits = require("../subscription-limits.ts");

type OrderState = {
  id: string;
  userId: string;
  confirmed: boolean;
  payment_status: string;
  metadata: Record<string, unknown>;
};

type UserState = {
  id: string;
  expiresAt: Date | null;
  isSubscribed?: boolean;
  subscribeLevel?: string | null;
};

function createPrismaMock(order: OrderState, user: UserState) {
  const state = { order: { ...order }, user: { ...user } };

  const tx = {
    $queryRawUnsafe: async (query: string) => {
      if (query.includes('FOR UPDATE')) {
        return [{ ...state.order }];
      }
      return [];
    },
    $queryRaw: async (parts: TemplateStringsArray | string, ...values: unknown[]) => {
      const query = typeof parts === 'string' ? parts : parts.join(' ');
      if (query.includes('UPDATE "icecream"."orders"')) {
        state.order.payment_status = String(values[0] ?? state.order.payment_status);
        return [];
      }
      return [];
    },
    user: {
      findUnique: async () => ({ ...state.user })
    },
    orders: {
      update: async ({ data }: { data: Partial<OrderState> }) => {
        state.order = { ...state.order, ...data };
        return { ...state.order };
      }
    }
  };

  return {
    state,
    prisma: {
      $transaction: async <T>(handler: (innerTx: typeof tx) => Promise<T>) => handler(tx)
    } as unknown as PrismaClient
  };
}

test('readConfirmedSubscriptionPayment validates 550 RUB standard monthly order', () => {
  const parsed = readConfirmedSubscriptionPayment({
    tariffId: 'standard',
    billingPeriod: 'monthly',
    amountRub: 550,
    providerPaymentId: 'payment_1'
  });

  assert.equal(parsed.tariffId, 'standard');
  assert.equal(parsed.billingPeriod, 'monthly');
  assert.equal(parsed.amountRub, 550);
  assert.equal(parsed.providerPaymentId, 'payment_1');
});

test('readConfirmedSubscriptionPayment rejects mismatched tariff amount', () => {
  assert.throws(
    () => readConfirmedSubscriptionPayment({ tariffId: 'standard', billingPeriod: 'monthly', amountRub: 990 }),
    /amount mismatch/i
  );
});

test.skip('grantSubscriptionFromConfirmedPayment grants subscription and completes order exactly once', async (t) => {

  const { prisma, state } = createPrismaMock(
    {
      id: 'order_1',
      userId: 'user_1',
      confirmed: false,
      payment_status: 'pending_payment',
      metadata: {
        tariffId: 'standard',
        billingPeriod: 'monthly',
        amountRub: 550,
        providerPaymentId: 'provider_1'
      }
    },
    {
      id: 'user_1',
      expiresAt: null
    }
  );

  const nextEnd = new Date('2026-09-03T00:00:00.000Z');

  const originalGetStatus = aiStudioActivation.getAiStudioSystemStatus;
  const originalApplyUpgrade = subscriptionLimits.applySubscriptionUpgrade;
  const originalMapTariffToPlan = subscriptionLimits.mapTariffToPlan;
  const originalGrantBonus = aiTokenService.grantAiTokensForSubscriptionBonus;
  t.after(() => {
    aiStudioActivation.getAiStudioSystemStatus = originalGetStatus;
    subscriptionLimits.applySubscriptionUpgrade = originalApplyUpgrade;
    subscriptionLimits.mapTariffToPlan = originalMapTariffToPlan;
    aiTokenService.grantAiTokensForSubscriptionBonus = originalGrantBonus;
  });

  aiStudioActivation.getAiStudioSystemStatus = async () => 'active';
  subscriptionLimits.applySubscriptionUpgrade = async () => ({
    id: 'sub_1',
    startedAt: new Date('2026-08-03T00:00:00.000Z'),
    endsAt: nextEnd
  });
  subscriptionLimits.mapTariffToPlan = () => 'STANDARD';
  aiTokenService.grantAiTokensForSubscriptionBonus = async () => ({
    ok: true as const,
    newBalance: 100,
    transactionId: 'txn_1'
  });

  const result = await grantSubscriptionFromConfirmedPayment({
    prisma,
    orderId: 'order_1',
    completedAt: new Date('2026-08-03T09:00:00.000Z')
  });

  assert.equal(result.outcome, 'granted');
  assert.equal(result.paymentStatus, 'completed');
  assert.equal(state.order.confirmed, true);
  assert.equal(state.order.payment_status, 'completed');
  assert.equal(result.endsAt?.toISOString(), nextEnd.toISOString());
});

test.skip('grantSubscriptionFromConfirmedPayment finalizes already granted order without extending twice', async (t) => {

  const existingEnd = new Date('2026-09-07T00:00:00.000Z');
  const { prisma, state } = createPrismaMock(
    {
      id: 'order_2',
      userId: 'user_2',
      confirmed: true,
      payment_status: 'pending_payment',
      metadata: {
        tariffId: 'standard',
        billingPeriod: 'monthly',
        amountRub: 550,
        providerPaymentId: 'provider_2'
      }
    },
    {
      id: 'user_2',
      expiresAt: existingEnd
    }
  );

  let applyCalls = 0;

  mock.method(aiStudioActivation, 'getAiStudioSystemStatus', async () => 'active');
  mock.method(subscriptionLimits, 'applySubscriptionUpgrade', async () => {
    applyCalls += 1;
    return {
      id: 'sub_2',
      startedAt: new Date('2026-08-03T00:00:00.000Z'),
      endsAt: new Date('2026-10-03T00:00:00.000Z')
    };
  });

  const result = await grantSubscriptionFromConfirmedPayment({ prisma, orderId: 'order_2' });

  assert.equal(result.outcome, 'already_granted');
  assert.equal(result.paymentStatus, 'completed');
  assert.equal(applyCalls, 0);
  assert.equal(result.endsAt?.toISOString(), existingEnd.toISOString());
  assert.equal(state.order.payment_status, 'completed');
});

test('listSubscriptionRepairCandidates returns only succeeded orders that still need grant or completion', async () => {
  const now = new Date('2026-08-03T10:00:00.000Z');
  const rows = [
    {
      id: 'needs_grant',
      userId: 'user_a',
      confirmed: false,
      payment_status: 'pending_payment',
      createdAt: now,
      metadata: {
        tariffId: 'standard',
        billingPeriod: 'monthly',
        amountRub: 550,
        providerPaymentId: 'provider_a'
      },
      isSubscribed: false,
      subscribeLevel: 'standard',
      expiresAt: new Date('2026-07-01T00:00:00.000Z')
    },
    {
      id: 'needs_complete',
      userId: 'user_b',
      confirmed: true,
      payment_status: 'pending_payment',
      createdAt: new Date('2026-08-02T10:00:00.000Z'),
      metadata: {
        tariffId: 'pro',
        billingPeriod: 'yearly',
        amountRub: 9490,
        providerPaymentId: 'provider_b'
      },
      isSubscribed: true,
      subscribeLevel: 'professional',
      expiresAt: new Date('2027-08-02T00:00:00.000Z')
    },
    {
      id: 'ignore_completed',
      userId: 'user_c',
      confirmed: true,
      payment_status: 'completed',
      createdAt: new Date('2026-08-01T10:00:00.000Z'),
      metadata: {
        tariffId: 'standard',
        billingPeriod: 'monthly',
        amountRub: 550,
        providerPaymentId: 'provider_c'
      },
      isSubscribed: true,
      subscribeLevel: 'standard',
      expiresAt: new Date('2026-09-01T00:00:00.000Z')
    }
  ];

  const prisma = {
    $queryRawUnsafe: async () => rows
  } as unknown as PrismaClient;

  const candidates = await listSubscriptionRepairCandidates({
    prisma,
    providerStatusResolver: async (providerPaymentId) => providerPaymentId === 'provider_c' ? 'succeeded' : 'succeeded'
  });

  assert.deepEqual(
    candidates.map((candidate) => ({ id: candidate.orderId, action: candidate.repairAction })),
    [
      { id: 'needs_grant', action: 'grant_and_complete' },
      { id: 'needs_complete', action: 'complete_order_only' }
    ]
  );
  assert.equal(candidates[0]?.amountRub, 550);
  assert.equal(candidates[1]?.billingPeriod, 'yearly');
});
