import assert from "node:assert/strict";
import test from "node:test";

import { getSmartLinkCountDelta, getSmartLinkRateDelta } from "@/lib/smart-link-stats";

test("getSmartLinkCountDelta compares two periods in percent", () => {
  assert.deepEqual(getSmartLinkCountDelta(112, 100), { text: "+12%", tone: "up" });
  assert.deepEqual(getSmartLinkCountDelta(91, 100), { text: "−9%", tone: "down" });
  assert.deepEqual(getSmartLinkCountDelta(100, 100), { text: "0%", tone: "flat" });
});

test("getSmartLinkCountDelta handles empty periods", () => {
  assert.equal(getSmartLinkCountDelta(0, 0), null);
  assert.deepEqual(getSmartLinkCountDelta(5, 0), { text: "новое", tone: "up" });
  assert.deepEqual(getSmartLinkCountDelta(0, 4), { text: "−100%", tone: "down" });
});

test("getSmartLinkRateDelta reports percentage points", () => {
  assert.deepEqual(getSmartLinkRateDelta({ hits: 33, total: 100 }, { hits: 34, total: 100 }), { text: "−1 п.п.", tone: "down" });
  assert.deepEqual(getSmartLinkRateDelta({ hits: 40, total: 100 }, { hits: 30, total: 100 }), { text: "+10 п.п.", tone: "up" });
  assert.equal(getSmartLinkRateDelta({ hits: 1, total: 2 }, { hits: 0, total: 0 }), null);
});
