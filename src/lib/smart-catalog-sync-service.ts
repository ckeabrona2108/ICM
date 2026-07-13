// @ts-nocheck
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as XLSX from "xlsx";

import {
  SMART_CATALOG_UPDATABLE_FIELDS,
  SMART_COLUMN_PRIORITY,
  SMART_COLUMN_SYNONYMS,
  SMART_DEFAULT_PLATFORM_COMMISSION_RATE,
  type SmartCanonicalColumn
} from "@/lib/smart-catalog-sync-config";
import { createAdminLog } from "@/lib/admin-log-service";
import { normalizeAnalyticsUpc } from "@/lib/analytics-upc";
import { prisma } from "@/lib/prisma";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";
import {
  REPORT_PAYLOAD_DESCRIPTION,
  buildStoredUserReportPayload,
  type UserReportLineItem
} from "@/lib/report-service";

const iconvLite = require("iconv-lite") as {
  decode: (buffer: Buffer, encoding: string) => string;
};

type SmartImportKind = "catalog" | "finance";

type ParsedSheet = {
  fileFormat: "csv" | "tsv" | "xlsx";
  encoding: string | null;
  delimiter: string | null;
  headerRowIndex: number;
  headers: string[];
  rows: Array<Record<string, string>>;
};

type DetectedColumnMap = Partial<Record<SmartCanonicalColumn, string>>;

type MatchOutcome = {
  action:
    | "MATCH"
    | "UPDATE"
    | "CREATE"
    | "CONFLICT"
    | "SKIP"
    | "ERROR"
    | "NEEDS_REVIEW";
  confidence: number;
  reason: string;
  rule?: string | null;
  matchedReleaseId?: string | null;
  matchedTrackId?: string | null;
  release?: Record<string, unknown> | null;
  track?: Record<string, unknown> | null;
  ownerUserId?: string | null;
};

type SmartMatchContext = {
  isrcMatches: Map<string, Promise<any[]>>;
  upcTrackMatches: Map<string, Promise<any | null>>;
  upcTitleMatches: Map<string, Promise<any[]>>;
  titleMatches: Map<string, Promise<any[]>>;
  ownerMatches: Map<string, Promise<any | null>>;
  releaseByUpc: Map<string, Promise<any | null>>;
  matchResults: Map<string, Promise<MatchOutcome>>;
};

type NormalizedRow = Partial<Record<SmartCanonicalColumn, string>> & {
  row_number: number;
  entity_type?: "release" | "track";
};

type PreviewRow = {
  row_number: number;
  action: MatchOutcome["action"];
  confidence_score: number;
  raw_data: Record<string, string>;
  normalized_data: Record<string, unknown>;
  detected_match_rule?: string | null;
  error_message?: string | null;
  matched_release_id?: string | null;
  matched_track_id?: string | null;
  owner_user_id?: string | null;
};

type FinancialApplyState = {
  previousBalances: Record<string, number>;
  financeReportIds: string[];
  transactionIds: string[];
  royaltyIds: string[];
  royaltyTransactionIds: string[];
  commissionIds: string[];
  balanceTransactionIds: string[];
  reportQuarter?: number | null;
  reportYear?: number | null;
};

type FinancialApplyContext = {
  commissionRates: Map<string, number>;
  currentBalances: Map<string, number>;
};

type FinancialAllocationAdjustment = {
  rowId: string;
  netAmount: number;
};

function normalizeReportQuarter(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 4) {
    return null;
  }
  return numeric;
}

function normalizeReportYear(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 2000 || numeric > 3000) {
    return null;
  }
  return numeric;
}

const CATALOG_IMPORT_INCLUDE = {
  rows: {
    orderBy: { row_number: "asc" }
  },
  conflicts: {
    orderBy: { created_at: "asc" }
  },
  logs: {
    orderBy: { created_at: "asc" }
  }
} as const;

const FINANCIAL_IMPORT_INCLUDE = {
  rows: {
    orderBy: { row_number: "asc" },
    include: {
      matched_release: true,
      matched_track: true,
      user: true
    }
  },
  matching_logs: {
    orderBy: { created_at: "asc" }
  }
} as const;

function createSmartMatchContext(): SmartMatchContext {
  return {
    isrcMatches: new Map(),
    upcTrackMatches: new Map(),
    upcTitleMatches: new Map(),
    titleMatches: new Map(),
    ownerMatches: new Map(),
    releaseByUpc: new Map(),
    matchResults: new Map()
  };
}

function createFinancialApplyContext(): FinancialApplyContext {
  return {
    commissionRates: new Map(),
    currentBalances: new Map()
  };
}

function normalizeToken(input: string | null | undefined): string {
  return String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[_\-./]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeCompact(input: string | null | undefined): string {
  return normalizeToken(input).replace(/\s+/g, "");
}

function titleSimilarity(left: string | null | undefined, right: string | null | undefined): number {
  const a = normalizeToken(left);
  const b = normalizeToken(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (normalizeCompact(a) === normalizeCompact(b)) return 0.98;

  const leftTokens = new Set(a.split(" ").filter(Boolean));
  const rightTokens = new Set(b.split(" ").filter(Boolean));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  const jaccard = intersection / union;

  if (a.includes(b) || b.includes(a)) {
    return Math.max(jaccard, 0.86);
  }

  return jaccard;
}

function confidenceFromSimilarity(similarity: number): number {
  return Math.max(0, Math.min(100, Math.round(similarity * 100)));
}

function detectFileFormat(fileName: string): "csv" | "tsv" | "xlsx" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "xlsx";
  if (lower.endsWith(".tsv")) return "tsv";
  return "csv";
}

function detectDelimiter(text: string): string {
  const sample = text
    .split(/\r?\n/)
    .slice(0, 5)
    .join("\n");

  const delimiters = [",", ";", "\t", "|"];
  let winner = ",";
  let score = -1;

  for (const delimiter of delimiters) {
    const delimiterScore = sample.split("\n").reduce((sum, line) => {
      return sum + Math.max(0, line.split(delimiter).length - 1);
    }, 0);
    if (delimiterScore > score) {
      score = delimiterScore;
      winner = delimiter;
    }
  }

  return winner;
}

function decodeBuffer(buffer: Buffer): { text: string; encoding: string } {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return {
      text: buffer.toString("utf8").replace(/^\uFEFF/, ""),
      encoding: "utf-8-bom"
    };
  }

  const utf8 = buffer.toString("utf8");
  const replacementCharCount = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacementCharCount === 0) {
    return {
      text: utf8,
      encoding: "utf-8"
    };
  }

  return {
    text: iconvLite.decode(buffer, "win1251"),
    encoding: "windows-1251"
  };
}

function parseDelimitedRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(cell.trim());
      cell = "";
      if (row.some((entry) => entry !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim());
    if (row.some((entry) => entry !== "")) {
      rows.push(row);
    }
  }

  return rows.filter((entries) => entries.some((entry) => entry.trim() !== ""));
}

function buildRecordsFromMatrix(matrix: string[][], delimiter: string | null): ParsedSheet {
  const firstRow = matrix[0] ?? [];
  const hasHeaders =
    firstRow.length > 0 &&
    new Set(firstRow.map((value) => normalizeToken(value)).filter(Boolean)).size >=
      Math.max(1, Math.floor(firstRow.length / 2));

  const headers = hasHeaders
    ? firstRow.map((header, index) => header || `Column ${index + 1}`)
    : firstRow.map((_, index) => `Column ${index + 1}`);
  const dataRows = hasHeaders ? matrix.slice(1) : matrix;

  const rows = dataRows.map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      record[header] = String(cells[headerIndex] ?? "").trim();
    });
    return record;
  });

  return {
    fileFormat: delimiter === "\t" ? "tsv" : "csv",
    encoding: null,
    delimiter,
    headerRowIndex: hasHeaders ? 0 : -1,
    headers,
    rows
  };
}

function parseWorkbook(buffer: Buffer): ParsedSheet {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(firstSheet, {
    header: 1,
    blankrows: false,
    raw: false,
    defval: ""
  }) as string[][];

  const sheet = buildRecordsFromMatrix(
    matrix.map((row) => row.map((cell) => String(cell ?? "").trim())),
    null
  );

  return {
    ...sheet,
    fileFormat: "xlsx",
    encoding: null,
    delimiter: null
  };
}

async function parseInputFile(fileName: string, arrayBuffer: ArrayBuffer | Buffer): Promise<ParsedSheet> {
  const buffer = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
  const fileFormat = detectFileFormat(fileName);

  if (fileFormat === "xlsx") {
    return parseWorkbook(buffer);
  }

  const decoded = decodeBuffer(buffer);
  const delimiter = fileFormat === "tsv" ? "\t" : detectDelimiter(decoded.text);
  const matrix = parseDelimitedRows(decoded.text, delimiter);
  const parsed = buildRecordsFromMatrix(matrix, delimiter);

  return {
    ...parsed,
    fileFormat,
    encoding: decoded.encoding,
    delimiter,
    headerRowIndex: parsed.headerRowIndex < 0 ? 0 : parsed.headerRowIndex
  };
}

