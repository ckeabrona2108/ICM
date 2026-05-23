// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import { PayoutMethod, PayoutRequestStatus } from "@prisma/client";

import { listAdminPayoutRequests, parsePayoutRequisites } from "@/lib/admin-payouts-service";

test("parsePayoutRequisites reads modern and legacy account fields", () => {
  const modern = parsePayoutRequisites({
    recipientName: "Иван Иванов",
    accountDetails: "40817810",
    bankName: "Сбербанк",
    taxId: "1234567890"
  });
  assert.equal(modern.recipientName, "Иван Иванов");
  assert.equal(modern.accountDetails, "40817810");
  assert.equal(modern.bankName, "Сбербанк");
  assert.equal(modern.taxId, "1234567890");

  const legacy = parsePayoutRequisites({
    recipientName: "Петр Петров",
    accountNumber: "40817811"
  });
  assert.equal(legacy.accountDetails, "40817811");
});

test("listAdminPayoutRequests returns all payout details for admin card", async () => {
  const prisma = {
    payoutRequest: {
      findMany: async () => [
        {
          id: "p1",
          amount: 3000,
          currency: "RUB",
          status: PayoutRequestStatus.REQUESTED,
          createdAt: new Date("2026-04-01T00:00:00.000Z"),
          updatedAt: new Date("2026-04-01T10:00:00.000Z"),
          processedAt: null,
          method: PayoutMethod.BANK_TRANSFER,
          requisites: {
            recipientName: "Вячеслав",
            accountNumber: "40817810000000000000",
            bankName: "Сбербанк",
            taxId: "1234567890"
          },
          comment: null,
          user: {
            id: "u1",
            name: "User 1",
            email: "u1@example.com"
          }
        }
      ]
    }
  } as any;

  const items = await listAdminPayoutRequests(prisma, 50);
  assert.equal(items.length, 1);
  assert.equal(items[0].user.id, "u1");
  assert.equal(items[0].recipientName, "Вячеслав");
  assert.equal(items[0].accountDetails, "40817810000000000000");
  assert.equal(items[0].bankName, "Сбербанк");
  assert.equal(items[0].taxId, "1234567890");
});
