import assert from "node:assert/strict";
import test from "node:test";

import {
  getWebhookMetadata,
  getWebhookPaymentId,
  getWebhookStatus,
  isConfirmedYooKassaPayment,
  isYooKassaWebhookAuthorized,
  parseYooKassaWebhookPayload
} from "@/lib/yookassa";

test("parseYooKassaWebhookPayload parses valid payload", () => {
  const payload = parseYooKassaWebhookPayload({
    event: "payment.succeeded",
    object: {
      id: "2f6f-123",
      status: "succeeded",
      metadata: {
        tariffId: "pro"
      }
    }
  });

  assert.ok(payload);
  assert.equal(getWebhookPaymentId(payload!), "2f6f-123");
  assert.equal(getWebhookStatus(payload!), "succeeded");
  assert.equal(getWebhookMetadata(payload!).tariffId, "pro");
});

test("parseYooKassaWebhookPayload rejects invalid payload", () => {
  const payload = parseYooKassaWebhookPayload(null);
  assert.equal(payload, null);
});

test("isYooKassaWebhookAuthorized accepts matching secret and rejects mismatch", () => {
  const previous = process.env.YOOKASSA_WEBHOOK_SECRET;
  process.env.YOOKASSA_WEBHOOK_SECRET = "feed-secret";

  assert.equal(isYooKassaWebhookAuthorized("https://example.test/api/payments/yookassa/webhook?secret=feed-secret"), true);
  assert.equal(isYooKassaWebhookAuthorized("https://example.test/api/payments/yookassa/webhook?secret=wrong"), false);

  if (previous === undefined) {
    delete process.env.YOOKASSA_WEBHOOK_SECRET;
  } else {
    process.env.YOOKASSA_WEBHOOK_SECRET = previous;
  }
});

test("isConfirmedYooKassaPayment requires succeeded paid RUB payment", () => {
  assert.equal(
    isConfirmedYooKassaPayment({ status: "succeeded", paid: true, currency: "RUB" }),
    true
  );
  assert.equal(
    isConfirmedYooKassaPayment({ status: "pending", paid: true, currency: "RUB" }),
    false
  );
  assert.equal(
    isConfirmedYooKassaPayment({ status: "succeeded", paid: false, currency: "RUB" }),
    false
  );
  assert.equal(
    isConfirmedYooKassaPayment({ status: "succeeded", paid: true, currency: "USD" }),
    false
  );
});