export function detectSmartColumns(headers: string[]): DetectedColumnMap {
  const candidatesByHeader = new Map<
    string,
    Array<{ canonical: SmartCanonicalColumn; score: number }>
  >();

  for (const canonical of SMART_COLUMN_PRIORITY) {
    let bestHeader: string | null = null;
    let bestScore = 0;

    for (const header of headers) {
      const normalizedHeader = normalizeToken(header);
      if (!normalizedHeader) continue;

      for (const candidate of SMART_COLUMN_SYNONYMS[canonical]) {
        const normalizedCandidate = normalizeToken(candidate);
        let score = 0;

        if (canonical === "isrc" && !/\bisrc\b|код трека/.test(normalizedHeader)) {
          continue;
        }

        if (canonical === "upc" && !/\bupc\b|\bean\b|штрихкод|barcode/.test(normalizedHeader)) {
          continue;
        }

        if (normalizedHeader === normalizedCandidate) {
          score = 1;
        } else if (normalizedHeader.includes(normalizedCandidate)) {
          score = 0.92;
        } else if (normalizedCandidate.includes(normalizedHeader)) {
          score = 0.88;
        } else {
          score = titleSimilarity(normalizedHeader, normalizedCandidate) * 0.9;
        }

        if (score > bestScore) {
          bestScore = score;
          bestHeader = header;
        }
      }
    }

    if (bestHeader && bestScore >= 0.8) {
      const current = candidatesByHeader.get(bestHeader) ?? [];
      current.push({ canonical, score: bestScore });
      candidatesByHeader.set(bestHeader, current);
    }
  }

  const map: DetectedColumnMap = {};
  for (const [header, candidates] of candidatesByHeader.entries()) {
    const winner = candidates.sort((left, right) => right.score - left.score)[0];
    if (winner) {
      map[winner.canonical] = header;
    }
  }

  return map;
}

function normalizeBoolean(value: string | undefined): string | undefined {
  const normalized = normalizeToken(value);
  if (!normalized) return undefined;
  if (["true", "yes", "1", "explicit", "да", "цензура", "нецензурный"].includes(normalized)) {
    return "true";
  }
  if (["false", "no", "0", "clean", "нет"].includes(normalized)) {
    return "false";
  }
  return undefined;
}

function normalizeRow(
  raw: Record<string, string>,
  detectedColumns: DetectedColumnMap,
  rowNumber: number
): NormalizedRow {
  const normalized: NormalizedRow = { row_number: rowNumber };

  for (const [canonical, sourceColumn] of Object.entries(detectedColumns)) {
    const key = canonical as SmartCanonicalColumn;
    const value = String(raw[sourceColumn] ?? "").trim();
    if (!value) continue;

    if (key === "explicit") {
      normalized[key] = normalizeBoolean(value) ?? value;
      continue;
    }

    normalized[key] = value;
  }

  const hasTrackSignals = Boolean(normalized.isrc || normalized.track_number || normalized.title);
  normalized.entity_type = hasTrackSignals ? "track" : "release";
  return normalized;
}

function rowPreviewPayload(
  normalized: NormalizedRow,
  match: MatchOutcome,
  currentValues: Record<string, unknown>,
  incomingValues: Record<string, unknown>,
  extra: Record<string, unknown> = {}
) {
  return {
    ...normalized,
    __preview: {
      status: match.action,
      confidence: match.confidence,
      reason: match.reason,
      current_values: currentValues,
      incoming_values: incomingValues,
      ...extra
    }
  };
}

