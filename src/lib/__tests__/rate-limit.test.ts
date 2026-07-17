import assert from "node:assert/strict";
import test from "node:test";

import { consumeRateLimit, getRequestIp } from "@/lib/rate-limit";

test("rate limit blocks requests above the configured window limit", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  assert.equal(consumeRateLimit({ key, limit: 2, windowMs: 1_000 }, 1_000).allowed, true);
  assert.equal(consumeRateLimit({ key, limit: 2, windowMs: 1_000 }, 1_100).allowed, true);
  const blocked = consumeRateLimit({ key, limit: 2, windowMs: 1_000 }, 1_200);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 1);
});

test("rate limit resets after the window", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  consumeRateLimit({ key, limit: 1, windowMs: 1_000 }, 1_000);
  assert.equal(consumeRateLimit({ key, limit: 1, windowMs: 1_000 }, 1_500).allowed, false);
  assert.equal(consumeRateLimit({ key, limit: 1, windowMs: 1_000 }, 2_001).allowed, true);
});

test("rate limit uses the trusted proxy address instead of a spoofed first forwarded value", () => {
  const request = new Request("https://example.test", {
    headers: {
      "x-forwarded-for": "198.51.100.10, 203.0.113.20",
      "x-real-ip": "203.0.113.30"
    }
  });
  assert.equal(getRequestIp(request), "203.0.113.30");
});
