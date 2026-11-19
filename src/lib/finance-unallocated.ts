// Money left unallocated by applied finance imports, and the late "supplement" accruals that pay it out.
//
// A supplement is stored as its own financial import (file_format "supplement") whose rows copy the
// source rows. The source rows are never changed: a source row counts as paid while a confirmed
// supplement lists it, and returns to the pool when that supplement is rolled back.

export const SUPPLEMENT_FILE_FORMAT = "supplement";
export const SUPPLEMENT_KIND = "supplement";

/** Rules that may produce a supplement candidate. Title + artist matches are shown flagged for a check. */
export const SUPPLEMENT_RULES = new Set(["FINANCIAL_UPC", "FINANCIAL_ISRC", "FINANCIAL_CODE", "FINANCIAL_TITLE_ARTIST"]);
export const SUPPLEMENT_RULES_NEEDING_CHECK = new Set(["FINANCIAL_TITLE_ARTIST"]);

const APPLIED_ACTIONS = new Set(["MATCH", "UPDATE", "NEEDS_REVIEW"]);

export type SupplementSummary = {
  kind: typeof SUPPLEMENT_KIND;
  sourceImportId: string;
  sourceFileName: string;
  sourceRowIds: string[];
  userId: string;
};

export function readSupplementSummary(summary: unknown): SupplementSummary | null {
  if (!summary || typeof summary !== "object") return null;
  const record = summary as Record<string, unknown>;
  if (record.kind !== SUPPLEMENT_KIND || typeof record.sourceImportId !== "string") return null;
  return {
    kind: SUPPLEMENT_KIND,
    sourceImportId: record.sourceImportId,
    sourceFileName: typeof record.sourceFileName === "string" ? record.sourceFileName : "",
    sourceRowIds: Array.isArray(record.sourceRowIds)
      ? record.sourceRowIds.filter((id): id is string => typeof id === "string")
      : [],
    userId: typeof record.userId === "string" ? record.userId : ""
  };
}

export type SupplementImportRef = { id: string; status: string; summary: unknown };

/** Source row ids already paid by a supplement that is confirmed (or still being applied). */
export function collectClaimedSourceRowIds(supplements: SupplementImportRef[]): Set<string> {
  const claimed = new Set<string>();
  for (const supplement of supplements) {
    if (supplement.status !== "CONFIRMED" && supplement.status !== "PREVIEW") continue;
    for (const id of readSupplementSummary(supplement.summary)?.sourceRowIds ?? []) claimed.add(id);
  }
  return claimed;
}

/** Confirmed supplements made from this source import; while any exist the source cannot be rolled back. */
export function findActiveSupplementsOf(sourceImportId: string, supplements: SupplementImportRef[]) {
  return supplements.filter(
    (supplement) =>
      supplement.status === "CONFIRMED" && readSupplementSummary(supplement.summary)?.sourceImportId === sourceImportId
  );
}

export function describeSourceRollbackBlock(supplements: Array<{ source_file_name: string }>): string {
  const names = supplements.map((item) => `«${item.source_file_name}»`).join(", ");
  return `Сначала откатите доначисления, сделанные из этого импорта: ${names}. Потом откатите сам импорт.`;
}

export type PoolRow = {
  id: string;
  import_id: string;
  action: string;
  user_id?: string | null;
  gross_amount?: unknown;
};

export function isUnallocatedRow(row: PoolRow): boolean {
  const applied = Boolean(row.user_id) && APPLIED_ACTIONS.has(row.action);
  return !applied && toAmount(row.gross_amount) > 0;
}

export type UnallocatedImportSummary = {
  importId: string;
  fileName: string;
  quarter: number | null;
  year: number | null;
  confirmedAt: string | null;
  unallocatedRows: number;
  unallocatedAmount: number;
  supplementedRows: number;
  supplementedAmount: number;
  remainingRows: number;
  remainingAmount: number;
};

