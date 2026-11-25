import assert from "node:assert/strict";
import test from "node:test";

import { classifyReleaseOrderPayment, isSurplusOrder, ORDER_SURPLUS_KEY } from "@/lib/release-order-surplus";
import { summarizeOpenReleaseOrders } from "@/lib/release-payment-guard";

test("a payment for an unpaid release covers it", () => {
  const outcome = classifyReleaseOrderPayment({ release: { confirmed: false, roles: {} }, orderId: "o1", isSupplement: false });
  assert.deepEqual(outcome, { kind: "covers" });
});

test("a card payment on a release covered by a partner code is a surplus", () => {
  const outcome = classifyReleaseOrderPayment({
    release: { confirmed: true, roles: { paymentUsage: { type: "partner_code" } } },
    orderId: "o1",
    isSupplement: false
  });
  assert.deepEqual(outcome, { kind: "surplus", coveredBy: "partner_code" });
});

test("a second card payment is a surplus, the recorded one is not", () => {
  const release = { confirmed: true, roles: { paymentUsage: { type: "standalone_payment", orderId: "o1" } } };
  assert.deepEqual(classifyReleaseOrderPayment({ release, orderId: "o1", isSupplement: false }), { kind: "already_applied" });
  assert.deepEqual(classifyReleaseOrderPayment({ release, orderId: "o2", isSupplement: false }), {
    kind: "surplus",
    coveredBy: "standalone_payment"
  });
});

test("a release marked paid by an admin without a payment record just notes the order", () => {
  const outcome = classifyReleaseOrderPayment({ release: { confirmed: true, roles: {} }, orderId: "o1", isSupplement: false });
  assert.deepEqual(outcome, { kind: "record" });
});

test("a second supplement payment is a surplus", () => {
  const roles = {
    paymentUsage: { type: "standalone_payment", orderId: "base" },
    extrasSupplement: { paid: { lyrics: 0, karaoke: 0, video: 0 }, amountRub: 75, requestedAt: "2026-11-01T00:00:00Z", paidAt: "2026-11-02T00:00:00Z", orderId: "s1" }
  };
  const release = { confirmed: true, roles };
  assert.deepEqual(classifyReleaseOrderPayment({ release, orderId: "s1", isSupplement: true }), { kind: "already_applied" });
  assert.deepEqual(classifyReleaseOrderPayment({ release, orderId: "s2", isSupplement: true }), {
    kind: "surplus",
    coveredBy: "extras_supplement"
  });
});

test("surplus orders are recognised by their metadata", () => {
  assert.equal(isSurplusOrder({ [ORDER_SURPLUS_KEY]: { coveredBy: "partner_code" } }), true);
  assert.equal(isSurplusOrder({ releaseId: "r" }), false);
});

const now = new Date("2026-11-25T12:00:00.000Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

test("a waiting invoice is offered again instead of a new payment", () => {
  const summary = summarizeOpenReleaseOrders(
    [
      { id: "new", createdAt: minutesAgo(10), metadata: { amountRub: 450 }, payment: { status: "pending", confirmationUrl: "https://pay/new", providerPaymentId: "p-new" } },
      { id: "old", createdAt: minutesAgo(60), metadata: { amountRub: 450 }, payment: { status: "pending", confirmationUrl: "https://pay/old", providerPaymentId: "p-old" } }
    ],
    now
  );
  assert.equal(summary.processing, false);
  assert.deepEqual(summary.reusable, { orderId: "new", providerPaymentId: "p-new", confirmationUrl: "https://pay/new", amountRub: 450 });
});

test("a payment being confirmed right now or held for capture blocks other ways to pay", () => {
  const fresh = summarizeOpenReleaseOrders(
    [{ id: "a", createdAt: minutesAgo(1), metadata: {}, payment: { status: "pending", confirmationUrl: null, providerPaymentId: "p" } }],
    now
  );
  assert.equal(fresh.processing, true);
  const held = summarizeOpenReleaseOrders(
    [{ id: "a", createdAt: minutesAgo(30), metadata: {}, payment: { status: "waiting_for_capture", confirmationUrl: null, providerPaymentId: "p" } }],
    now
  );
  assert.equal(held.processing, true);
});

test("succeeded and cancelled payments are told apart", () => {
  const summary = summarizeOpenReleaseOrders(
    [
      { id: "paid", createdAt: minutesAgo(30), metadata: {}, payment: { status: "succeeded", confirmationUrl: null, providerPaymentId: "p1" } },
      { id: "gone", createdAt: minutesAgo(30), metadata: {}, payment: { status: "canceled", confirmationUrl: "https://pay/x", providerPaymentId: "p2" } }
    ],
    now
  );
  assert.deepEqual(summary.succeeded, ["paid"]);
  assert.equal(summary.reusable, null);
  assert.equal(summary.processing, false);
});
