import assert from "node:assert/strict";
import test from "node:test";

import {
  payoutRequestSchema,
  validatePayoutRequest,
  type PayoutRequestInput,
  type PayoutServerContext
} from "@/lib/finance-policy";

function validRequest(): PayoutRequestInput {
  return {
    amount: 120,
    requisites: {
      recipientName: "Nova Echo",
      payoutMethod: "bank_transfer",
      accountNumber: "ES9121000418450200051332",
      bankName: "Santander",
      paypalEmail: "",
      taxId: "A12345678"
    }
  };
}

function validContext(): PayoutServerContext {
  return {
    availableBalance: 500,
    pendingReportsCount: 0,
    minimumPayoutAmount: 100,
    reportStatuses: ["agreed", "agreed"]
  };
}

test("validatePayoutRequest blocks payout with pending reports", () => {
  const payload = validRequest();
  const context = validContext();
  context.pendingReportsCount = 1;
  const issues = validatePayoutRequest(payload, context);

  assert.ok(issues.some((issue) => issue.field === "pendingReportsCount"));
});

test("validatePayoutRequest blocks payout when report is not agreed", () => {
  const payload = validRequest();
  const context = validContext();
  context.reportStatuses = ["agreed", "ready_to_confirm"];
  const issues = validatePayoutRequest(payload, context);

  assert.ok(issues.some((issue) => issue.field === "reportStatuses"));
});

test("validatePayoutRequest validates minimum amount", () => {
  const payload = validRequest();
  payload.amount = 50;

  const issues = validatePayoutRequest(payload, validContext());
  assert.ok(issues.some((issue) => issue.field === "amount"));
});

test("validatePayoutRequest validates bank requisites", () => {
  const payload = validRequest();
  payload.requisites.bankName = "";
  payload.requisites.taxId = "";

  const issues = validatePayoutRequest(payload, validContext());

  assert.ok(issues.some((issue) => issue.field === "requisites.bankName"));
  assert.ok(issues.some((issue) => issue.field === "requisites.taxId"));
});

test("validatePayoutRequest validates paypal requisites", () => {
  const payload = validRequest();
  payload.requisites.payoutMethod = "paypal";
  payload.requisites.paypalEmail = "broken-mail";
  payload.requisites.accountNumber = "";

  const issues = validatePayoutRequest(payload, validContext());
  assert.ok(issues.some((issue) => issue.field === "requisites.paypalEmail"));
});

test("validatePayoutRequest accepts valid input", () => {
  const issues = validatePayoutRequest(validRequest(), validContext());
  assert.equal(issues.length, 0);
});

test("payout request schema ignores forged balance and report fields", () => {
  const parsed = payoutRequestSchema.parse({
    ...validRequest(),
    availableBalance: 999999,
    pendingReportsCount: 0,
    minimumPayoutAmount: 1,
    reportStatuses: []
  });
  assert.deepEqual(Object.keys(parsed).sort(), ["amount", "requisites"]);
});
