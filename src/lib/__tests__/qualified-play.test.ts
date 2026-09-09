import assert from "node:assert/strict";
import test from "node:test";

import { accumulateQualifiedPlayback, getQualifiedPlayThresholdSeconds } from "@/lib/qualified-play";

test("qualified play threshold is 30 seconds or half of a short preview", () => {
  assert.equal(getQualifiedPlayThresholdSeconds(120), 30);
  assert.equal(getQualifiedPlayThresholdSeconds(40), 20);
  assert.equal(getQualifiedPlayThresholdSeconds(10), 5);
  assert.equal(getQualifiedPlayThresholdSeconds(0), null);
  assert.equal(getQualifiedPlayThresholdSeconds(Number.POSITIVE_INFINITY), null);
});

test("qualified playback accumulates normal progress but ignores seeks", () => {
  assert.equal(accumulateQualifiedPlayback({ listenedSeconds: 4, previousMediaTime: 10, currentMediaTime: 10.5 }), 4.5);
  assert.equal(accumulateQualifiedPlayback({ listenedSeconds: 4, previousMediaTime: 10, currentMediaTime: 40 }), 4);
  assert.equal(accumulateQualifiedPlayback({ listenedSeconds: 4, previousMediaTime: 10, currentMediaTime: 3 }), 4);
  assert.equal(accumulateQualifiedPlayback({ listenedSeconds: 4, previousMediaTime: null, currentMediaTime: 1 }), 4);
});
