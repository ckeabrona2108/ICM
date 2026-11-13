import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectClaimedSourceRowIds,
  describeSourceRollbackBlock,
  findActiveSupplementsOf,
  groupSupplementCandidates,
  isUnallocatedRow,
  readSupplementSummary,
  summarizeUnallocated,
  supplementReportComment,
  type CandidateRow
} from "../finance-unallocated";

const supplementSummary = (sourceImportId: string, sourceRowIds: string[]) => ({
  kind: "supplement",
  sourceImportId,
  sourceFileName: "q3.xlsx",
  sourceRowIds,
  userId: "u1"
});

test("only rows that paid nobody and carry money are unallocated", () => {
  assert.equal(isUnallocatedRow({ id: "a", import_id: "i", action: "SKIP", user_id: null, gross_amount: "10.5" }), true);
  assert.equal(isUnallocatedRow({ id: "b", import_id: "i", action: "MATCH", user_id: null, gross_amount: 3 }), true);
  assert.equal(isUnallocatedRow({ id: "c", import_id: "i", action: "MATCH", user_id: "u1", gross_amount: 3 }), false);
  assert.equal(isUnallocatedRow({ id: "d", import_id: "i", action: "SKIP", user_id: null, gross_amount: 0 }), false);
});

test("rows of confirmed supplements are claimed; rolled back supplements return them to the pool", () => {
  const claimed = collectClaimedSourceRowIds([
    { id: "s1", status: "CONFIRMED", summary: supplementSummary("i1", ["r1", "r2"]) },
    { id: "s2", status: "ROLLED_BACK", summary: supplementSummary("i1", ["r3"]) },
    { id: "s3", status: "CONFIRMED", summary: { kind: "other", sourceRowIds: ["r4"] } }
  ]);
  assert.deepEqual([...claimed].sort(), ["r1", "r2"]);
  assert.equal(readSupplementSummary({ kind: "other" }), null);
});

test("a source import is blocked from rollback while its supplements are confirmed", () => {
  const supplements = [
    { id: "s1", status: "CONFIRMED", summary: supplementSummary("i1", ["r1"]) },
    { id: "s2", status: "ROLLED_BACK", summary: supplementSummary("i1", ["r2"]) },
    { id: "s3", status: "CONFIRMED", summary: supplementSummary("i2", ["r3"]) }
  ];
  assert.deepEqual(findActiveSupplementsOf("i1", supplements).map((item) => item.id), ["s1"]);
  assert.match(describeSourceRollbackBlock([{ source_file_name: "Доначисление · Иван · q3.xlsx" }]), /Сначала откатите доначисления/);
});

test("summary splits unallocated money into paid later and remaining", () => {
  const result = summarizeUnallocated({
    imports: [
      { id: "i1", source_file_name: "q3.xlsx", quarter: 3, year: 2026 },
      { id: "i2", source_file_name: "q2.xlsx", quarter: 2, year: 2026 }
    ],
    rows: [
      { id: "r1", import_id: "i1", action: "SKIP", user_id: null, gross_amount: "100" },
      { id: "r2", import_id: "i1", action: "SKIP", user_id: null, gross_amount: "50.25" },
      { id: "r3", import_id: "i1", action: "MATCH", user_id: "u9", gross_amount: "999" },
      { id: "r4", import_id: "i2", action: "SKIP", user_id: null, gross_amount: "0" }
    ],
    claimed: new Set(["r1"])
  });
  assert.equal(result.totalAmount, 50.25);
  assert.equal(result.totalRows, 1);
  assert.equal(result.imports.length, 1);
  assert.deepEqual(
    { ...result.imports[0], confirmedAt: undefined },
    {
      importId: "i1",
      fileName: "q3.xlsx",
      quarter: 3,
      year: 2026,
      confirmedAt: undefined,
      unallocatedRows: 2,
      unallocatedAmount: 150.25,
      supplementedRows: 1,
      supplementedAmount: 100,
      remainingRows: 1,
      remainingAmount: 50.25
    }
  );
});

test("candidates group by source import and artist with warning flags", () => {
  const row = (overrides: Partial<CandidateRow>): CandidateRow => ({
    rowId: "r",
    importId: "i1",
    userId: "u1",
    userLabel: "Иван",
    releaseId: "rel1",
    releaseTitle: "Ночью",
    upc: "1234567890123",
    rule: "FINANCIAL_UPC",
    amount: 10,
    releaseAddedAfterImport: false,
    ...overrides
  });
  const candidates = groupSupplementCandidates({
    rows: [
      row({ rowId: "r1", amount: 10 }),
      row({ rowId: "r2", amount: 5.5, rule: "FINANCIAL_TITLE_ARTIST", releaseAddedAfterImport: true }),
      row({ rowId: "r3", releaseId: "rel2", releaseTitle: "Днём", amount: 20 }),
      row({ rowId: "r4", userId: "u2", userLabel: "Мария", amount: 1 })
    ],
    imports: new Map([["i1", { fileName: "q3.xlsx", quarter: 3, year: 2026 }]]),
    usersWithAccruals: new Set(["u2"]),
    payoutQuarters: new Map([["u2", new Set(["2026-3"])]])
  });

  assert.equal(candidates.length, 2);
  const [ivan, maria] = candidates;
  assert.equal(ivan.userId, "u1");
  assert.equal(ivan.amount, 35.5);
  assert.deepEqual(ivan.rowIds, ["r1", "r2", "r3"]);
  assert.deepEqual(ivan.releases.map((item) => [item.title, item.amount]), [["Днём", 20], ["Ночью", 15.5]]);
  assert.equal(ivan.needsCheck, true);
  assert.equal(ivan.firstAccrual, true);
  assert.equal(ivan.releaseAddedAfterImport, true);
  assert.equal(ivan.payoutDoneForQuarter, false);
  assert.equal(maria.firstAccrual, false);
  assert.equal(maria.payoutDoneForQuarter, true);
});

test("the artist comment names the original quarter", () => {
  assert.match(supplementReportComment(3, 2026, 3, 2026), /^Доначисление за 3 квартал 2026: /);
  assert.match(supplementReportComment(4, 2026, 3, 2026), /включено в отчёт за 4 квартал 2026/);
});
