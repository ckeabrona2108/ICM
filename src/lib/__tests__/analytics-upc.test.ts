import assert from "node:assert/strict";
import test from "node:test";

import { normalizeAnalyticsUpc } from "@/lib/analytics-upc";

test("normalizeAnalyticsUpc keeps plain numeric UPC intact", () => {
  assert.equal(normalizeAnalyticsUpc("5063635661195"), "5063635661195");
});

test("normalizeAnalyticsUpc normalizes number-like UPC to comparable string", () => {
  assert.equal(normalizeAnalyticsUpc(5063635661195), "5063635661195");
  assert.equal(normalizeAnalyticsUpc("5063635661195.0"), "5063635661195");
  assert.equal(normalizeAnalyticsUpc("5.063635044004E12"), "5063635044004");
});

test("normalizeAnalyticsUpc removes spaces and invisible characters preserving digits", () => {
  assert.equal(normalizeAnalyticsUpc(" 5063\u200B635661195 "), "5063635661195");
});

test("normalizeAnalyticsUpc preserves leading zeros", () => {
  assert.equal(normalizeAnalyticsUpc("0001234567890"), "0001234567890");
});
