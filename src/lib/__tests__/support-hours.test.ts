import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSupportAutoReply,
  isSupportWorkingTime,
  lastSupportClose,
  nextSupportOpen
} from "../support-hours";

// Moscow is UTC+3: 09:00 MSK = 06:00Z, 18:00 MSK = 15:00Z. 2026-11-13 is a Friday.
const msk = (iso: string) => new Date(`${iso}+03:00`);

test("working time is Monday to Friday, 09:00–18:00 Moscow", () => {
  assert.equal(isSupportWorkingTime(msk("2026-11-11T09:00:00")), true);
  assert.equal(isSupportWorkingTime(msk("2026-11-11T17:59:00")), true);
  assert.equal(isSupportWorkingTime(msk("2026-11-11T18:00:00")), false);
  assert.equal(isSupportWorkingTime(msk("2026-11-11T08:59:00")), false);
  assert.equal(isSupportWorkingTime(msk("2026-11-14T12:00:00")), false); // Saturday
  assert.equal(isSupportWorkingTime(msk("2026-11-15T12:00:00")), false); // Sunday
});

test("next opening skips the weekend", () => {
  assert.deepEqual(nextSupportOpen(msk("2026-11-13T19:00:00")), msk("2026-11-16T09:00:00"));
  assert.deepEqual(nextSupportOpen(msk("2026-11-15T23:00:00")), msk("2026-11-16T09:00:00"));
  assert.deepEqual(nextSupportOpen(msk("2026-11-11T07:00:00")), msk("2026-11-11T09:00:00"));
  assert.deepEqual(nextSupportOpen(msk("2026-11-11T22:00:00")), msk("2026-11-12T09:00:00"));
});

test("last close is Friday evening during the weekend", () => {
  assert.deepEqual(lastSupportClose(msk("2026-11-15T12:00:00")), msk("2026-11-13T18:00:00"));
  assert.deepEqual(lastSupportClose(msk("2026-11-16T08:00:00")), msk("2026-11-13T18:00:00"));
  assert.deepEqual(lastSupportClose(msk("2026-11-11T20:00:00")), msk("2026-11-11T18:00:00"));
  assert.deepEqual(lastSupportClose(msk("2026-11-12T07:00:00")), msk("2026-11-11T18:00:00"));
});

test("auto-reply text on a day off", () => {
  assert.equal(
    buildSupportAutoReply(msk("2026-11-14T12:00:00")),
    [
      "Здравствуйте!",
      "Сегодня выходной, поэтому обращение может обрабатываться дольше обычного. Поддержка работает по будням с 9:00 до 18:00 по московскому времени.",
      "Ваша заявка сохранена. Писать повторно не нужно."
    ].join("\n\n")
  );
});

test("auto-reply on a weekday evening says it is after hours", () => {
  const evening = buildSupportAutoReply(msk("2026-11-11T21:00:00"));
  assert.match(evening, /^Здравствуйте!\n\nСейчас нерабочее время, поэтому обращение может обрабатываться дольше обычного\./);
  assert.match(evening, /Ваша заявка сохранена\. Писать повторно не нужно\.$/);
});