export function summarizeUnallocated(params: {
  imports: Array<{
    id: string;
    source_file_name: string;
    confirmed_at?: Date | string | null;
    quarter: number | null;
    year: number | null;
  }>;
  rows: PoolRow[];
  claimed: Set<string>;
}): { totalAmount: number; totalRows: number; imports: UnallocatedImportSummary[] } {
  const byImport = new Map<string, UnallocatedImportSummary>();
  for (const item of params.imports) {
    byImport.set(item.id, {
      importId: item.id,
      fileName: item.source_file_name,
      quarter: item.quarter,
      year: item.year,
      confirmedAt: item.confirmed_at ? new Date(item.confirmed_at).toISOString() : null,
      unallocatedRows: 0,
      unallocatedAmount: 0,
      supplementedRows: 0,
      supplementedAmount: 0,
      remainingRows: 0,
      remainingAmount: 0
    });
  }
  for (const row of params.rows) {
    const summary = byImport.get(row.import_id);
    if (!summary || !isUnallocatedRow(row)) continue;
    const amount = toAmount(row.gross_amount);
    summary.unallocatedRows += 1;
    summary.unallocatedAmount += amount;
    if (params.claimed.has(row.id)) {
      summary.supplementedRows += 1;
      summary.supplementedAmount += amount;
    } else {
      summary.remainingRows += 1;
      summary.remainingAmount += amount;
    }
  }
  const imports = [...byImport.values()]
    .map((item) => ({
      ...item,
      unallocatedAmount: round(item.unallocatedAmount),
      supplementedAmount: round(item.supplementedAmount),
      remainingAmount: round(item.remainingAmount)
    }))
    .filter((item) => item.unallocatedRows > 0)
    .sort((left, right) => right.remainingAmount - left.remainingAmount);
  return {
    totalAmount: round(imports.reduce((sum, item) => sum + item.remainingAmount, 0)),
    totalRows: imports.reduce((sum, item) => sum + item.remainingRows, 0),
    imports
  };
}

export type CandidateRow = {
  rowId: string;
  importId: string;
  userId: string;
  userLabel: string;
  releaseId: string;
  releaseTitle: string;
  upc: string | null;
  rule: string;
  amount: number;
  releaseAddedAfterImport: boolean;
};

export type SupplementCandidate = {
  key: string;
  sourceImportId: string;
  sourceFileName: string;
  quarter: number | null;
  year: number | null;
  userId: string;
  userLabel: string;
  amount: number;
  rowIds: string[];
  releases: Array<{ id: string; title: string; upc: string | null; amount: number }>;
  rules: string[];
  needsCheck: boolean;
  firstAccrual: boolean;
  releaseAddedAfterImport: boolean;
  payoutDoneForQuarter: boolean;
};

/** Groups matched pool rows into one candidate per source import and artist. */
export function groupSupplementCandidates(params: {
  rows: CandidateRow[];
  imports: Map<string, { fileName: string; quarter: number | null; year: number | null }>;
  usersWithAccruals: Set<string>;
  payoutQuarters: Map<string, Set<string>>;
}): SupplementCandidate[] {
  const groups = new Map<string, SupplementCandidate>();
  for (const row of params.rows) {
    const key = `${row.importId}:${row.userId}`;
    const source = params.imports.get(row.importId);
    let group = groups.get(key);
    if (!group) {
      const quarter = source?.quarter ?? null;
      const year = source?.year ?? null;
      group = {
        key,
        sourceImportId: row.importId,
        sourceFileName: source?.fileName ?? "",
        quarter,
        year,
        userId: row.userId,
        userLabel: row.userLabel,
        amount: 0,
        rowIds: [],
        releases: [],
        rules: [],
        needsCheck: false,
        firstAccrual: !params.usersWithAccruals.has(row.userId),
        releaseAddedAfterImport: false,
        payoutDoneForQuarter: Boolean(
          quarter && year && params.payoutQuarters.get(row.userId)?.has(`${year}-${quarter}`)
        )
      };
      groups.set(key, group);
    }
    group.amount += row.amount;
    group.rowIds.push(row.rowId);
    if (!group.rules.includes(row.rule)) group.rules.push(row.rule);
    if (SUPPLEMENT_RULES_NEEDING_CHECK.has(row.rule)) group.needsCheck = true;
    if (row.releaseAddedAfterImport) group.releaseAddedAfterImport = true;
    const release = group.releases.find((item) => item.id === row.releaseId);
    if (release) release.amount += row.amount;
    else group.releases.push({ id: row.releaseId, title: row.releaseTitle, upc: row.upc, amount: row.amount });
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      amount: round(group.amount),
      releases: group.releases
        .map((release) => ({ ...release, amount: round(release.amount) }))
        .sort((left, right) => right.amount - left.amount)
    }))
    .sort((left, right) => right.amount - left.amount);
}

/** Comment the artist sees on a supplement report. */
export function supplementReportComment(quarter: number, year: number, sourceQuarter: number | null, sourceYear: number | null) {
  const sameQuarter = sourceQuarter === quarter && sourceYear === year;
  const period = sourceQuarter && sourceYear ? `${sourceQuarter} квартал ${sourceYear}` : "прошлый период";
  return sameQuarter
    ? `Доначисление за ${period}: эти начисления нашлись после того, как релиз появился в вашем кабинете.`
    : `Доначисление за ${period}, включено в отчёт за ${quarter} квартал ${year}: эти начисления нашлись после того, как релиз появился в вашем кабинете.`;
}

