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
    quarter: 2,
    year: 2026,
    taxStatus: "self_employed",
    requisites: {
      recipientName: "Nova Echo",
      payoutMethod: "bank_transfer",
      accountNumber: "ES9121000418450200051332",
      bankName: "Santander",
      bankBik: "044525225",
      taxId: "A12345678"
    },
    documents: {
      reportId: "11111111-1111-4111-8111-111111111111",
      supportingDocument: {
        key: "private/payout-documents/11111111-1111-4111-8111-111111111111/receipt.pdf",
        name: "receipt.pdf",
        size: 1024,
        contentType: "application/pdf"
      }
    }
  };
}

function validContext(): PayoutServerContext {
  return {
    availableBalance: 500,
    pendingReportsCount: 0,
    minimumPayoutAmount: 100,
    reportStatuses: ["agreed", "agreed"],
    selectedQuarterBalance: 500
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

test("validatePayoutRequest blocks payout outside payout window", () => {
  const issues = validatePayoutRequest(validRequest(), {
    ...validContext(),
    payoutWindowOpen: false,
    payoutWindowMessage: "Следующее окно выплат: 1-7 октября 2026."
  });

  assert.ok(issues.some((issue) => issue.field === "payoutWindow"));
});

test("validatePayoutRequest permits another quarter while a different payout is active", () => {
  const issues = validatePayoutRequest(validRequest(), {
    ...validContext(),
    payoutWindowOpen: true,
    duplicateQuarterRequest: false
  });

  assert.ok(!issues.some((issue) => issue.field === "activePayoutRequests"));
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

test("validatePayoutRequest validates bank BIK", () => {
  const payload = validRequest();
  payload.requisites.bankBik = "123";

  const issues = validatePayoutRequest(payload, validContext());
  assert.ok(issues.some((issue) => issue.field === "requisites.bankBik"));
});

test("validatePayoutRequest blocks a payout above the selected quarter balance", () => {
  const payload = validRequest();
  payload.amount = 300;
  const issues = validatePayoutRequest(payload, { ...validContext(), selectedQuarterBalance: 200 });
  assert.ok(issues.some((issue) => issue.field === "amount" && issue.message.includes("выбранному кварталу")));
});

test("validatePayoutRequest blocks a duplicate selected quarter", () => {
  const issues = validatePayoutRequest(validRequest(), { ...validContext(), duplicateQuarterRequest: true });
  assert.ok(issues.some((issue) => issue.field === "quarter"));
});

test("validatePayoutRequest requires receipt data for an individual", () => {
  const payload = validRequest();
  payload.taxStatus = "individual";
  const issues = validatePayoutRequest(payload, validContext());
  assert.ok(issues.some((issue) => issue.field === "documents.receiptDetails"));
});

test("validatePayoutRequest requires an individual's handwritten receipt acknowledgement", () => {
  const payload = validRequest();
  payload.taxStatus = "individual";
  payload.documents.receiptDetails = {
    passportSeries: "1234",
    passportNumber: "123456",
    passportIssuedBy: "ОВД",
    passportIssueDate: "2020-01-01",
    birthDate: "1990-01-01",
    registrationAddress: "Москва"
  };

  const issues = validatePayoutRequest(payload, validContext());
  assert.ok(issues.some((issue) => issue.field === "documents.receiptAcknowledged"));

  payload.documents.receiptAcknowledged = true;
  assert.equal(validatePayoutRequest(payload, validContext()).length, 0);
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
  assert.deepEqual(Object.keys(parsed).sort(), ["amount", "documents", "quarter", "requisites", "taxStatus", "year"]);
});
