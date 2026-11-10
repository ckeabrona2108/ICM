// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { parseCommissionPercent, rateToPercent, readGlobalCommissionRate } from "@/lib/commission-settings";

test("percent input is stored as a fraction", () => {
  assert.deepEqual(parseCommissionPercent("10"), { ok: true, rate: 0.1 });
  assert.deepEqual(parseCommissionPercent("12,5"), { ok: true, rate: 0.125 });
  assert.deepEqual(parseCommissionPercent("7.25 %"), { ok: true, rate: 0.0725 });
  assert.deepEqual(parseCommissionPercent(0), { ok: true, rate: 0 });
  assert.equal(rateToPercent(0.125), 12.5);
});

test("invalid percent is rejected", () => {
  for (const value of ["", "abc", "-1", "101", null]) {
    assert.equal(parseCommissionPercent(value).ok, false, String(value));
  }
});

test("a 0% global rate stays 0% and a missing one falls back to 10%", async () => {
  const withRate = (value_number) => ({ platform_settings: { findUnique: async () => (value_number === undefined ? null : { value_number }) } });
  assert.equal(await readGlobalCommissionRate(withRate("0.0000")), 0);
  assert.equal(await readGlobalCommissionRate(withRate("0.4000")), 0.4);
  assert.equal(await readGlobalCommissionRate(withRate(undefined)), 0.1);
});