function numberFromLoose(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const normalized = String(value).replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolveFinancialNetAmount(source: Record<string, unknown>): number {
  const royaltyTotal = numberFromLoose(source.royalty_total as string | number | null | undefined);
  if (royaltyTotal) return royaltyTotal;

  const royaltyAuthor = numberFromLoose(source.royalty_author as string | number | null | undefined);
  const royaltyRelated = numberFromLoose(source.royalty_related as string | number | null | undefined);
  const combinedRoyalty = Number((royaltyAuthor + royaltyRelated).toFixed(2));
  if (combinedRoyalty) return combinedRoyalty;

  return numberFromLoose(source.gross_amount as string | number | null | undefined);
}

function getTransactionRepo<T = unknown>(tx: Prisma.TransactionClient, key: string): T | null {
  const repo = (tx as unknown as Record<string, unknown>)[key];
  return repo ? (repo as T) : null;
}

function getClientRepo<T = unknown>(client: unknown, key: string): T | null {
  const repo = (client as Record<string, unknown>)[key];
  return repo ? (repo as T) : null;
}

async function hasIcecreamTable(
  tx: Prisma.TransactionClient,
  tableName: string
): Promise<boolean> {
  try {
    const rows = await tx.$queryRaw<Array<{ exists: boolean }>>`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'icecream' and table_name = ${tableName}
      ) as "exists"
    `;
    return Boolean(rows[0]?.exists);
  } catch (error) {
    if (isPrismaTableMissingError(error)) {
      return false;
    }
    throw error;
  }
}

function requireClientRepo<T = unknown>(client: unknown, key: string, context: string): T {
  const repo = getClientRepo<T>(client, key);
  if (!repo) {
    throw new Error(`Finance module is unavailable in current schema/client: missing ${key} for ${context}.`);
  }
  return repo;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
): Promise<TOutput[]> {
  if (items.length === 0) return [];

  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<TOutput>(items.length);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

function parseDateLoose(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const ruMatch = String(value).match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ruMatch) {
    const [, dd, mm, yyyy] = ruMatch;
    const date = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

async function findCatalogMatch(normalized: NormalizedRow): Promise<MatchOutcome> {
  return findCatalogMatchWithContext(normalized, createSmartMatchContext());
}

async function getMemoized<T>(map: Map<string, Promise<T>>, key: string, factory: () => Promise<T>): Promise<T> {
  const cached = map.get(key);
  if (cached) return cached;
  const created = factory();
  map.set(key, created);
  return created;
}

async function findCatalogMatchWithContext(
  normalized: NormalizedRow,
  context: SmartMatchContext
): Promise<MatchOutcome> {
  const title = normalized.title ?? "";
  const artist = normalized.artist ?? "";
  const label = normalized.label ?? "";
  const resultKey = JSON.stringify({
    isrc: normalized.isrc ?? null,
    upc: normalized.upc ?? null,
    track_number: normalized.track_number ?? null,
    title,
    artist,
    label
  });

  return getMemoized(context.matchResults, resultKey, async () => {
    if (normalized.isrc) {
      const candidates = await getMemoized(context.isrcMatches, String(normalized.isrc), () =>
        prisma.track.findMany({
          where: { isrc: normalized.isrc },
          include: { release: { include: { user: true } } },
          take: 5
        })
      );

      if (candidates.length === 1) {
        return {
          action: "MATCH",
          confidence: 100,
          reason: "Matched by ISRC",
          rule: "ISRC",
          matchedReleaseId: candidates[0].releaseId,
          matchedTrackId: candidates[0].id,
          release: candidates[0].release,
          track: candidates[0],
          ownerUserId: candidates[0].release.userId
        };
      }

      if (candidates.length > 1) {
        return {
          action: "CONFLICT",
          confidence: 96,
          reason: "Multiple tracks found by ISRC",
          rule: "ISRC"
        };
      }
    }

    if (normalized.upc && normalized.track_number) {
      const upcTrackKey = `${normalized.upc}::${Math.max(1, Math.trunc(numberFromLoose(normalized.track_number)))}`;
      const candidate = await getMemoized(context.upcTrackMatches, upcTrackKey, () =>
        prisma.track.findFirst({
          where: {
            index: Math.max(1, Math.trunc(numberFromLoose(normalized.track_number))),
            release: { upc: normalized.upc }
          },
          include: { release: true }
        })
      );

      if (candidate) {
        return {
          action: "MATCH",
          confidence: 99,
          reason: "Matched by UPC + Track Number",
          rule: "UPC_TRACK_NUMBER",
          matchedReleaseId: candidate.releaseId,
          matchedTrackId: candidate.id,
          release: candidate.release,
          track: candidate,
          ownerUserId: candidate.release.userId
        };
      }
    }

    if (normalized.upc && title) {
      const upcTitleKey = `${normalized.upc}::${normalizeCompact(title)}`;
      const candidates = await getMemoized(context.upcTitleMatches, upcTitleKey, () =>
        prisma.track.findMany({
          where: {
            release: { upc: normalized.upc },
            title: { contains: title, mode: "insensitive" }
          },
          include: { release: true },
          take: 5
        })
      );
      const best = candidates
        .map((candidate) => ({
          candidate,
          score: titleSimilarity(title, candidate.title)
        }))
        .sort((left, right) => right.score - left.score)[0];

      if (best && best.score >= 0.95) {
        return {
          action: "MATCH",
          confidence: confidenceFromSimilarity(best.score),
          reason: "Matched by UPC + Title",
          rule: "UPC_TITLE",
          matchedReleaseId: best.candidate.releaseId,
          matchedTrackId: best.candidate.id,
          release: best.candidate.release,
          track: best.candidate,
          ownerUserId: best.candidate.release.userId
        };
      }
    }

    if (title) {
      const titleKey = `${normalizeCompact(title.slice(0, 80))}::${normalizeCompact(artist)}::${normalizeCompact(label)}`;
      const candidates = await getMemoized(context.titleMatches, titleKey, () =>
        prisma.track.findMany({
          where: {
            title: { contains: title.slice(0, 80), mode: "insensitive" }
          },
          include: { release: true },
          take: 20
        })
      );

      const scored = candidates
        .map((candidate) => {
          const titleScore = titleSimilarity(title, candidate.title);
          const artistScore = titleSimilarity(artist, candidate.release.performer ?? candidate.release.userId);
          const labelScore = titleSimilarity(label, candidate.release.labelName ?? "");
          const combined = titleScore * 0.65 + artistScore * 0.25 + labelScore * 0.1;
          return { candidate, combined };
        })
        .sort((left, right) => right.combined - left.combined);

      if (scored[0]?.combined >= 0.95 && (!scored[1] || scored[0].combined - scored[1].combined > 0.05)) {
        return {
          action: "MATCH",
          confidence: confidenceFromSimilarity(scored[0].combined),
          reason: "Matched by fuzzy Title + Artist",
          rule: "TITLE_ARTIST",
          matchedReleaseId: scored[0].candidate.releaseId,
          matchedTrackId: scored[0].candidate.id,
          release: scored[0].candidate.release,
          track: scored[0].candidate,
          ownerUserId: scored[0].candidate.release.userId
        };
      }

      if (scored[0]?.combined >= 0.8) {
        return {
          action: "NEEDS_REVIEW",
          confidence: confidenceFromSimilarity(scored[0].combined),
          reason: "Fuzzy match found but needs review",
          rule: "FUZZY_TITLE_ARTIST",
          matchedReleaseId: scored[0].candidate.releaseId,
          matchedTrackId: scored[0].candidate.id,
          release: scored[0].candidate.release,
          track: scored[0].candidate,
          ownerUserId: scored[0].candidate.release.userId
        };
      }
    }

    const ownerKey = `${normalizeCompact(label)}::${normalizeCompact(artist || label)}`;
    const ownerByLabel = label
      ? await getMemoized(context.ownerMatches, ownerKey, () =>
          prisma.user.findFirst({
            where: {
              OR: [
                { label: { equals: label, mode: "insensitive" } },
                { name: { equals: artist || label, mode: "insensitive" } }
              ]
            },
            select: { id: true, label: true, name: true }
          })
        )
      : null;

    return {
      action: "CREATE",
      confidence: ownerByLabel ? 82 : 60,
      reason: ownerByLabel
        ? "No exact catalog match found. A plausible owner was resolved for create flow."
        : "No match found in catalog.",
      rule: ownerByLabel ? "CREATE_MISSING" : "NOT_FOUND",
      ownerUserId: ownerByLabel?.id ?? null
    };
  });
}

function extractComparableValues(normalized: NormalizedRow) {
  return {
    title: normalized.title ?? null,
    artist: normalized.artist ?? null,
    label: normalized.label ?? null,
    upc: normalized.upc ?? null,
    isrc: normalized.isrc ?? null,
    release_date: normalized.release_date ?? null,
    genre: normalized.genre ?? null,
    language: normalized.language ?? null,
    explicit: normalized.explicit ?? null,
    track_number: normalized.track_number ?? null
  };
}

function getExistingComparableValues(match: MatchOutcome) {
  const release = (match.release ?? {}) as Record<string, unknown>;
  const track = (match.track ?? {}) as Record<string, unknown>;

  return {
    title: (track.title as string) ?? (release.title as string) ?? null,
    artist: (release.performer as string) ?? null,
    label: (release.labelName as string) ?? null,
    upc: (release.upc as string) ?? null,
    isrc: (track.isrc as string) ?? null,
    release_date: release.date instanceof Date ? release.date.toISOString().slice(0, 10) : null,
    genre: (release.genre as string) ?? null,
    language: (track.language as string) ?? (release.language as string) ?? null,
    explicit: typeof track.explicit === "boolean" ? String(track.explicit) : null,
    track_number: typeof track.index === "number" ? String(track.index) : null
  };
}

function buildCatalogRowPreview(raw: Record<string, string>, normalized: NormalizedRow, match: MatchOutcome): PreviewRow {
  const currentValues = getExistingComparableValues(match);
  const incomingValues = extractComparableValues(normalized);

  return {
    row_number: normalized.row_number,
    action: match.action,
    confidence_score: match.confidence,
    raw_data: raw,
    normalized_data: rowPreviewPayload(normalized, match, currentValues, incomingValues, {
      entity_type: normalized.entity_type,
      owner_user_id: match.ownerUserId ?? null
    }),
    detected_match_rule: match.rule ?? null,
    error_message: match.action === "ERROR" ? match.reason : null,
    matched_release_id: match.matchedReleaseId ?? null,
    matched_track_id: match.matchedTrackId ?? null,
    owner_user_id: match.ownerUserId ?? null
  };
}

async function findFinancialMatch(normalized: NormalizedRow): Promise<MatchOutcome> {
  return findFinancialMatchWithContext(normalized, createSmartMatchContext());
}

export function pickFinancialReleaseMatchByNormalizedUpc(params: {
  normalizedUpc: string;
  title: string | null | undefined;
  candidates: Array<{
    id: string;
    upc?: string | null;
    title?: string | null;
    userId?: string | null;
    confirmed?: boolean | null;
    track?: Array<{ id: string; title?: string | null }>;
  }>;
}): {
  release: {
    id: string;
    upc?: string | null;
    title?: string | null;
    userId?: string | null;
    confirmed?: boolean | null;
    track?: Array<{ id: string; title?: string | null }>;
  };
  track: { id: string; title?: string | null } | null;
} | null {
  const normalizedUpc = normalizeAnalyticsUpc(params.normalizedUpc);
  if (!normalizedUpc) return null;

  const title = params.title ?? "";
  const ranked = params.candidates
    .map((candidate) => {
      if (normalizeAnalyticsUpc(candidate.upc ?? "") !== normalizedUpc) {
        return null;
      }

      const releaseScore = titleSimilarity(candidate.title ?? "", title);
      const bestTrack =
        (candidate.track ?? [])
          .map((track) => ({
            track,
            score: titleSimilarity(track.title ?? "", title)
          }))
          .sort((left, right) => right.score - left.score)[0] ?? null;

      return {
        release: candidate,
        track: bestTrack?.track ?? null,
        score: Math.max(releaseScore, bestTrack?.score ?? 0),
        confirmedPriority: candidate.confirmed ? 1 : 0
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (right.confirmedPriority !== left.confirmedPriority) {
        return right.confirmedPriority - left.confirmedPriority;
      }
      return right.score - left.score;
    });

  const best = ranked[0];
  if (!best) return null;
  if (title.trim() && best.score < 0.8 && !best.release.confirmed) return null;
  return {
    release: best.release,
    track: best.track
  };
}

async function findFinancialMatchWithContext(
  normalized: NormalizedRow,
  context: SmartMatchContext
): Promise<MatchOutcome> {
  const upc = normalizeAnalyticsUpc(normalized.upc ?? "");
  const title = String(normalized.title ?? "").trim();

  if (!upc) {
    return {
      action: "SKIP",
      confidence: 0,
      reason: "Financial row is missing UPC.",
      rule: "MISSING_UPC"
    };
  }

  const release = await getMemoized(context.releaseByUpc, upc, () =>
    prisma.release.findMany({
      where: { upc },
      include: { track: true },
      orderBy: { date: "desc" }
    })
  );

  const primaryUpcMatch = Array.isArray(release)
    ? pickFinancialReleaseMatchByNormalizedUpc({
        normalizedUpc: upc,
        title,
        candidates: release
      })
    : null;

  let matchedRelease = primaryUpcMatch?.release ?? null;
  let matchedTrack =
    primaryUpcMatch?.track ??
    matchedRelease?.track.find((item) => titleSimilarity(item.title, title) >= 0.8) ??
    null;

  if (!matchedRelease && title) {
    const titleKey = `finance-release::${normalizeCompact(title.slice(0, 80))}::${upc}`;
    const candidates = await getMemoized(context.titleMatches, titleKey, () =>
      prisma.release.findMany({
        where: {
          OR: [
            { title: { contains: title.slice(0, 80), mode: "insensitive" } },
            {
              track: {
                some: {
                  title: { contains: title.slice(0, 80), mode: "insensitive" }
                }
              }
            }
          ]
        },
        include: { track: true },
        orderBy: { date: "desc" },
        take: 30
      })
    );

    const fallback = pickFinancialReleaseMatchByNormalizedUpc({
      normalizedUpc: upc,
      title,
      candidates
    });
    if (fallback) {
      matchedRelease = fallback.release;
      matchedTrack = fallback.track;
    }
  }

  if (!matchedRelease) {
    return {
      action: "SKIP",
      confidence: 0,
      reason: "UPC was not found in catalog.",
      rule: "NOT_FOUND"
    };
  }

  return {
    action: "MATCH",
    confidence: 100,
    reason:
      release != null
        ? "Matched for financial import by UPC"
        : "Matched for financial import by normalized UPC + Title",
    rule: "FINANCIAL_UPC",
    matchedReleaseId: matchedRelease.id,
    matchedTrackId: matchedTrack?.id ?? null,
    release: matchedRelease,
    track: matchedTrack,
    ownerUserId: matchedRelease.userId
  };
}

function buildFinancialRowPreview(raw: Record<string, string>, normalized: NormalizedRow, match: MatchOutcome): PreviewRow {
  const grossAmount = resolveFinancialNetAmount(normalized as Record<string, unknown>);

  return {
    row_number: normalized.row_number,
    action: match.action,
    confidence_score: match.confidence,
    raw_data: raw,
    normalized_data: rowPreviewPayload(normalized, match, getExistingComparableValues(match), {
      ...extractComparableValues(normalized),
      gross_amount: grossAmount
    }),
    detected_match_rule: match.rule ?? null,
    error_message: match.action === "ERROR" ? match.reason : null,
    matched_release_id: match.matchedReleaseId ?? null,
    matched_track_id: match.matchedTrackId ?? null,
    owner_user_id: match.ownerUserId ?? null
  };
}

function summarizePreviewRows(rows: PreviewRow[]) {
  const summary = {
    total_rows: rows.length,
    matched_rows: 0,
    update_rows: 0,
    create_rows: 0,
    conflict_rows: 0,
    skipped_rows: 0,
    error_rows: 0,
    needs_review_rows: 0
  };

  for (const row of rows) {
    if (row.action === "MATCH") summary.matched_rows += 1;
    else if (row.action === "UPDATE") summary.update_rows += 1;
    else if (row.action === "CREATE") summary.create_rows += 1;
    else if (row.action === "CONFLICT") summary.conflict_rows += 1;
    else if (row.action === "ERROR") summary.error_rows += 1;
    else if (row.action === "NEEDS_REVIEW") summary.needs_review_rows += 1;
    else summary.skipped_rows += 1;
  }

  return summary;
}

async function writeCatalogPreviewImport(params: {
  adminId: string;
  sourceFileName: string;
  parsed: ParsedSheet;
  detectedColumns: DetectedColumnMap;
  rows: PreviewRow[];
  createMissing: boolean;
}) {
  const summary = summarizePreviewRows(params.rows);

  const created = await prisma.catalog_imports.create({
    data: {
      kind: "catalog",
      source_file_name: params.sourceFileName,
      file_format: params.parsed.fileFormat,
      detected_encoding: params.parsed.encoding,
      detected_delimiter: params.parsed.delimiter,
      header_row_index: params.parsed.headerRowIndex,
      status: "PREVIEW",
      total_rows: summary.total_rows,
      matched_rows: summary.matched_rows,
      update_rows: summary.update_rows,
      create_rows: summary.create_rows,
      conflict_rows: summary.conflict_rows,
      skipped_rows: summary.skipped_rows + summary.needs_review_rows,
      error_rows: summary.error_rows,
      create_missing: params.createMissing,
      auto_detected_map: params.detectedColumns,
      summary,
      started_at: new Date(),
      created_by_admin_id: params.adminId,
      rows: {
        createMany: {
          data: params.rows.map((row) => ({
            row_number: row.row_number,
            action: row.action,
            confidence_score: row.confidence_score,
            raw_data: row.raw_data,
            normalized_data: row.normalized_data,
            detected_match_rule: row.detected_match_rule ?? null,
            error_message: row.error_message ?? null,
            matched_release_id: row.matched_release_id ?? null,
            matched_track_id: row.matched_track_id ?? null
          }))
        }
      },
      logs: {
        create: [
          {
            level: "info",
            message: "Catalog import preview created",
            metadata: {
              sourceFileName: params.sourceFileName,
              detectedColumns: params.detectedColumns
            }
          }
        ]
      }
    },
    include: CATALOG_IMPORT_INCLUDE
  });

  for (const row of params.rows) {
    const preview = (row.normalized_data?.__preview ?? {}) as Record<string, unknown>;
    const currentValues = (preview.current_values ?? {}) as Record<string, unknown>;
    const incomingValues = (preview.incoming_values ?? {}) as Record<string, unknown>;

    for (const fieldName of SMART_CATALOG_UPDATABLE_FIELDS) {
      const currentValue = currentValues[fieldName] ?? null;
      const incomingValue = incomingValues[fieldName] ?? null;
      if (!incomingValue || currentValue === incomingValue) continue;
      if (currentValue !== null && currentValue !== "") {
        await prisma.catalog_conflicts.create({
          data: {
            import_id: created.id,
            row_id: created.rows.find((item) => item.row_number === row.row_number)?.id ?? null,
            field_name: fieldName,
            existing_value: String(currentValue),
            incoming_value: String(incomingValue),
            matched_release_id: row.matched_release_id ?? null,
            matched_track_id: row.matched_track_id ?? null,
            notes: row.action === "NEEDS_REVIEW" ? "Needs review before overwrite" : null
          }
        });
      }
    }
  }

  await prisma.import_history.create({
    data: {
      import_type: "catalog",
      import_id: created.id,
      action: "PREVIEW_CREATED",
      actor_id: params.adminId,
      description: "Catalog import preview created",
      metadata: {
        detectedColumns: params.detectedColumns,
        summary
      }
    }
  });

  return prisma.catalog_imports.findUniqueOrThrow({
    where: { id: created.id },
    include: CATALOG_IMPORT_INCLUDE
  });
}

async function writeFinancialPreviewImport(params: {
  adminId: string;
  sourceFileName: string;
  parsed: ParsedSheet;
  detectedColumns: DetectedColumnMap;
  rows: PreviewRow[];
}) {
  const financialImportsRepo = requireClientRepo<{
    create: typeof prisma.financial_imports.create;
    findUniqueOrThrow: typeof prisma.financial_imports.findUniqueOrThrow;
  }>(prisma, "financial_imports", "financial preview import");
  const importHistoryRepo = requireClientRepo<{
    create: typeof prisma.import_history.create;
  }>(prisma, "import_history", "financial preview import history");

  const summary = summarizePreviewRows(params.rows);
  let grossAmountTotal = 0;
  let netAmountTotal = 0;
  let commissionTotal = 0;
  const previewContext = createFinancialApplyContext();

  const rowPayloads = await Promise.all(params.rows.map(async (row) => {
    const preview = row.normalized_data?.__preview ?? {};
    const incoming = preview.incoming_values ?? {};
    const grossAmount = resolveFinancialNetAmount(incoming);
    const matchedRelease =
      row.matched_release_id
        ? await prisma.release.findUnique({
            where: { id: row.matched_release_id },
            select: { labelName: true }
          })
        : null;
    const commissionRate =
      row.owner_user_id && ["MATCH", "UPDATE", "NEEDS_REVIEW"].includes(row.action)
        ? await resolvePlatformCommissionRateCached(
            row.owner_user_id,
            matchedRelease?.labelName ?? null,
            previewContext
          )
        : 0;
    const commissionAmount =
      row.owner_user_id && ["MATCH", "UPDATE", "NEEDS_REVIEW"].includes(row.action)
        ? Number((grossAmount * commissionRate).toFixed(2))
        : 0;
    const netAmount =
      row.owner_user_id && ["MATCH", "UPDATE", "NEEDS_REVIEW"].includes(row.action)
        ? Number((grossAmount - commissionAmount).toFixed(2))
        : 0;

    grossAmountTotal += grossAmount;
    commissionTotal += commissionAmount;
    netAmountTotal += netAmount;
    return {
      row_number: row.row_number,
      action: row.action,
      confidence_score: row.confidence_score,
      raw_data: row.raw_data,
      normalized_data: row.normalized_data,
      detected_match_rule: row.detected_match_rule ?? null,
      error_message: row.error_message ?? null,
      matched_release_id: row.matched_release_id ?? null,
      matched_track_id: row.matched_track_id ?? null,
      user_id: row.owner_user_id ?? null,
      gross_amount: grossAmount,
      net_amount: netAmount,
      commission_amount: commissionAmount,
      commission_rate: commissionRate
    };
  }));

  const created = await financialImportsRepo.create({
    data: {
      source_file_name: params.sourceFileName,
      file_format: params.parsed.fileFormat,
      detected_encoding: params.parsed.encoding,
      detected_delimiter: params.parsed.delimiter,
      header_row_index: params.parsed.headerRowIndex,
      status: "PREVIEW",
      total_rows: summary.total_rows,
      matched_rows: summary.matched_rows,
      update_rows: summary.update_rows,
      create_rows: summary.create_rows,
      conflict_rows: summary.conflict_rows,
      skipped_rows: summary.skipped_rows + summary.needs_review_rows,
      error_rows: summary.error_rows,
      gross_amount_total: grossAmountTotal,
      net_amount_total: netAmountTotal,
      commission_total: commissionTotal,
      auto_detected_map: params.detectedColumns,
      summary,
      started_at: new Date(),
      created_by_admin_id: params.adminId,
      rows: {
        createMany: {
          data: rowPayloads
        }
      }
    },
    include: FINANCIAL_IMPORT_INCLUDE
  });

  await importHistoryRepo.create({
    data: {
      import_type: "finance",
      import_id: created.id,
      action: "PREVIEW_CREATED",
      actor_id: params.adminId,
      description: "Financial import preview created",
      metadata: {
        detectedColumns: params.detectedColumns,
        summary,
        grossAmountTotal
      }
    }
  });

  return financialImportsRepo.findUniqueOrThrow({
    where: { id: created.id },
    include: FINANCIAL_IMPORT_INCLUDE
  });
}

async function recomputeFinancialPreviewSnapshot(importId: string) {
  const item = await prisma.financial_imports.findUnique({
    where: { id: importId },
    include: FINANCIAL_IMPORT_INCLUDE
  });

  if (!item || item.status !== "PREVIEW") {
    return item;
  }

  const previewContext = createFinancialApplyContext();
  let grossAmountTotal = 0;
  let netAmountTotal = 0;
  let commissionTotal = 0;

  const rowUpdates = await Promise.all(
    item.rows.map(async (row) => {
      const preview = (row.normalized_data as Record<string, unknown> | null)?.__preview as
        | Record<string, unknown>
        | undefined;
      const incoming = (preview?.incoming_values as Record<string, unknown> | undefined) ?? {};
      const grossAmount = resolveFinancialNetAmount(incoming);
      const canApply = Boolean(row.user_id && ["MATCH", "UPDATE", "NEEDS_REVIEW"].includes(row.action));
      const commissionRate = canApply
        ? await resolvePlatformCommissionRateCached(row.user_id, row.matched_release?.labelName ?? null, previewContext)
        : 0;
      const commissionAmount = canApply ? Number((grossAmount * commissionRate).toFixed(2)) : 0;
      const netAmount = canApply ? Number((grossAmount - commissionAmount).toFixed(2)) : 0;

      grossAmountTotal += grossAmount;
      commissionTotal += commissionAmount;
      netAmountTotal += netAmount;

      return {
        id: row.id,
        gross_amount: grossAmount,
        commission_rate: commissionRate,
        commission_amount: commissionAmount,
        net_amount: netAmount
      };
    })
  );

  const operations = rowUpdates.map((row) =>
    prisma.financial_import_rows.update({
      where: { id: row.id },
      data: {
        gross_amount: row.gross_amount,
        commission_rate: row.commission_rate,
        commission_amount: row.commission_amount,
        net_amount: row.net_amount
      }
    })
  );

  operations.push(
    prisma.financial_imports.update({
      where: { id: item.id },
      data: {
        gross_amount_total: grossAmountTotal,
        commission_total: commissionTotal,
        net_amount_total: netAmountTotal
      }
    })
  );

  await prisma.$transaction(operations);

  return prisma.financial_imports.findUnique({
    where: { id: importId },
    include: FINANCIAL_IMPORT_INCLUDE
  });
}

export async function previewCatalogImport(params: {
  adminId: string;
  sourceFileName: string;
  arrayBuffer: ArrayBuffer | Buffer;
  createMissing?: boolean;
}) {
  const parsed = await parseInputFile(params.sourceFileName, params.arrayBuffer);
  const detectedColumns = detectSmartColumns(parsed.headers);
  const matchContext = createSmartMatchContext();

  const rows: PreviewRow[] = [];
  for (let index = 0; index < parsed.rows.length; index += 1) {
    const raw = parsed.rows[index];
    const normalized = normalizeRow(raw, detectedColumns, index + 1);
    const match = await findCatalogMatchWithContext(normalized, matchContext);
    rows.push(buildCatalogRowPreview(raw, normalized, match));
  }

  return writeCatalogPreviewImport({
    adminId: params.adminId,
    sourceFileName: params.sourceFileName,
    parsed,
    detectedColumns,
    rows,
    createMissing: Boolean(params.createMissing)
  });
}

type GroupedFinancialPreviewInput = {
  raw: Record<string, string>;
  normalized: NormalizedRow;
};

function buildGroupedFinancialPreviewInputs(
  rows: Array<Record<string, string>>,
  detectedColumns: DetectedColumnMap
): GroupedFinancialPreviewInput[] {
  const grouped = new Map<
    string,
    {
      upc: string;
      firstRowNumber: number;
      rowNumbers: number[];
      rowsCount: number;
      grossAmount: number;
      titles: string[];
      platforms: string[];
      releaseDates: Date[];
      endDates: Date[];
      sample: NormalizedRow;
    }
  >();
  const previewInputs: GroupedFinancialPreviewInput[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const raw = rows[index];
    const normalized = normalizeRow(raw, detectedColumns, index + 1);
    const grossAmount = resolveFinancialNetAmount(normalized as Record<string, unknown>);
    const upc = normalizeAnalyticsUpc(normalized.upc ?? "");

    if (!upc) {
      previewInputs.push({ raw, normalized });
      continue;
    }

    const existing = grouped.get(upc);
    if (existing) {
      existing.rowNumbers.push(index + 1);
      existing.rowsCount += 1;
      existing.grossAmount = Number((existing.grossAmount + grossAmount).toFixed(2));
      if (normalized.title?.trim()) existing.titles.push(normalized.title.trim());
      if (normalized.platform?.trim()) existing.platforms.push(normalized.platform.trim());
      const releaseDate = parseDateLoose(normalized.release_date ?? null);
      const endDate = parseDateLoose(normalized.end_date ?? null);
      if (releaseDate) existing.releaseDates.push(releaseDate);
      if (endDate) existing.endDates.push(endDate);
      continue;
    }

    const releaseDate = parseDateLoose(normalized.release_date ?? null);
    const endDate = parseDateLoose(normalized.end_date ?? null);

    grouped.set(upc, {
      upc,
      firstRowNumber: index + 1,
      rowNumbers: [index + 1],
      rowsCount: 1,
      grossAmount,
      titles: normalized.title?.trim() ? [normalized.title.trim()] : [],
      platforms: normalized.platform?.trim() ? [normalized.platform.trim()] : [],
      releaseDates: releaseDate ? [releaseDate] : [],
      endDates: endDate ? [endDate] : [],
      sample: normalized
    });
  }

  const groupedInputs = [...grouped.values()]
    .sort((left, right) => left.firstRowNumber - right.firstRowNumber)
    .map((group) => {
      const normalized: NormalizedRow = {
        ...group.sample,
        row_number: group.firstRowNumber,
        upc: group.upc,
        gross_amount: group.grossAmount.toFixed(2),
        royalty_total: group.grossAmount.toFixed(2)
      };
      const uniqueTitles = [...new Set(group.titles.filter(Boolean))];
      const uniquePlatforms = [...new Set(group.platforms.filter(Boolean))];
      if (uniqueTitles.length > 0) {
        normalized.title = uniqueTitles[0];
      }
      if (uniquePlatforms.length > 0) {
        normalized.platform = uniquePlatforms.join(", ");
      }
      if (group.releaseDates.length > 0) {
        normalized.release_date = new Date(Math.min(...group.releaseDates.map((item) => item.getTime())))
          .toISOString()
          .slice(0, 10);
      }
      if (group.endDates.length > 0) {
        normalized.end_date = new Date(Math.max(...group.endDates.map((item) => item.getTime())))
          .toISOString()
          .slice(0, 10);
      }

      return {
        raw: {
          UPC: group.upc,
          Rows: String(group.rowsCount),
          SourceRows: group.rowNumbers.join(", "),
          Title: uniqueTitles.join(" / ") || normalized.title || "",
          Platform: normalized.platform || ""
        },
        normalized
      } satisfies GroupedFinancialPreviewInput;
    });

  return [...previewInputs, ...groupedInputs].sort(
    (left, right) => left.normalized.row_number - right.normalized.row_number
  );
}

export async function previewFinancialImport(params: {
  adminId: string;
  sourceFileName: string;
  arrayBuffer: ArrayBuffer | Buffer;
}) {
  const parsed = await parseInputFile(params.sourceFileName, params.arrayBuffer);
  const detectedColumns = detectSmartColumns(parsed.headers);
  const matchContext = createSmartMatchContext();
  const groupedRows = buildGroupedFinancialPreviewInputs(parsed.rows, detectedColumns);
  const rows = await mapWithConcurrency(groupedRows, 24, async ({ raw, normalized }) => {
    const match = await findFinancialMatchWithContext(normalized, matchContext);
    return buildFinancialRowPreview(raw, normalized, match);
  });

  return writeFinancialPreviewImport({
    adminId: params.adminId,
    sourceFileName: params.sourceFileName,
    parsed,
    detectedColumns,
    rows
  });
}

async function resolvePlatformCommissionRate(userId: string | null | undefined, labelName: string | null | undefined) {
  if (userId) {
    const contractRate = await prisma.contract_commission_rates.findFirst({
      where: { user_id: userId, active: true },
      orderBy: { created_at: "desc" }
    });
    if (contractRate) return numberFromLoose(contractRate.commission_rate);
  }

  if (labelName) {
    const labelRate = await prisma.label_commission_rates.findFirst({
      where: { label_name: labelName, active: true },
      orderBy: { created_at: "desc" }
    });
    if (labelRate) return numberFromLoose(labelRate.commission_rate);
  }

  if (userId) {
    const userRate = await prisma.user_commission_rates.findFirst({
      where: { user_id: userId, active: true },
      orderBy: { created_at: "desc" }
    });
    if (userRate) return numberFromLoose(userRate.commission_rate);
  }

  const globalRate = await prisma.platform_settings.findUnique({
    where: { key: "platform_commission_rate" }
  });

  return numberFromLoose(globalRate?.value_number) || SMART_DEFAULT_PLATFORM_COMMISSION_RATE;
}

async function resolvePlatformCommissionRateCached(
  userId: string | null | undefined,
  labelName: string | null | undefined,
  context: FinancialApplyContext
) {
  const cacheKey = `${userId ?? "anon"}::${normalizeCompact(labelName)}`;
  if (context.commissionRates.has(cacheKey)) {
    return context.commissionRates.get(cacheKey) ?? SMART_DEFAULT_PLATFORM_COMMISSION_RATE;
  }

  const resolved = await resolvePlatformCommissionRate(userId, labelName);
  context.commissionRates.set(cacheKey, resolved);
  return resolved;
}

function pickReleaseUpdates(normalized: Record<string, unknown>, release: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  const conflicts: Array<{ field: string; currentValue: unknown; nextValue: unknown }> = [];

  const mapping: Record<string, string> = {
    upc: "upc",
    title: "title",
    artist: "performer",
    label: "labelName",
    genre: "genre",
    language: "language"
  };

  for (const [incomingField, releaseField] of Object.entries(mapping)) {
    const incomingValue = normalized[incomingField];
    if (incomingValue === undefined || incomingValue === null || incomingValue === "") continue;
    const currentValue = release[releaseField];
    if (currentValue === null || currentValue === undefined || currentValue === "") {
      updates[releaseField] = incomingValue;
    } else if (String(currentValue) !== String(incomingValue)) {
      conflicts.push({ field: incomingField, currentValue, nextValue: incomingValue });
    }
  }

  return { updates, conflicts };
}

function pickTrackUpdates(normalized: Record<string, unknown>, track: Record<string, unknown>) {
  const updates: Record<string, unknown> = {};
  const conflicts: Array<{ field: string; currentValue: unknown; nextValue: unknown }> = [];

  const mapping: Record<string, string> = {
    isrc: "isrc",
    title: "title",
    language: "language"
  };

  for (const [incomingField, trackField] of Object.entries(mapping)) {
    const incomingValue = normalized[incomingField];
    if (incomingValue === undefined || incomingValue === null || incomingValue === "") continue;
    const currentValue = track[trackField];
    if (currentValue === null || currentValue === undefined || currentValue === "") {
      updates[trackField] = incomingValue;
    } else if (String(currentValue) !== String(incomingValue)) {
      conflicts.push({ field: incomingField, currentValue, nextValue: incomingValue });
    }
  }

  if (normalized.track_number) {
    const nextIndex = Math.max(1, Math.trunc(numberFromLoose(normalized.track_number)));
    if (!track.index) {
      updates.index = nextIndex;
    } else if (Number(track.index) !== nextIndex) {
      conflicts.push({ field: "track_number", currentValue: track.index, nextValue: nextIndex });
    }
  }

  return { updates, conflicts };
}

async function createMissingReleaseAndTrack(ownerUserId: string, normalized: Record<string, unknown>) {
  const releaseDate = parseDateLoose(normalized.release_date as string) ?? new Date();
  const release = await prisma.release.create({
    data: {
      preview: String(normalized.artwork_url || "/brand/logo.png"),
      title: String(normalized.title || "Imported release"),
      date: releaseDate,
      upc: normalized.upc ? String(normalized.upc) : null,
      userId: ownerUserId,
      language: String(normalized.language || "Russian"),
      performer: normalized.artist ? String(normalized.artist) : null,
      genre: String(normalized.genre || "Unknown"),
      labelName: normalized.label ? String(normalized.label) : null,
      startDate: releaseDate,
      preorderDate: releaseDate,
      type:
        normalized.track_number && numberFromLoose(normalized.track_number) > 1 ? "album" : "single",
      confirmed: false,
      status: "moderating"
    }
  });

  const track = await prisma.track.create({
    data: {
      releaseId: release.id,
      title: String(normalized.title || release.title),
      subtitle: null,
      isrc: normalized.isrc ? String(normalized.isrc) : null,
      roles: Prisma.JsonNull,
      preview_start: "00:00",
      language: String(normalized.language || release.language),
      track: "catalog-sync://placeholder-audio",
      author_rights: String(normalized.label || release.labelName || "ICECREAMMUSIC"),
      index: Math.max(1, Math.trunc(numberFromLoose(normalized.track_number || 1)))
    }
  });

  return { release, track };
}

export async function applyCatalogImport(params: { importId: string; adminId: string }) {
  const importJob = await prisma.catalog_imports.findUniqueOrThrow({
    where: { id: params.importId },
    include: {
      rows: { orderBy: { row_number: "asc" } },
      conflicts: true
    }
  });

  if (importJob.status === "CONFIRMED") {
    return importJob;
  }

  await prisma.$transaction(async (tx) => {
    const conflictRowIds = new Set(importJob.conflicts.map((item) => item.row_id).filter(Boolean));

    for (const row of importJob.rows) {
      const normalized = { ...(row.normalized_data as Record<string, unknown>) };
      delete normalized.__preview;

      if (conflictRowIds.has(row.id)) {
        continue;
      }

      if (row.matched_release_id || row.matched_track_id) {
        const release = row.matched_release_id
          ? await tx.release.findUnique({ where: { id: row.matched_release_id } })
          : null;
        const track = row.matched_track_id
          ? await tx.track.findUnique({ where: { id: row.matched_track_id } })
          : null;

        if (release) {
          const { updates } = pickReleaseUpdates(normalized, release as Record<string, unknown>);
          if (Object.keys(updates).length > 0) {
            await tx.release.update({ where: { id: release.id }, data: updates });
            await tx.catalog_updates.create({
              data: {
                import_id: importJob.id,
                row_id: row.id,
                entity_type: "release",
                entity_id: release.id,
                operation: "UPDATE",
                before_state: release,
                after_state: { ...release, ...updates }
              }
            });
          }
        }

        if (track) {
          const { updates } = pickTrackUpdates(normalized, track as Record<string, unknown>);
          if (Object.keys(updates).length > 0) {
            await tx.track.update({ where: { id: track.id }, data: updates });
            await tx.catalog_updates.create({
              data: {
                import_id: importJob.id,
                row_id: row.id,
                entity_type: "track",
                entity_id: track.id,
                operation: "UPDATE",
                before_state: track,
                after_state: { ...track, ...updates }
              }
            });
          }
        }

        continue;
      }

      if (row.action === "CREATE" && importJob.create_missing) {
        const ownerUserId = (row.normalized_data as Record<string, unknown>)?.__preview?.owner_user_id as
          | string
          | undefined;

        if (!ownerUserId) {
          await tx.catalog_import_logs.create({
            data: {
              import_id: importJob.id,
              level: "warn",
              message: "Create Missing Releases skipped: owner was not resolved",
              metadata: { rowNumber: row.row_number }
            }
          });
          continue;
        }

        const created = await createMissingReleaseAndTrack(ownerUserId, normalized);
        await tx.catalog_import_rows.update({
          where: { id: row.id },
          data: {
            created_release_id: created.release.id,
            created_track_id: created.track.id
          }
        });
        await tx.catalog_updates.create({
          data: {
            import_id: importJob.id,
            row_id: row.id,
            entity_type: "release",
            entity_id: created.release.id,
            operation: "CREATE_RELEASE",
            before_state: null,
            after_state: created.release
          }
        });
        await tx.catalog_updates.create({
          data: {
            import_id: importJob.id,
            row_id: row.id,
            entity_type: "track",
            entity_id: created.track.id,
            operation: "CREATE_TRACK",
            before_state: null,
            after_state: created.track
          }
        });
      }
    }

    await tx.catalog_imports.update({
      where: { id: importJob.id },
      data: {
        status: "CONFIRMED",
        confirmed_at: new Date()
      }
    });

    await tx.import_history.create({
      data: {
        import_type: "catalog",
        import_id: importJob.id,
        action: "APPLY",
        actor_id: params.adminId,
        description: "Catalog import applied"
      }
    });
  }, {
    maxWait: 10_000,
    timeout: 60_000
  });

  await createAdminLog(prisma, {
    adminId: params.adminId,
    action: "smart_catalog_apply",
    targetType: "catalog_import",
    targetId: params.importId
  });

  return prisma.catalog_imports.findUniqueOrThrow({
    where: { id: params.importId },
    include: CATALOG_IMPORT_INCLUDE
  });
}

export async function rollbackCatalogImport(params: { importId: string; adminId: string }) {
  const importJob = await prisma.catalog_imports.findUniqueOrThrow({
    where: { id: params.importId },
    include: {
      updates: { orderBy: { applied_at: "desc" } }
    }
  });

  if (importJob.status === "ROLLED_BACK") {
    return importJob;
  }

  await prisma.$transaction(async (tx) => {
    for (const update of importJob.updates) {
      if (update.rolled_back_at) continue;

      if (update.operation === "CREATE_TRACK") {
        await tx.track.deleteMany({ where: { id: update.entity_id } });
      } else if (update.operation === "CREATE_RELEASE") {
        await tx.release.deleteMany({ where: { id: update.entity_id } });
      } else if (update.operation === "UPDATE" && update.entity_type === "release" && update.before_state) {
        await tx.release.update({
          where: { id: update.entity_id },
          data: update.before_state as Record<string, unknown>
        });
      } else if (update.operation === "UPDATE" && update.entity_type === "track" && update.before_state) {
        await tx.track.update({
          where: { id: update.entity_id },
          data: update.before_state as Record<string, unknown>
        });
      }

      await tx.catalog_updates.update({
        where: { id: update.id },
        data: { rolled_back_at: new Date() }
      });
    }

    await tx.catalog_imports.update({
      where: { id: importJob.id },
      data: {
        status: "ROLLED_BACK",
        rolled_back_at: new Date()
      }
    });

    await tx.import_history.create({
      data: {
        import_type: "catalog",
        import_id: importJob.id,
        action: "ROLLBACK",
        actor_id: params.adminId,
        description: "Catalog import rolled back"
      }
    });
  }, {
    maxWait: 10_000,
    timeout: 60_000
  });

  return prisma.catalog_imports.findUniqueOrThrow({
    where: { id: params.importId },
    include: CATALOG_IMPORT_INCLUDE
  });
}

export async function applyFinancialImport(params: {
  importId: string;
  adminId: string;
  allocations?: FinancialAllocationAdjustment[];
  reportQuarter?: number | null;
  reportYear?: number | null;
}) {
  const financialImportsRepo = requireClientRepo<{
    findUniqueOrThrow: typeof prisma.financial_imports.findUniqueOrThrow;
  }>(prisma, "financial_imports", "financial import apply");

  const importJob = await financialImportsRepo.findUniqueOrThrow({
    where: { id: params.importId },
    include: {
      rows: {
        include: {
          matched_release: true,
          matched_track: true,
          user: true
        },
        orderBy: { row_number: "asc" }
      }
    }
  });

  if (importJob.status === "CONFIRMED") {
    return importJob;
  }

  const allocationOverrides = new Map<string, number>();
  const reportQuarter = normalizeReportQuarter(params.reportQuarter);
  const reportYear = normalizeReportYear(params.reportYear);
  for (const item of params.allocations ?? []) {
    if (!item?.rowId) continue;
    allocationOverrides.set(item.rowId, numberFromLoose(item.netAmount));
  }

  const state: FinancialApplyState & {
    allocations: Array<{
      rowId: string;
      rowNumber: number;
      platformName: string | null;
      upc: string | null;
      userId: string;
      userLabel: string | null;
      releaseId: string;
      releaseTitle: string | null;
      grossAmount: number;
      commissionAmount: number;
      commissionRate: number;
      netAmount: number;
      sourceRowsCount: number;
    }>;
  } = {
    previousBalances: {},
    financeReportIds: [],
    transactionIds: [],
    royaltyIds: [],
    royaltyTransactionIds: [],
    commissionIds: [],
    balanceTransactionIds: [],
    reportQuarter,
    reportYear,
    allocations: []
  };
  const applyContext = createFinancialApplyContext();

  await prisma.$transaction(async (tx) => {
    const releaseRepo = requireClientRepo<{
      findUnique: typeof tx.release.findUnique;
    }>(tx, "release", "financial import apply release lookup");
    const userRepo = requireClientRepo<{
      update: typeof tx.user.update;
    }>(tx, "user", "financial import apply balance update");
    const royaltyTransactionsRepo = requireClientRepo<{
      create: typeof tx.royalty_transactions.create;
    }>(tx, "royalty_transactions", "financial import apply royalty transactions");
    const balanceTransactionsRepo = requireClientRepo<{
      create: typeof tx.balance_transactions.create;
    }>(tx, "balance_transactions", "financial import apply balance transactions");
    const transactionRepo = getTransactionRepo<{
      create?: typeof tx.transaction.create;
    }>(tx, "transaction");
    const royaltyRepo = getTransactionRepo<{
      create: typeof tx.royalty.create;
    }>(tx, "royalty");
    const commissionRepo = getTransactionRepo<{
      create: typeof tx.commission_calculations.create;
    }>(tx, "commission_calculations");
    const financialImportRowsRepo = requireClientRepo<{
      update: typeof tx.financial_import_rows.update;
    }>(tx, "financial_import_rows", "financial import apply row updates");
    const financialImportRepo = requireClientRepo<{
      update: typeof tx.financial_imports.update;
    }>(tx, "financial_imports", "financial import apply import update");
    const importHistoryRepo = requireClientRepo<{
      create: typeof tx.import_history.create;
    }>(tx, "import_history", "financial import apply history");
    const financeReportRepo = getTransactionRepo<{
      create: (args: {
        data: {
          userId: string;
          periodStart: Date;
          periodEnd: Date;
          amount: number;
          currency: string;
          status: "READY_TO_CONFIRM";
          agreedAt: Date | null;
        };
      }) => Promise<{ id: string }>;
    }>(tx, "financeReport");
    const hasLegacyTransactionTable = await hasIcecreamTable(tx, "transaction");
    const hasLegacyRoyaltyTable = await hasIcecreamTable(tx, "royalty");
    const hasLegacyCommissionTable = await hasIcecreamTable(tx, "commission_calculations");
    const userAggregates = new Map<string, { amount: number; periodStart: Date; periodEnd: Date }>();
    let appliedGrossTotal = 0;
    let appliedCommissionTotal = 0;
    let appliedNetTotal = 0;

    for (const row of importJob.rows) {
      if (!row.user_id || !row.matched_release_id) continue;
      if (!["MATCH", "UPDATE", "NEEDS_REVIEW"].includes(row.action)) continue;

      const normalized = { ...(row.normalized_data as Record<string, unknown>) };
      const release =
        row.matched_release ?? (await releaseRepo.findUnique({ where: { id: row.matched_release_id } }));
      const grossAmount = Number(
        (
          numberFromLoose(row.gross_amount) ||
          resolveFinancialNetAmount({
            gross_amount: row.gross_amount,
            royalty_total: normalized.royalty_total,
            royalty_author: normalized.royalty_author,
            royalty_related: normalized.royalty_related
          })
        ).toFixed(2)
      );

      if (!grossAmount) {
        continue;
      }

      const overrideNetRaw = allocationOverrides.get(row.id);
      const overrideNet =
        overrideNetRaw === undefined ? null : Number(Math.min(grossAmount, Math.max(0, overrideNetRaw)).toFixed(2));
      let commissionRate = numberFromLoose(row.commission_rate);
      let netAmount = Number(numberFromLoose(row.net_amount).toFixed(2));
      let commissionAmount = Number(numberFromLoose(row.commission_amount).toFixed(2));

      if (overrideNet !== null) {
        netAmount = overrideNet;
        commissionAmount = Number((grossAmount - netAmount).toFixed(2));
        commissionRate = grossAmount > 0 ? Number((commissionAmount / grossAmount).toFixed(4)) : 0;
      } else if (!netAmount && !commissionAmount) {
        commissionRate = await resolvePlatformCommissionRateCached(
          row.user_id,
          release?.labelName ?? null,
          applyContext
        );
        commissionAmount = Number((grossAmount * commissionRate).toFixed(2));
        netAmount = Number((grossAmount - commissionAmount).toFixed(2));
      } else {
        netAmount = Number(Math.min(grossAmount, Math.max(0, netAmount)).toFixed(2));
        commissionAmount = Number((grossAmount - netAmount).toFixed(2));
        commissionRate = grossAmount > 0 ? Number((commissionAmount / grossAmount).toFixed(4)) : 0;
      }

      appliedGrossTotal += grossAmount;
      appliedCommissionTotal += commissionAmount;
      appliedNetTotal += netAmount;

      const statementDate = parseDateLoose(String(normalized.release_date || normalized.end_date || "")) ?? new Date();
      const periodStart = parseDateLoose(String(normalized.release_date || "")) ?? statementDate;
      const periodEnd = parseDateLoose(String(normalized.end_date || "")) ?? statementDate;

      let previousBalance = applyContext.currentBalances.get(row.user_id);
      if (previousBalance === undefined) {
        const initialBalance = Number(row.user?.balance ?? 0);
        previousBalance = initialBalance;
        applyContext.currentBalances.set(row.user_id, initialBalance);
        if (!(row.user_id in state.previousBalances)) {
          state.previousBalances[row.user_id] = initialBalance;
        }
      }
      const nextBalance = Number((previousBalance + netAmount).toFixed(2));
      applyContext.currentBalances.set(row.user_id, nextBalance);

      const upc = typeof normalized.upc === "string" ? normalized.upc : null;
      const sourceRowsCount = Math.max(1, Math.trunc(numberFromLoose((row.raw_data as Record<string, unknown> | null)?.Rows)));

      const royaltyTransaction = await royaltyTransactionsRepo.create({
        data: {
          financial_import_id: importJob.id,
          financial_import_row_id: row.id,
          user_id: row.user_id,
          release_id: row.matched_release_id,
          track_id: row.matched_track_id,
          gross_amount: grossAmount,
          platform_commission_amount: commissionAmount,
          commission_rate: commissionRate,
          net_amount: netAmount,
          platform_name: String(normalized.platform || ""),
          source_reference: String(upc || ""),
          metadata: {
            usageType: normalized.usage_type ?? null,
            quantity: numberFromLoose(normalized.quantity),
            upc,
            sourceRowsCount,
            sourceRows: (row.raw_data as Record<string, unknown> | null)?.SourceRows ?? null
          }
        }
      });
      state.royaltyTransactionIds.push(royaltyTransaction.id);

      const balanceTransaction = await balanceTransactionsRepo.create({
        data: {
          user_id: row.user_id,
          royalty_transaction_id: royaltyTransaction.id,
          amount: netAmount,
          direction: "CREDIT",
          balance_before: previousBalance,
          balance_after: nextBalance,
          description: `Royalty import ${importJob.source_file_name}`,
          metadata: {
            importId: importJob.id,
            rowId: row.id,
            upc,
            grossAmount,
            commissionAmount,
            commissionRate,
            netAmount
          }
        }
      });
      state.balanceTransactionIds.push(balanceTransaction.id);

      if (hasLegacyTransactionTable && transactionRepo?.create) {
        const txRecord = await transactionRepo.create({
          data: {
            userId: row.user_id,
            amount: netAmount,
            type: "ROYALTY",
            status: "COMPLETED",
            description: `Royalty added from ${importJob.source_file_name}`,
            processedAt: new Date(),
            metadata: {
              importId: importJob.id,
              rowId: row.id,
              upc,
              grossAmount,
              commissionAmount,
              commissionRate,
              netAmount
            }
          }
        });
        state.transactionIds.push(txRecord.id);
      }

      if (hasLegacyRoyaltyTable && royaltyRepo?.create) {
        const royalty = await royaltyRepo.create({
          data: {
            userId: row.user_id,
            releaseId: row.matched_release_id,
            amount: netAmount,
            statementDate,
            streams: Math.max(0, Math.trunc(numberFromLoose(normalized.quantity)))
          }
        });
        state.royaltyIds.push(royalty.id);
      }

      if (hasLegacyCommissionTable && commissionRepo?.create) {
        const commission = await commissionRepo.create({
          data: {
            financial_import_id: importJob.id,
            row_id: row.id,
            user_id: row.user_id,
            source_type: "royalty_import",
            source_reference: upc || importJob.source_file_name,
            gross_amount: grossAmount,
            commission_rate: commissionRate,
            commission_amount: commissionAmount,
            net_amount: netAmount
          }
        });
        state.commissionIds.push(commission.id);
      }

      await financialImportRowsRepo.update({
        where: { id: row.id },
        data: {
          gross_amount: grossAmount,
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          net_amount: netAmount
        }
      });

      state.allocations.push({
        rowId: row.id,
        rowNumber: row.row_number,
        platformName: String(normalized.platform || "") || null,
        upc,
        userId: row.user_id,
        userLabel: row.user?.name ?? row.user?.email ?? null,
        releaseId: row.matched_release_id,
        releaseTitle: release?.title ?? null,
        grossAmount,
        commissionAmount,
        commissionRate,
        netAmount,
        sourceRowsCount
      });

      const aggregate = userAggregates.get(row.user_id);
      if (aggregate) {
        aggregate.amount += netAmount;
        if (periodStart < aggregate.periodStart) aggregate.periodStart = periodStart;
        if (periodEnd > aggregate.periodEnd) aggregate.periodEnd = periodEnd;
      } else {
        userAggregates.set(row.user_id, {
          amount: netAmount,
          periodStart,
          periodEnd
        });
      }
    }

    for (const [userId, aggregate] of userAggregates.entries()) {
      if (!financeReportRepo?.create) {
        continue;
      }

      const reportItems: UserReportLineItem[] = state.allocations
        .filter((allocation) => allocation.userId === userId)
        .map((allocation, index) => ({
          id: `${allocation.rowId}:${index + 1}`,
          platformName: allocation.platformName?.trim() || "Без площадки",
          upc: allocation.upc?.trim() || "",
          releaseTitle: allocation.releaseTitle?.trim() || "Без названия",
          amount: Number(allocation.netAmount.toFixed(2))
        }));

      const reportId = randomUUID();
      let persistedReportId = reportId;

      try {
        const financeReport = await financeReportRepo.create({
          data: {
            userId,
            periodStart: aggregate.periodStart,
            periodEnd: aggregate.periodEnd,
            amount: Number(aggregate.amount.toFixed(2)),
            currency: "RUB",
            status: "READY_TO_CONFIRM",
            agreedAt: null
          }
        });
        persistedReportId = financeReport.id;
        state.financeReportIds.push(financeReport.id);
      } catch (error) {
        if (!isPrismaTableMissingError(error, "financeReport")) {
          throw error;
        }
      }

      if (hasLegacyTransactionTable && transactionRepo?.create) {
        const payloadTx = await transactionRepo.create({
          data: {
            userId,
            amount: 0,
            type: "ROYALTY",
            status: "PENDING",
            description: REPORT_PAYLOAD_DESCRIPTION,
            processedAt: null,
            metadata: buildStoredUserReportPayload({
              reportId: persistedReportId,
              workflowState: "ready_to_confirm",
              periodStart: aggregate.periodStart,
              periodEnd: aggregate.periodEnd,
              amount: Number(aggregate.amount.toFixed(2)),
              currency: "RUB",
              quarter: reportQuarter,
              year: reportYear,
              fallbackDate: aggregate.periodEnd,
              adminComment: null,
              items: reportItems
            })
          }
        });
        state.transactionIds.push(payloadTx.id);
      }
    }

    await financialImportRepo.update({
      where: { id: importJob.id },
      data: {
        status: "CONFIRMED",
        confirmed_at: new Date(),
        gross_amount_total: { set: Number(appliedGrossTotal.toFixed(2)) },
        net_amount_total: { set: Number(appliedNetTotal.toFixed(2)) },
        commission_total: { set: Number(appliedCommissionTotal.toFixed(2)) }
      }
    });

    await importHistoryRepo.create({
      data: {
        import_type: "finance",
        import_id: importJob.id,
        action: "APPLY",
        actor_id: params.adminId,
        description: "Financial import applied",
        metadata: state
      }
    });
  }, {
    maxWait: 10_000,
    timeout: 60_000
  });

  await createAdminLog(prisma, {
    adminId: params.adminId,
    action: "smart_financial_apply",
    targetType: "financial_import",
    targetId: params.importId
  });

  return financialImportsRepo.findUniqueOrThrow({
    where: { id: params.importId },
    include: FINANCIAL_IMPORT_INCLUDE
  });
}

export async function rollbackFinancialImport(params: { importId: string; adminId: string }) {
  const financialImportsRepo = requireClientRepo<{
    findUniqueOrThrow: typeof prisma.financial_imports.findUniqueOrThrow;
    update: typeof prisma.financial_imports.update;
  }>(prisma, "financial_imports", "financial import rollback");
  const importHistoryReadRepo = requireClientRepo<{
    findFirst: typeof prisma.import_history.findFirst;
  }>(prisma, "import_history", "financial import rollback history read");

  const importJob = await financialImportsRepo.findUniqueOrThrow({
    where: { id: params.importId }
  });

  const applyHistory = await importHistoryReadRepo.findFirst({
    where: {
      import_type: "finance",
      import_id: params.importId,
      action: "APPLY"
    },
    orderBy: { created_at: "desc" }
  });

  if (!applyHistory?.metadata) {
    await financialImportsRepo.update({
      where: { id: params.importId },
      data: {
        status: "ROLLED_BACK",
        rolled_back_at: new Date()
      }
    });

    return financialImportsRepo.findUniqueOrThrow({
      where: { id: params.importId },
      include: FINANCIAL_IMPORT_INCLUDE
    });
  }

  const metadata = applyHistory.metadata as FinancialApplyState;

  await prisma.$transaction(async (tx) => {
    const balanceTransactionsRepo = requireClientRepo<{
      deleteMany: typeof tx.balance_transactions.deleteMany;
    }>(tx, "balance_transactions", "financial import rollback balance transactions");
    const commissionRepo = getTransactionRepo<{
      deleteMany: typeof tx.commission_calculations.deleteMany;
    }>(tx, "commission_calculations");
    const royaltyTransactionsRepo = requireClientRepo<{
      deleteMany: typeof tx.royalty_transactions.deleteMany;
    }>(tx, "royalty_transactions", "financial import rollback royalty transactions");
    const transactionRepo = getTransactionRepo<{
      deleteMany?: typeof tx.transaction.deleteMany;
    }>(tx, "transaction");
    const royaltyRepo = getTransactionRepo<{
      deleteMany: typeof tx.royalty.deleteMany;
    }>(tx, "royalty");
    const financeReportRepo = getTransactionRepo<{
      deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<unknown>;
    }>(tx, "financeReport");
    const hasLegacyTransactionTable = await hasIcecreamTable(tx, "transaction");
    const hasLegacyRoyaltyTable = await hasIcecreamTable(tx, "royalty");
    const hasLegacyCommissionTable = await hasIcecreamTable(tx, "commission_calculations");
    const userRepo = requireClientRepo<{
      update: typeof tx.user.update;
    }>(tx, "user", "financial import rollback user balance");
    const financialImportRepo = requireClientRepo<{
      update: typeof tx.financial_imports.update;
    }>(tx, "financial_imports", "financial import rollback import update");
    const importHistoryRepo = requireClientRepo<{
      create: typeof tx.import_history.create;
    }>(tx, "import_history", "financial import rollback history");

    if (metadata.balanceTransactionIds?.length) {
      await balanceTransactionsRepo.deleteMany({
        where: { id: { in: metadata.balanceTransactionIds } }
      });
    }
    if (hasLegacyCommissionTable && metadata.commissionIds?.length && commissionRepo?.deleteMany) {
      await commissionRepo.deleteMany({
        where: { id: { in: metadata.commissionIds } }
      });
    }
    if (metadata.royaltyTransactionIds?.length) {
      await royaltyTransactionsRepo.deleteMany({
        where: { id: { in: metadata.royaltyTransactionIds } }
      });
    }
    if (hasLegacyTransactionTable && metadata.transactionIds?.length && transactionRepo?.deleteMany) {
      await transactionRepo.deleteMany({
        where: { id: { in: metadata.transactionIds } }
      });
    }
    if (hasLegacyRoyaltyTable && metadata.royaltyIds?.length && royaltyRepo?.deleteMany) {
      await royaltyRepo.deleteMany({
        where: { id: { in: metadata.royaltyIds } }
      });
    }
    if (metadata.financeReportIds?.length && financeReportRepo?.deleteMany) {
      await financeReportRepo.deleteMany({
        where: { id: { in: metadata.financeReportIds } }
      });
    }

    for (const [userId, balance] of Object.entries(metadata.previousBalances ?? {})) {
      await userRepo.update({
        where: { id: userId },
        data: { balance }
      });
    }

    await financialImportRepo.update({
      where: { id: params.importId },
      data: {
        status: "ROLLED_BACK",
        rolled_back_at: new Date()
      }
    });

    await importHistoryRepo.create({
      data: {
        import_type: "finance",
        import_id: params.importId,
        action: "ROLLBACK",
        actor_id: params.adminId,
        description: "Financial import rolled back"
      }
    });
  }, {
    maxWait: 10_000,
    timeout: 60_000
  });

  return financialImportsRepo.findUniqueOrThrow({
    where: { id: params.importId },
    include: FINANCIAL_IMPORT_INCLUDE
  });
}

export async function listSmartCatalogSyncImports(limit = 100) {
  const [catalog, finance] = await Promise.all([
    prisma.catalog_imports.findMany({
      orderBy: { created_at: "desc" },
      take: limit
    }),
    prisma.financial_imports.findMany({
      orderBy: { created_at: "desc" },
      take: limit
    })
  ]);

  return { catalog, finance };
}

export async function deleteSmartCatalogSyncImport(params: {
  kind: SmartImportKind;
  importId: string;
  adminId: string;
}) {
  if (params.kind === "catalog") {
    const item = await prisma.catalog_imports.findUnique({
      where: { id: params.importId },
      select: {
        id: true,
        status: true,
        source_file_name: true
      }
    });

    if (!item) {
      throw new Error("Import not found");
    }

    await prisma.$transaction(async (tx) => {
      const importHistoryRepo = requireClientRepo<{
        deleteMany: typeof tx.import_history.deleteMany;
      }>(tx, "import_history", "smart catalog sync import history cleanup");

      await importHistoryRepo.deleteMany({
        where: {
          import_type: "catalog",
          import_id: params.importId
        }
      });

      await tx.catalog_imports.delete({
        where: { id: params.importId }
      });
    });

    await createAdminLog({
      adminId: params.adminId,
      action: "catalog_sync_import_deleted",
      targetType: "catalog_import",
      targetId: params.importId,
      details: {
        kind: "catalog",
        status: item.status,
        source_file_name: item.source_file_name
      }
    }).catch(() => null);

    return {
      ok: true,
      id: params.importId,
      kind: params.kind
    };
  }

  const item = await prisma.financial_imports.findUnique({
    where: { id: params.importId },
    select: {
      id: true,
      status: true,
      source_file_name: true
    }
  });

  if (!item) {
    throw new Error("Import not found");
  }

  await prisma.$transaction(async (tx) => {
    const importHistoryRepo = requireClientRepo<{
      deleteMany: typeof tx.import_history.deleteMany;
    }>(tx, "import_history", "smart finance import history cleanup");

    await importHistoryRepo.deleteMany({
      where: {
        import_type: "finance",
        import_id: params.importId
      }
    });

    await tx.financial_imports.delete({
      where: { id: params.importId }
    });
  });

  await createAdminLog({
    adminId: params.adminId,
    action: "finance_import_deleted",
    targetType: "financial_import",
    targetId: params.importId,
    details: {
      kind: "finance",
      status: item.status,
      source_file_name: item.source_file_name
    }
  }).catch(() => null);

  return {
    ok: true,
    id: params.importId,
    kind: params.kind
  };
}

export async function getSmartCatalogSyncImportDetails(kind: SmartImportKind, importId: string) {
  if (kind === "catalog") {
    return prisma.catalog_imports.findUnique({
      where: { id: importId },
      include: CATALOG_IMPORT_INCLUDE
    });
  }

  const item = await prisma.financial_imports.findUnique({
    where: { id: importId },
    include: FINANCIAL_IMPORT_INCLUDE
  });

  if (!item) {
    return null;
  }

  if (item.status === "PREVIEW") {
    return recomputeFinancialPreviewSnapshot(importId);
  }

  return item;
}
