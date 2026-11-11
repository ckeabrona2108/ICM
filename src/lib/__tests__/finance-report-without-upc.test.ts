// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import { buildFinanceImportOverview, periodSortKey } from "@/lib/finance-import-overview";
import {
  buildGroupedFinancialPreviewInputs,
  detectSmartColumns,
  parseInputFile,
  pickFinancialTrackByTitleArtist
} from "@/lib/smart-catalog-sync-service";

const HEADER = ["ПО КОД/ISRC", "Название", "Исполнитель", "Платформа", "Тип использования", "Период реализации", "Кол-во", "Авторские", "Смежные", "Импринт"];

function distributorWorkbook() {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Контрагент:", "Иванов Иван Иванович"],
    ["Договор:", "Ф/И/01"],
    ["Период:", "Q3 2026"],
    [],
    HEADER,
    ["GUT12980", "11", "SMOKEFULLBOY", "Likee", "Видео", "10-12.2025", 1, 0, 0.05, "Ckeabrona Beats"],
    ["GUT12980", "11", "SMOKEFULLBOY", "Яндекс.Музыка", "Подписка", "04-06.2026", 5, 0.02, 0, "Ckeabrona Beats"],
    ["GUT200193", "19", "OTALOE", "vk", "Аудиостриминг", "07.2026", 5, 0, 0.08, "ICECREAMMUSIC"],
    ["", "", "", "", "", "ИТОГО:", 11, 0.02, 0.14, ""]
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Сводная таблица");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

test("distributor report: header under the preamble is found and the totals line is not a sale", async () => {
  const parsed = await parseInputFile("report.xlsx", distributorWorkbook());

  assert.deepEqual(parsed.headers, HEADER);
  assert.equal(parsed.rows.length, 3);
  assert.deepEqual(parsed.meta.preamble[0], { label: "Контрагент", value: "Иванов Иван Иванович" });
  assert.equal(parsed.meta.footerTotals["Смежные"], 0.14);
  assert.equal(parsed.meta.footerTotals["Кол-во"], 11);
});

test("distributor report columns: GUT code, usage type, period, quantity and imprint are recognised", () => {
  const columns = detectSmartColumns(HEADER);

  assert.equal(columns.internal_code, "ПО КОД/ISRC");
  assert.equal(columns.isrc, undefined);
  assert.equal(columns.usage_type, "Тип использования");
  assert.equal(columns.usage_period, "Период реализации");
  assert.equal(columns.quantity, "Кол-во");
  assert.equal(columns.label, "Импринт");
});

test("rows without UPC are grouped by distributor code with summed amounts", async () => {
  const parsed = await parseInputFile("report.xlsx", distributorWorkbook());
  const groups = buildGroupedFinancialPreviewInputs(parsed.rows, detectSmartColumns(parsed.headers));

  assert.equal(groups.length, 2);
  const first = groups[0];
  assert.equal(first.raw["Код"], "GUT12980");
  assert.equal(first.normalized.upc, undefined);
  assert.equal(first.normalized.internal_code, "GUT12980");
  assert.equal(first.normalized.royalty_total, "0.07");
  assert.equal(first.normalized.quantity, "6");
  assert.equal(first.raw.SourceRowsData.length, 2);
});

function candidate(id, title, performer, userId, extra = {}) {
  return { id, title, releaseId: `r-${id}`, release: { id: `r-${id}`, title, performer, userId, upc: "5063466998422", confirmed: true, ...extra } };
}

test("title + artist match: same title and artist from one owner is matched", () => {
  const picked = pickFinancialTrackByTitleArtist({
    title: "19",
    artist: "OTALOE",
    candidates: [candidate("a", "19", "Otaloe", "u1"), candidate("b", "19", "Somebody", "u2")]
  });
  assert.equal(picked.outcome, "match");
  assert.equal(picked.candidate.id, "a");
});

test("title + artist match: a featured artist in the report still finds the main performer", () => {
  const picked = pickFinancialTrackByTitleArtist({
    title: "GSEX",
    artist: "Evianway, Fakinlaver",
    candidates: [candidate("a", "GSEX", "Evianway", "u1")]
  });
  assert.equal(picked.outcome, "match");
});

test("title + artist match: a different artist is never paid on title alone", () => {
  const picked = pickFinancialTrackByTitleArtist({
    title: "11",
    artist: "SMOKEFULLBOY",
    candidates: [candidate("a", "11", "Other Artist", "u1")]
  });
  assert.equal(picked.outcome, "weak");
  assert.match(picked.hint, /Other Artist/);
});

test("title + artist match: the same artist under two accounts is ambiguous", () => {
  const picked = pickFinancialTrackByTitleArtist({
    title: "11",
    artist: "SMOKEFULLBOY",
    candidates: [candidate("a", "11", "SMOKEFULLBOY", "u1"), candidate("b", "11", "Smokefullboy", "u2")]
  });
  assert.equal(picked.outcome, "ambiguous");
});

test("overview reconciles against the file totals and splits the money", () => {
  const rows = [
    {
      id: "1",
      action: "MATCH",
      user_id: "u1",
      matched_release_id: "r1",
      detected_match_rule: "FINANCIAL_TITLE_ARTIST",
      gross_amount: 0.07,
      net_amount: 0.06,
      commission_amount: 0.01,
      raw_data: {
        SourceRowsData: [
          { platformName: "Likee", amount: 0.05, quantity: 1, usagePeriod: "10-12.2025", usageType: "Видео", authorAmount: 0, relatedAmount: 0.05 },
          { platformName: "Яндекс.Музыка", amount: 0.02, quantity: 5, usagePeriod: "04-06.2026", usageType: "Подписка", authorAmount: 0.02, relatedAmount: 0 }
        ]
      },
      normalized_data: { internal_code: "GUT12980", title: "11" }
    },
    {
      id: "2",
      action: "SKIP",
      detected_match_rule: "NOT_FOUND",
      gross_amount: 0.08,
      raw_data: { SourceRowsData: [{ platformName: "vk", amount: 0.08, quantity: 5, usagePeriod: "07.2026", authorAmount: 0, relatedAmount: 0.08 }] },
      normalized_data: { internal_code: "GUT200193", title: "19", artist: "OTALOE", __preview: { reason: "Трек с таким названием не найден в каталоге." } }
    }
  ];
  const overview = buildFinanceImportOverview({
    rows,
    fileMeta: { footerTotals: { "Кол-во": 11, "Авторские": 0.02, "Смежные": 0.14 } },
    detectedColumns: detectSmartColumns(HEADER)
  });

  assert.equal(overview.totalAmount, 0.15);
  assert.equal(overview.toArtists, 0.06);
  assert.equal(overview.commission, 0.01);
  assert.equal(overview.unmatched.amount, 0.08);
  assert.equal(overview.unmatchedItems[0].identifier, "GUT200193");
  assert.deepEqual(overview.byPeriod.map((item) => item.name), ["10-12.2025", "04-06.2026", "07.2026"]);
  const related = overview.reconciliation.find((line) => line.label === "Смежные");
  assert.equal(related.difference, -0.01);
  const total = overview.reconciliation.find((line) => line.label === "Итого");
  assert.equal(total.fileTotal, 0.16);
  assert.equal(overview.reconciliation.find((line) => line.label === "Количество").difference, 0);
});

test("period sort key orders quarters and months", () => {
  assert.ok(periodSortKey("10-12.2025") < periodSortKey("01-03.2026"));
  assert.ok(periodSortKey("06.2026") < periodSortKey("07.2026"));
});
