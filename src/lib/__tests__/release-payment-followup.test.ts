import assert from "node:assert/strict";
import test from "node:test";

import {
  describeYooKassaCancellation,
  resolveDueReminderStage,
  withReleasePaymentWaitingSince
} from "@/lib/release-payment-followup";

const HOUR = 60 * 60 * 1000;
const start = new Date("2026-10-20T10:00:00Z");
const at = (hours: number) => new Date(start.getTime() + hours * HOUR);

test("reminders are due after 1h, 24h and 3 days, each once", () => {
  assert.equal(resolveDueReminderStage({ waitingSince: start, sentStage: 0, now: at(0.5) }), null);
  assert.equal(resolveDueReminderStage({ waitingSince: start, sentStage: 0, now: at(1) }), 1);
  assert.equal(resolveDueReminderStage({ waitingSince: start, sentStage: 1, now: at(5) }), null);
  assert.equal(resolveDueReminderStage({ waitingSince: start, sentStage: 1, now: at(24) }), 2);
  assert.equal(resolveDueReminderStage({ waitingSince: start, sentStage: 2, now: at(72) }), 3);
  assert.equal(resolveDueReminderStage({ waitingSince: start, sentStage: 3, now: at(200) }), null);
});

test("a missed schedule sends only the latest due reminder", () => {
  assert.equal(resolveDueReminderStage({ waitingSince: start, sentStage: 0, now: at(30) }), 2);
});

test("old unpaid releases without reminders are not reminded", () => {
  assert.equal(resolveDueReminderStage({ waitingSince: start, sentStage: 0, now: at(24 * 8) }), null);
});

test("payment waiting marker resets reminder progress", () => {
  const roles = withReleasePaymentWaitingSince({ paymentReminders: { stage: 3 }, lifecycleState: "moderation" }, start);
  assert.deepEqual(roles.paymentReminders, { waitingSince: start.toISOString(), stage: 0 });
  assert.equal(roles.lifecycleState, "moderation");
});

test("cancellation reasons map to clear messages", () => {
  assert.match(describeYooKassaCancellation("expired_on_confirmation"), /Время на оплату истекло/u);
  assert.match(describeYooKassaCancellation("insufficient_funds"), /Недостаточно средств/u);
  assert.match(describeYooKassaCancellation("something_new"), /Оплата не прошла/u);
  assert.match(describeYooKassaCancellation(null), /Оплата не прошла/u);
});
