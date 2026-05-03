import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAnalyticsPlatform } from "@/lib/analytics-platform";

test("normalizeAnalyticsPlatform maps known source aliases", () => {
  assert.equal(normalizeAnalyticsPlatform("yandex"), "Яндекс Музыка");
  assert.equal(normalizeAnalyticsPlatform("umavk"), "VK Музыка");
  assert.equal(normalizeAnalyticsPlatform("mts"), "МТС Музыка");
  assert.equal(normalizeAnalyticsPlatform("zvooq"), "Звук");
});

test("normalizeAnalyticsPlatform handles separators and spacing", () => {
  assert.equal(normalizeAnalyticsPlatform("yandex_music"), "Яндекс Музыка");
  assert.equal(normalizeAnalyticsPlatform("Apple-Music"), "Apple Music");
  assert.equal(normalizeAnalyticsPlatform("YT music"), "YouTube Music");
});

test("normalizeAnalyticsPlatform returns Unknown only for empty/unknown inputs", () => {
  assert.equal(normalizeAnalyticsPlatform(""), "Unknown");
  assert.equal(normalizeAnalyticsPlatform(" unk "), "Unknown");
});
