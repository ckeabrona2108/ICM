// Admin-only summary of a finance import preview: where the money in the file comes from and where it goes.

export type FinanceOverviewRow = {
  id: string;
  action: string;
  detected_match_rule?: string | null;
  error_message?: string | null;
  user_id?: string | null;
  matched_release_id?: string | null;
  gross_amount?: string | number | null;
  net_amount?: string | number | null;
  commission_amount?: string | number | null;
  raw_data?: Record<string, unknown> | null;
  normalized_data?: Record<string, unknown> | null;
};

export type FinanceFileMeta = {
  headerRowIndex?: number;
  sourceRows?: number;
  headers?: string[];
  preamble?: Array<{ label: string; value: string }>;
  footerTotals?: Record<string, number>;
  skippedFooterRows?: number;
};

export type FinanceBreakdownItem = { name: string; amount: number; quantity: number; rows: number };

export type FinanceUnmatchedItem = {
  key: string;
  identifier: string;
  title: string;
  artist: string;
  amount: number;
  rows: number;
  reason: string;
};

export type FinanceReconciliationLine = {
  label: string;
  fileTotal: number | null;
  readTotal: number;
  difference: number | null;
};

export type FinanceImportOverview = {
  sourceRows: number;
  groups: number;
  totalAmount: number;
  authorAmount: number;
  relatedAmount: number;
  quantity: number;
  matched: { groups: number; amount: number; artists: number; releases: number };
  unmatched: { groups: number; amount: number };
  toArtists: number;
  commission: number;
  byPlatform: FinanceBreakdownItem[];
  byPeriod: FinanceBreakdownItem[];
  byUsageType: FinanceBreakdownItem[];
  byRule: Array<{ rule: string; label: string; groups: number; amount: number }>;
  unmatchedItems: FinanceUnmatchedItem[];
  reconciliation: FinanceReconciliationLine[];
};

const APPLIED_ACTIONS = new Set(["MATCH", "UPDATE", "NEEDS_REVIEW"]);

export const FINANCE_RULE_LABELS: Record<string, string> = {
  FINANCIAL_UPC: "По UPC",
  FINANCIAL_ISRC: "По ISRC",
  FINANCIAL_CODE: "По коду партнёра",
  FINANCIAL_TITLE_ARTIST: "По названию и артисту",
  NOT_FOUND: "Не найдено в каталоге",
  MISSING_UPC: "Нет идентификатора",
  AMBIGUOUS: "Несколько вариантов",
  ARTIST_MISMATCH: "Артист не совпал"
};

const REASON_TRANSLATIONS: Record<string, string> = {
  "UPC was not found in catalog.": "UPC не найден в каталоге.",
  "Financial row is missing UPC.": "В строке нет UPC."
};