function toAmount(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

// ---------------------------------------------------------------------------------------------
// "Что внутри": the money still in the pool, one line per track, to see whose it is and why it
// matched nobody. Read-only.

export type UnallocatedDetailRow = {
  id: string;
  import_id: string;
  action: string;
  user_id?: string | null;
  gross_amount?: unknown;
  error_message?: string | null;
  normalized_data?: unknown;
};

export type UnallocatedTrackGroup = {
  key: string;
  title: string;
  artist: string;
  album: string;
  isrc: string;
  upcs: string[];
  codes: string[];
  platforms: string[];
  imports: Array<{ importId: string; fileName: string; quarterLabel: string }>;
  rows: number;
  streams: number;
  amount: number;
  reasons: string[];
};

const REASON_TRANSLATIONS: Record<string, string> = {
  "UPC was not found in catalog.": "UPC не найден в каталоге",
  "Financial row is missing UPC.": "В строке нет UPC",
  "Multiple tracks found by ISRC": "По ISRC нашлось несколько треков",
  "Fuzzy match found but needs review": "Похожий трек найден, нужна проверка"
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

export const EMPTY_ROW_REASON = "Пустая строка: нет названия, артиста и UPC — похоже на итоговую строку файла";

function readReason(row: UnallocatedDetailRow, data: Record<string, unknown>): string {
  if (!text(data.title) && !text(data.artist) && !text(data.upc) && !text(data.isrc)) return EMPTY_ROW_REASON;
  const preview = (data.__preview ?? {}) as Record<string, unknown>;
  const raw = text(row.error_message) || text(preview.reason);
  if (raw) return REASON_TRANSLATIONS[raw] ?? raw;
  if (row.user_id) return "Строка не применена";
  return "Владелец не найден";
}

export function formatQuarterLabel(quarter: number | null, year: number | null): string {
  return quarter && year ? `${quarter} кв ${year}` : "квартал не указан";
}

/** The same track across rows and imports: by ISRC, then UPC + title, then title + artist. */
export function unallocatedTrackKey(data: Record<string, unknown>): string {
  const isrc = text(data.isrc).toUpperCase();
  if (isrc) return `isrc:${isrc}`;
  const title = text(data.title).toLowerCase();
  const upc = text(data.upc);
  if (upc) return `upc:${upc}|${title}`;
  return `t:${title}|a:${text(data.artist).toLowerCase()}`;
}

function addUnique(list: string[], value: string) {
  if (value && !list.includes(value)) list.push(value);
}

export function groupUnallocatedRows(params: {
  rows: UnallocatedDetailRow[];
  imports: Map<string, { fileName: string; quarter: number | null; year: number | null }>;
  claimed: Set<string>;
}): { totalAmount: number; totalRows: number; groups: UnallocatedTrackGroup[] } {
  const groups = new Map<string, UnallocatedTrackGroup & { reasonCounts: Map<string, number> }>();
  for (const row of params.rows) {
    if (!isUnallocatedRow(row) || params.claimed.has(row.id)) continue;
    const source = params.imports.get(row.import_id);
    if (!source) continue;
    const data = (row.normalized_data && typeof row.normalized_data === "object" ? row.normalized_data : {}) as Record<string, unknown>;
    const key = unallocatedTrackKey(data);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        title: text(data.title) || "Без названия",
        artist: text(data.artist),
        album: text(data.album_title),
        isrc: text(data.isrc).toUpperCase(),
        upcs: [],
        codes: [],
        platforms: [],
        imports: [],
        rows: 0,
        streams: 0,
        amount: 0,
        reasons: [],
        reasonCounts: new Map()
      };
      groups.set(key, group);
    }
    if (!group.artist) group.artist = text(data.artist);
    if (!group.album) group.album = text(data.album_title);
    addUnique(group.upcs, text(data.upc));
    addUnique(group.codes, text(data.internal_code) || text(data.licensee_code));
    for (const platform of text(data.platform).split(",")) addUnique(group.platforms, platform.trim());
    if (!group.imports.some((item) => item.importId === row.import_id)) {
      group.imports.push({
        importId: row.import_id,
        fileName: source.fileName,
        quarterLabel: formatQuarterLabel(source.quarter, source.year)
      });
    }
    const reason = readReason(row, data);
    group.reasonCounts.set(reason, (group.reasonCounts.get(reason) ?? 0) + 1);
    group.rows += 1;
    group.streams += Number(text(data.streams).replace(/\s/gu, "").replace(",", ".")) || 0;
    group.amount += toAmount(row.gross_amount);
  }
  const list = [...groups.values()]
    .map(({ reasonCounts, ...group }) => ({
      ...group,
      amount: round(group.amount),
      reasons: [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason)
    }))
    .sort((left, right) => right.amount - left.amount || left.title.localeCompare(right.title, "ru"));
  return {
    totalAmount: round(list.reduce((sum, group) => sum + group.amount, 0)),
    totalRows: list.reduce((sum, group) => sum + group.rows, 0),
    groups: list
  };
}
