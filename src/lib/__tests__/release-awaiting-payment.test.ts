import assert from "node:assert/strict";
import test from "node:test";

import { isReleaseAwaitingPayment } from "@/lib/release-awaiting-payment";
import { getReleaseStatusDescriptor } from "@/lib/release-status-ui";
import { buildReleaseModerationTelegramText } from "@/lib/telegram-notifier";

test("a sent but unpaid release waits for payment, not for a moderator", () => {
  const sent = { status: "moderating", roles: { lifecycleState: "moderation" } };
  assert.equal(isReleaseAwaitingPayment({ ...sent, confirmed: false }), true);
  assert.equal(isReleaseAwaitingPayment({ ...sent, confirmed: true }), false);
  // A draft or a release the artist pulled back is not waiting for payment.
  assert.equal(isReleaseAwaitingPayment({ status: "moderating", confirmed: false, roles: { lifecycleState: "draft" } }), false);
  assert.equal(
    isReleaseAwaitingPayment({ status: "moderating", confirmed: false, roles: { lifecycleState: "changes_required" } }),
    false
  );
});

test("a copy of a paid release waits only while added extras are unpaid", () => {
  const copy = { lifecycleState: "moderation", resubmission: { resubmittedAt: "2026-11-18T10:00:00.000Z", sourceReleaseId: "src" } };
  assert.equal(isReleaseAwaitingPayment({ status: "moderating", confirmed: false, roles: copy }), false);
  assert.equal(
    isReleaseAwaitingPayment({
      status: "moderating",
      confirmed: false,
      roles: { ...copy, extrasSupplement: { paid: { lyrics: 0, karaoke: 0, video: 0 }, amountRub: 75, requestedAt: "2026-11-18T10:00:00.000Z" } }
    }),
    true
  );
});

test("the artist sees «Ожидает оплаты» for an unpaid release on moderation", () => {
  assert.equal(getReleaseStatusDescriptor("moderation", false)?.label, "Ожидает оплаты");
  assert.equal(getReleaseStatusDescriptor("moderation", true)?.label, "На модерации");
  assert.equal(getReleaseStatusDescriptor("moderation")?.label, "На модерации");
  assert.equal(getReleaseStatusDescriptor("approved", false)?.label, "Принят");
});

test("the admin Telegram says when a release enters the queue after payment", () => {
  assert.equal(
    buildReleaseModerationTelegramText({ releaseTitle: "Ночью", artistName: "Олег", paid: true }),
    "Релиз оплачен и ждёт модерации: Ночью — Олег"
  );
  assert.equal(buildReleaseModerationTelegramText({ releaseTitle: "Ночью", artistName: "Олег" }), "Релиз на модерацию: Ночью — Олег");
});
