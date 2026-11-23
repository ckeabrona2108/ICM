import assert from "node:assert/strict";
import test from "node:test";

import {
  describeReleaseShare,
  reportLineSharePercent,
  reportLineShares,
  sharePercentFromRate,
  withReportLineShares
} from "@/lib/release-share";

const AFTER = "2026-11-25T10:00:00.000Z";
const BEFORE = "2026-09-12T10:00:00.000Z";

test("only 10, 5 and 0% commission turn into a share", () => {
  assert.equal(sharePercentFromRate(0.1), 90);
  assert.equal(sharePercentFromRate(0.05), 95);
  assert.equal(sharePercentFromRate(0), 100);
  assert.equal(sharePercentFromRate(0.4), null);
  assert.equal(sharePercentFromRate(0.15), null);
  assert.equal(sharePercentFromRate(Number.NaN), null);
});

test("tariff releases name the subscription", () => {
  const share = describeReleaseShare({ kind: "tariff", plan: "PRO" }, 0.05);
  assert.equal(share?.percent, 95);
  assert.equal(share?.title, "Подписка PRO");
  assert.match(share?.upsell ?? "", /ENTERPRISE/u);
  assert.equal(describeReleaseShare({ kind: "tariff", plan: "ENTERPRISE" }, 0)?.upsell, null);
});

test("old releases on the global rate show 90%, and nothing while the global rate is not 10%", () => {
  assert.equal(describeReleaseShare({ kind: "global", payment: "unknown" }, 0.1)?.percent, 90);
  assert.equal(describeReleaseShare({ kind: "global", payment: "unknown" }, 0.4), null);
  assert.equal(describeReleaseShare({ kind: "global", payment: "free_first_release" }, 0.1)?.title, "Бесплатный релиз");
});

test("contract, individual and label rates are never shown", () => {
  assert.equal(describeReleaseShare({ kind: "contract" }, 0.1), null);
  assert.equal(describeReleaseShare({ kind: "user" }, 0.1), null);
  assert.equal(describeReleaseShare({ kind: "label" }, 0), null);
});

test("a report line share comes from its own numbers", () => {
  assert.equal(reportLineSharePercent({ amount: 90, authorAmount: 60, relatedAmount: 40 }), 90);
  assert.equal(reportLineSharePercent({ amount: 9.5, authorAmount: 10, relatedAmount: null }), 95);
  assert.equal(reportLineSharePercent({ amount: 0.9, authorAmount: 1, relatedAmount: 0 }), 90);
  assert.equal(reportLineSharePercent({ amount: 60, authorAmount: 100, relatedAmount: 0 }), null);
  assert.equal(reportLineSharePercent({ amount: 60, authorAmount: null, relatedAmount: null }), null);
});

test("reports before the tariff shares never get the column", () => {
  const items = [{ amount: 90, authorAmount: 100, relatedAmount: 0 }];
  assert.equal(reportLineShares({ createdAt: BEFORE, items }), null);
  assert.deepEqual(reportLineShares({ createdAt: AFTER, items }), [90]);
});

test("one line without an exact share hides the whole column", () => {
  const items = [
    { amount: 90, authorAmount: 100, relatedAmount: 0 },
    { amount: 60, authorAmount: 100, relatedAmount: 0 }
  ];
  assert.equal(reportLineShares({ createdAt: AFTER, items }), null);
  const lines = withReportLineShares({ createdAt: AFTER, items });
  assert.ok(lines.every((line) => !("sharePercent" in line)));
});
