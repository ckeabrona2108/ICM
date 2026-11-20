import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContractApprovedNotification,
  buildContractRejectedNotification,
  CONTRACT_APPROVED_KIND,
  CONTRACT_REJECTED_KIND
} from "@/lib/contract-notifications";
import { isVkNotificationKind } from "@/lib/vk-messages";
import { isTelegramNotificationKind } from "@/lib/telegram-notification-channel";

test("an approved contract welcomes the artist and names the contract", () => {
  const event = buildContractApprovedNotification({ userId: "u1", verificationId: "v1", contractNumber: 57, movedReleaseCount: 0 });
  assert.equal(event.kind, CONTRACT_APPROVED_KIND);
  assert.equal(event.id, "contract-approved-v1");
  assert.match(event.title, /Договор принят — добро пожаловать в ICECREAMMUSIC/u);
  assert.match(event.message, /Лицензионный договор № 57 подтверждён/u);
  assert.equal(event.href, "/dashboard/releases/new");
  assert.notEqual(event.sendEmail, false);
});

test("releases that waited for the contract are mentioned and linked", () => {
  const event = buildContractApprovedNotification({ userId: "u1", verificationId: "v1", contractNumber: null, movedReleaseCount: 2 });
  assert.match(event.message, /Лицензионный договор подтверждён/u);
  assert.match(event.message, /2 релиза, которые ждали договора, уже на модерации/u);
  assert.equal(event.href, "/dashboard/moderation");
});

test("a rejected or cancelled contract gives the reason", () => {
  const rejected = buildContractRejectedNotification({ userId: "u1", verificationId: "v1", reason: "Неверные паспортные данные", wasApproved: false, movedReleaseCount: 1 });
  assert.equal(rejected.kind, CONTRACT_REJECTED_KIND);
  assert.equal(rejected.title, "Договор не принят");
  assert.match(rejected.message, /^Причина: Неверные паспортные данные\. .*подпишите договор заново\. 1 релиз возвращён на доработку/u);
  const cancelled = buildContractRejectedNotification({ userId: "u1", verificationId: "v1", reason: "Нет подписи", wasApproved: true, movedReleaseCount: 0 });
  assert.equal(cancelled.title, "Договор аннулирован");
});

test("contract news goes to VK and Telegram too", () => {
  for (const kind of [CONTRACT_APPROVED_KIND, CONTRACT_REJECTED_KIND]) {
    assert.equal(isVkNotificationKind(kind), true);
    assert.equal(isTelegramNotificationKind(kind), true);
  }
});
