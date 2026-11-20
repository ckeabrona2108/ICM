import assert from "node:assert/strict";
import test from "node:test";

import {
  describeReportsToConfirm,
  planReportConfirmReminder,
  REPORT_CONFIRM_MAX_REMINDERS,
  summarizeReportsToConfirm
} from "@/lib/report-confirm-reminder";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-20T09:00:00.000Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
const rub = (value: number) => `${value} ₽`;

const reports = [
  { amount: 1900, quarterLabel: "2 квартал 2026", createdAt: ago(40), lifecycleState: "ready_to_confirm" },
  { amount: 1000.5, quarterLabel: "3 квартал 2026", createdAt: ago(5), lifecycleState: "ready_to_confirm" },
  { amount: 700, quarterLabel: "1 квартал 2026", createdAt: ago(90), lifecycleState: "agreed" },
  { amount: 50, quarterLabel: "4 квартал 2025", createdAt: ago(100), lifecycleState: "changes_requested" }
];

test("only reports waiting for the artist are counted", () => {
  const summary = summarizeReportsToConfirm(reports);
  assert.equal(summary.count, 2);
  assert.equal(summary.amount, 2900.5);
  assert.deepEqual(summary.quarterLabels, ["2 квартал 2026", "3 квартал 2026"]);
  assert.equal(summary.newestAt?.toISOString(), ago(5));
  assert.match(describeReportsToConfirm(summary, rub), /^2 отчёта на 2900.5 ₽ ждут подтверждения/u);
  assert.match(describeReportsToConfirm(summarizeReportsToConfirm([reports[0]!]), rub), /^Отчёт за 2 квартал 2026 на 1900 ₽ ждёт/u);
});

test("the reminder waits two days, then goes once a week, at most four times", () => {
  const summary = summarizeReportsToConfirm(reports);
  const key = planReportConfirmReminder({ summary, remindersSinceNewest: 0, now });
  assert.match(key ?? "", /^report_confirm_w\d+$/u);
  // The same week gives the same key, so a second run that week sends nothing.
  assert.equal(planReportConfirmReminder({ summary, remindersSinceNewest: 0, now: new Date(now.getTime() + 60_000) }), key);
  assert.equal(planReportConfirmReminder({ summary, remindersSinceNewest: REPORT_CONFIRM_MAX_REMINDERS, now }), null);

  const fresh = summarizeReportsToConfirm([{ ...reports[1]!, createdAt: ago(1) }]);
  assert.equal(planReportConfirmReminder({ summary: fresh, remindersSinceNewest: 0, now }), null);
  assert.equal(planReportConfirmReminder({ summary: summarizeReportsToConfirm([]), remindersSinceNewest: 0, now }), null);
});