function toNumber(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function incomingValues(row: FinanceOverviewRow): Record<string, unknown> {
  const preview = row.normalized_data?.__preview as Record<string, unknown> | undefined;
  return (preview?.incoming_values as Record<string, unknown> | undefined) ?? {};
}

function normalizedValue(row: FinanceOverviewRow, key: string): string {
  return text(row.normalized_data?.[key]) || text(incomingValues(row)[key]);
}

type SourceRow = {
  platformName?: string | null;
  amount?: number | null;
  quantity?: number | null;
  usagePeriod?: string | null;
  usageType?: string | null;
  authorAmount?: number | null;
  relatedAmount?: number | null;
};

function sourceRowsOf(row: FinanceOverviewRow): SourceRow[] {
  const data = row.raw_data?.SourceRowsData;
  if (Array.isArray(data) && data.length > 0) return data as SourceRow[];
  return [
    {
      platformName: normalizedValue(row, "platform") || null,
      amount: toNumber(row.gross_amount),
      quantity: toNumber(normalizedValue(row, "quantity")),
      usagePeriod: normalizedValue(row, "usage_period") || null,
      usageType: normalizedValue(row, "usage_type") || null,
      authorAmount: normalizedValue(row, "royalty_author") ? toNumber(normalizedValue(row, "royalty_author")) : null,
      relatedAmount: normalizedValue(row, "royalty_related") ? toNumber(normalizedValue(row, "royalty_related")) : null
    }
  ];
}

function addTo(map: Map<string, FinanceBreakdownItem>, name: string, amount: number, quantity: number) {
  const item = map.get(name) ?? { name, amount: 0, quantity: 0, rows: 0 };
  item.amount += amount;
  item.quantity += quantity;
  item.rows += 1;
  map.set(name, item);
}

function finishBreakdown(map: Map<string, FinanceBreakdownItem>): FinanceBreakdownItem[] {
  return [...map.values()]
    .map((item) => ({ ...item, amount: round(item.amount) }))
    .sort((left, right) => right.amount - left.amount || left.name.localeCompare(right.name, "ru"));
}

/** Sort key for report periods like "07.2026", "10-12.2025", "2026-05-01". */
export function periodSortKey(period: string): number {
  const range = period.match(/^(\d{1,2})(?:-(\d{1,2}))?\.(\d{4})$/);
  if (range) return Number(range[3]) * 100 + Number(range[1]);
  const iso = period.match(/^(\d{4})-(\d{2})/);
  if (iso) return Number(iso[1]) * 100 + Number(iso[2]);
  return Number.MAX_SAFE_INTEGER;
}

function footerTotalFor(
  meta: FinanceFileMeta | null | undefined,
  detectedColumns: Record<string, string> | null | undefined,
  canonical: string
): number | null {
  const header = detectedColumns?.[canonical];
  if (!header || !meta?.footerTotals) return null;
  const value = meta.footerTotals[header];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function buildFinanceImportOverview(params: {
  rows: FinanceOverviewRow[];
  fileMeta?: FinanceFileMeta | null;
  detectedColumns?: Record<string, string> | null;
}): FinanceImportOverview {
  const byPlatform = new Map<string, FinanceBreakdownItem>();
  const byPeriod = new Map<string, FinanceBreakdownItem>();
  const byUsageType = new Map<string, FinanceBreakdownItem>();
  const byRule = new Map<string, { rule: string; label: string; groups: number; amount: number }>();
  const unmatchedItems: FinanceUnmatchedItem[] = [];
  const artists = new Set<string>();
  const releases = new Set<string>();

  let sourceRows = 0;
  let totalAmount = 0;
  let authorAmount = 0;
  let relatedAmount = 0;
  let quantity = 0;
  let matchedGroups = 0;
  let matchedAmount = 0;
  let unmatchedAmount = 0;
  let toArtists = 0;
  let commission = 0;

  for (const row of params.rows) {
    const gross = toNumber(row.gross_amount);
    const applied = Boolean(row.user_id) && APPLIED_ACTIONS.has(row.action);
    const sources = sourceRowsOf(row);
    totalAmount += gross;
    sourceRows += sources.length;

    for (const source of sources) {
      const amount = toNumber(source.amount);
      const sourceQuantity = toNumber(source.quantity);
      quantity += sourceQuantity;
      authorAmount += toNumber(source.authorAmount);
      relatedAmount += toNumber(source.relatedAmount);
      addTo(byPlatform, text(source.platformName) || "Без площадки", amount, sourceQuantity);
      addTo(byPeriod, text(source.usagePeriod) || "Без периода", amount, sourceQuantity);
      addTo(byUsageType, text(source.usageType) || "Не указан", amount, sourceQuantity);
    }

    const rule = row.detected_match_rule || (applied ? "MATCH" : "NOT_FOUND");
    const ruleItem = byRule.get(rule) ?? { rule, label: FINANCE_RULE_LABELS[rule] ?? rule, groups: 0, amount: 0 };
    ruleItem.groups += 1;
    ruleItem.amount += gross;
    byRule.set(rule, ruleItem);

    if (applied) {
      matchedGroups += 1;
      matchedAmount += gross;
      toArtists += toNumber(row.net_amount);
      commission += toNumber(row.commission_amount);
      if (row.user_id) artists.add(row.user_id);
      if (row.matched_release_id) releases.add(row.matched_release_id);
      continue;
    }

    unmatchedAmount += gross;
    const preview = row.normalized_data?.__preview as Record<string, unknown> | undefined;
    const reason = text(preview?.reason) || text(row.error_message);
    unmatchedItems.push({
      key: row.id,
      identifier:
        normalizedValue(row, "upc") || normalizedValue(row, "internal_code") || normalizedValue(row, "isrc") || "—",
      title: normalizedValue(row, "title") || "—",
      artist: normalizedValue(row, "artist") || "—",
      amount: round(gross),
      rows: sources.length,
      reason: REASON_TRANSLATIONS[reason] ?? (reason || FINANCE_RULE_LABELS[rule] || "Не сопоставлено")
    });
  }

  const reconciliation: FinanceReconciliationLine[] = [];
  const pushLine = (label: string, canonical: string, readTotal: number) => {
    const fileTotal = footerTotalFor(params.fileMeta, params.detectedColumns, canonical);
    if (fileTotal === null && canonical !== "total") return;
    reconciliation.push({
      label,
      fileTotal,
      readTotal: round(readTotal),
      difference: fileTotal === null ? null : round(readTotal - fileTotal)
    });
  };
  pushLine("Авторские", "royalty_author", authorAmount);
  pushLine("Смежные", "royalty_related", relatedAmount);
  pushLine("Итого", "royalty_total", totalAmount);
  pushLine("Количество", "quantity", quantity);
  const authorFooter = footerTotalFor(params.fileMeta, params.detectedColumns, "royalty_author");
  const relatedFooter = footerTotalFor(params.fileMeta, params.detectedColumns, "royalty_related");
  const hasTotalLine = reconciliation.some((line) => line.label === "Итого");
  if (!hasTotalLine && authorFooter !== null && relatedFooter !== null) {
    const fileTotal = round(authorFooter + relatedFooter);
    reconciliation.splice(2, 0, {
      label: "Итого",
      fileTotal,
      readTotal: round(totalAmount),
      difference: round(totalAmount - fileTotal)
    });
  }

  return {
    sourceRows,
    groups: params.rows.length,
    totalAmount: round(totalAmount),
    authorAmount: round(authorAmount),
    relatedAmount: round(relatedAmount),
    quantity,
    matched: { groups: matchedGroups, amount: round(matchedAmount), artists: artists.size, releases: releases.size },
    unmatched: { groups: params.rows.length - matchedGroups, amount: round(unmatchedAmount) },
    toArtists: round(toArtists),
    commission: round(commission),
    byPlatform: finishBreakdown(byPlatform),
    byPeriod: finishBreakdown(byPeriod).sort((left, right) => periodSortKey(left.name) - periodSortKey(right.name)),
    byUsageType: finishBreakdown(byUsageType),
    byRule: [...byRule.values()]
      .map((item) => ({ ...item, amount: round(item.amount) }))
      .sort((left, right) => right.amount - left.amount),
    unmatchedItems: unmatchedItems.sort((left, right) => right.amount - left.amount),
    reconciliation
  };
}
