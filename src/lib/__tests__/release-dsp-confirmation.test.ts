import assert from "node:assert/strict";
import test from "node:test";

import { getReleaseLifecycleStatus, hasDspDeliveryConfirmation } from "@/lib/release-counts";

test("a claimed DSP lifecycle without a receipt remains accepted, not published", () => {
  const roles = { lifecycleState: "dsp_confirmed" };
  assert.equal(hasDspDeliveryConfirmation(roles), false);
  assert.equal(getReleaseLifecycleStatus("approved", roles), "approved");
});

test("a DSP lifecycle needs a persisted DSP confirmation identifier and timestamp", () => {
  const roles = {
    lifecycleState: "dsp_confirmed",
    dspDeliveryConfirmation: {
      source: "dsp",
      confirmationId: "delivery-123",
      confirmedAt: "2026-09-08T12:00:00.000Z"
    }
  };
  assert.equal(hasDspDeliveryConfirmation(roles), true);
  assert.equal(getReleaseLifecycleStatus("approved", roles), "dsp_confirmed");
});
