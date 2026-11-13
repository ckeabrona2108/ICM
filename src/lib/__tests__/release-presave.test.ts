import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultPreSaveDate,
  latestPreSaveDate,
  resolveVkStartDate,
  validatePreSaveDate
} from "@/lib/release-presave";

test("pre-save defaults to 7 days before the start and may be at most 2 days before it", () => {
  assert.equal(defaultPreSaveDate("2026-11-20"), "2026-11-13");
  assert.equal(latestPreSaveDate("2026-11-20"), "2026-11-18");
  assert.equal(defaultPreSaveDate("2026-03-03"), "2026-02-24");
  assert.equal(defaultPreSaveDate(""), "");
});

test("pre-save date validation", () => {
  const check = (preSaveDate: string, startDate = "2026-11-20") =>
    validatePreSaveDate({ preSaveDate, startDate, platform: "VK Музыки" });
  assert.equal(check("2026-11-13"), null);
  assert.equal(check("2026-11-18"), null);
  assert.equal(check("2026-11-01"), null);
  assert.equal(check("2026-11-19"), "Дата pre-save для VK Музыки должна быть не позднее чем за 2 дня до даты старта.");
  assert.equal(check("2026-11-25"), "Дата pre-save для VK Музыки должна быть не позднее чем за 2 дня до даты старта.");
  assert.equal(check("20.11.2026", "20.11.2026"), "Дата pre-save для VK Музыки должна быть не позднее чем за 2 дня до даты старта.");
  assert.equal(check(""), "Укажите корректную дату pre-save для VK Музыки.");
  assert.equal(check("2026-11-19", ""), null);
});

test("VK start falls back to the common start date", () => {
  assert.equal(resolveVkStartDate({ vkStartDate: "", startDate: "2026-11-20" }), "2026-11-20");
  assert.equal(resolveVkStartDate({ vkStartDate: "2026-11-22", startDate: "2026-11-20" }), "2026-11-22");
});
