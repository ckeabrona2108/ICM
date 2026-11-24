import assert from "node:assert/strict";
import test from "node:test";

import { settleImportRoyalty } from "../commission-settings";

const row = { importId: "i", userId: "u", gross: 5638.41, net: 3383.05 };

test("without a report the import numbers stay", () => {
  assert.deepEqual(settleImportRoyalty(row, null), { gross: 5638.41, net: 3383.05, commission: 2255.36, adjusted: false });
});

test("an untouched report changes nothing", () => {
  assert.deepEqual(settleImportRoyalty(row, 3383.05), { gross: 5638.41, net: 3383.05, commission: 2255.36, adjusted: false });
});

test("a replaced report moves money from commission to the artist", () => {
  assert.deepEqual(settleImportRoyalty(row, 4563.49), { gross: 5638.41, net: 4563.49, commission: 1074.92, adjusted: true });
});

test("a report above the import counts the extra as received, without commission", () => {
  assert.deepEqual(
    settleImportRoyalty({ importId: "i", userId: "u", gross: 3451.09, net: 3451.09 }, 6009.92),
    { gross: 6009.92, net: 6009.92, commission: 0, adjusted: true }
  );
});
