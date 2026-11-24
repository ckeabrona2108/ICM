// Admin notes that the system writes into a finance report for itself. They hold
// file names and old/new sums, so the artist never sees them.
const INTERNAL_REPORT_COMMENT_PATTERNS = [/^Импорт\s+.+$/i, /^Персональная замена отчёта\./i];

export function artistVisibleReportComment(comment: string | null | undefined): string | null {
  const normalized = comment?.trim();
  if (!normalized) return null;
  if (INTERNAL_REPORT_COMMENT_PATTERNS.some((pattern) => pattern.test(normalized))) return null;
  return normalized;
}
