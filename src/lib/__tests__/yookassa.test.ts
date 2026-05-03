import assert from "node:assert/strict";
import test from "node:test";

import {
  getWebhookMetadata,
  getWebhookPaymentId,
  getWebhookStatus,
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
