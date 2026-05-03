import assert from "node:assert/strict";
import test from "node:test";

import { validatePayoutRequest, type PayoutRequestInput } from "@/lib/finance-policy";

function validRequest(): PayoutRequestInput {
  return {
    amount: 120,
    availableBalance: 500,
    pendingReportsCount: 0,
    minimumPayoutAmount: 100,
    reportStatuses: ["agreed", "agreed"],
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

test("validatePayoutRequest blocks payout with pending reports", () => {
  const payload = validRequest();
  payload.pendingReportsCount = 1;

  const issues = validatePayoutRequest(payload);

  assert.ok(issues.some((issue) => issue.field === "pendingReportsCount"));
});

test("validatePayoutRequest blocks payout when report is not agreed", () => {
  const payload = validRequest();
  payload.reportStatuses = ["agreed", "ready_to_confirm"];

  const issues = validatePayoutRequest(payload);

  assert.ok(issues.some((issue) => issue.field === "reportStatuses"));
});

test("validatePayoutRequest validates minimum amount", () => {
  const payload = validRequest();
  payload.amount = 50;

  const issues = validatePayoutRequest(payload);
  assert.ok(issues.some((issue) => issue.field === "amount"));
});

test("validatePayoutRequest validates bank requisites", () => {
  const payload = validRequest();
  payload.requisites.bankName = "";
  payload.requisites.taxId = "";

  const issues = validatePayoutRequest(payload);

  assert.ok(issues.some((issue) => issue.field === "requisites.bankName"));
  assert.ok(issues.some((issue) => issue.field === "requisites.taxId"));
});

test("validatePayoutRequest validates paypal requisites", () => {
  const payload = validRequest();
  payload.requisites.payoutMethod = "paypal";
  payload.requisites.paypalEmail = "broken-mail";
  payload.requisites.accountNumber = "";

  const issues = validatePayoutRequest(payload);
  assert.ok(issues.some((issue) => issue.field === "requisites.paypalEmail"));
});

test("validatePayoutRequest accepts valid input", () => {
  const issues = validatePayoutRequest(validRequest());
  assert.equal(issues.length, 0);
});
