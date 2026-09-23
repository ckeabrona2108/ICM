import assert from "node:assert/strict";
import test from "node:test";

import { resolveNetReportRightsAmounts } from "@/lib/finance-client";

test("report detail rights are reduced to the net amount after commission", () => {
  const amounts = resolveNetReportRightsAmounts({
    amount: 5.76,
    authorAmount: 4.8,
    relatedAmount: 4.8
  });

  assert.deepEqual(amounts, { authorAmount: 2.88, relatedAmount: 2.88 });
  assert.equal(Number(((amounts.authorAmount ?? 0) + (amounts.relatedAmount ?? 0)).toFixed(2)), 5.76);
});

test("report detail keeps a single rights amount aligned with the net line", () => {
  assert.deepEqual(
    resolveNetReportRightsAmounts({ amount: 5.76, authorAmount: 9.59, relatedAmount: null }),
    { authorAmount: 5.76, relatedAmount: null }
  );
});
