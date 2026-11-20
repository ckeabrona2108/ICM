/**
 * Reports an artist has not confirmed yet. Until a report is confirmed its money does not reach
 * the balance and no payout can be requested, yet artists often miss the one "new report" message.
 * The cabinet shows a banner on every page, and a reminder goes out once a week (no client imports
 * of server code here: the banner uses it too).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The first reminder waits two days after the newest report arrived. */
export const REPORT_CONFIRM_FIRST_AFTER_MS = 2 * DAY_MS;
/** Then once a week, and at most this many times after the newest report arrived. */
export const REPORT_CONFIRM_INTERVAL_MS = 7 * DAY_MS;
export const REPORT_CONFIRM_MAX_REMINDERS = 4;
export const REPORT_CONFIRM_KEY_PREFIX = "report_confirm_";
export const REPORT_CONFIRM_REMINDER_KIND = "report_confirm_reminder";

export interface ReportToConfirm {
  amount: number;
  quarterLabel: string;
  createdAt: string | Date;
  lifecycleState: string;
}

export interface ReportsToConfirmSummary {
  count: number;
  amount: number;
  /** Quarters oldest first, e.g. ["2 квартал 2026", "3 квартал 2026"]. */
  quarterLabels: string[];
  newestAt: Date | null;
}

export function summarizeReportsToConfirm(reports: ReadonlyArray<ReportToConfirm>): ReportsToConfirmSummary {
  const pending = reports
    .filter((report) => report.lifecycleState === "ready_to_confirm")
    .map((report) => ({ ...report, at: new Date(report.createdAt) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const amount = Math.round(pending.reduce((sum, report) => sum + (Number(report.amount) || 0), 0) * 100) / 100;
  return {
    count: pending.length,
    amount,
    quarterLabels: Array.from(new Set(pending.map((report) => report.quarterLabel))),
    newestAt: pending.length ? pending[pending.length - 1]!.at : null
  };
}

export function pluralReports(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "отчёт";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "отчёта";
  return "отчётов";
}

export function describeReportsToConfirm(summary: ReportsToConfirmSummary, formatAmount: (value: number) => string): string {
  const what = summary.count === 1
    ? `Отчёт за ${summary.quarterLabels[0] ?? "квартал"}`
    : `${summary.count} ${pluralReports(summary.count)}`;
  return `${what} на ${formatAmount(summary.amount)} ${summary.count === 1 ? "ждёт" : "ждут"} подтверждения. Подтвердите, и деньги попадут на баланс — после этого можно заказать выплату.`;
}

/**
 * Key of the reminder due now, or null. One reminder a week (keyed by the week, so a second run
 * the same week does nothing), starting two days after the newest report, at most four times.
 */
export function planReportConfirmReminder(params: {
  summary: ReportsToConfirmSummary;
  remindersSinceNewest: number;
  now: Date;
}): string | null {
  const { summary, now } = params;
  if (summary.count === 0 || !summary.newestAt) return null;
  if (now.getTime() - summary.newestAt.getTime() < REPORT_CONFIRM_FIRST_AFTER_MS) return null;
  if (params.remindersSinceNewest >= REPORT_CONFIRM_MAX_REMINDERS) return null;
  return `${REPORT_CONFIRM_KEY_PREFIX}w${Math.floor(now.getTime() / REPORT_CONFIRM_INTERVAL_MS)}`;
}
