import assert from "node:assert/strict";
import test from "node:test";

import { getServiceStatus } from "@/lib/service-status";

function fromMoscowTime(hour: number, minute: number): Date {
  return new Date(Date.UTC(2026, 0, 1, hour - 3, minute, 0, 0));
}

test("07:50 MSK -> service is not working, starts in 10 min", () => {
  const status = getServiceStatus(fromMoscowTime(7, 50));
  assert.equal(status.isWorking, false);
  assert.equal(status.label, "Сервис не работает");
  assert.match(status.description, /через 10 мин/i);
  assert.equal(status.minutesUntilChange, 10);
});

test("08:00 MSK -> service is working", () => {
  const status = getServiceStatus(fromMoscowTime(8, 0));
  assert.equal(status.isWorking, true);
  assert.equal(status.label, "Сервис работает");
  assert.equal(status.minutesUntilChange, 13 * 60);
});

test("20:59 MSK -> service is working, 1 minute left", () => {
  const status = getServiceStatus(fromMoscowTime(20, 59));
  assert.equal(status.isWorking, true);
  assert.match(status.description, /1 мин/i);
  assert.equal(status.minutesUntilChange, 1);
});

test("21:00 MSK -> service is not working", () => {
  const status = getServiceStatus(fromMoscowTime(21, 0));
  assert.equal(status.isWorking, false);
  assert.equal(status.minutesUntilChange, 11 * 60);
  assert.match(status.description, /завтра в 08:00/i);
});

test("22:00 MSK -> service is not working, starts in 10 hours", () => {
  const status = getServiceStatus(fromMoscowTime(22, 0));
  assert.equal(status.isWorking, false);
  assert.match(status.description, /через 10 ч/i);
  assert.equal(status.minutesUntilChange, 10 * 60);
});

