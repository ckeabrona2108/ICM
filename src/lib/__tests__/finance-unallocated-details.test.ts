import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_ROW_REASON, groupUnallocatedRows } from "@/lib/finance-unallocated";

const imports = new Map([
  ["imp-q2", { fileName: "q2.xlsx", quarter: 2, year: 2026 }],
  ["imp-q3", { fileName: "q3.xlsx", quarter: 3, year: 2026 }]
]);

const row = (id: string, importId: string, amount: number, data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id,
  import_id: importId,
  action: "SKIP",
  user_id: null,
  gross_amount: amount,
  error_message: null,
  normalized_data: data,
  ...extra
});

test("pool rows are grouped per track across imports, biggest money first, with the reasons", () => {
  const result = groupUnallocatedRows({
    imports,
    claimed: new Set(["paid-later"]),
    rows: [
      row("a1", "imp-q2", 100, { title: "Ночью", artist: "Слава", isrc: "ru1", platform: "VK", streams: "1 000", __preview: { reason: "UPC was not found in catalog." } }),
      row("a2", "imp-q3", 250.5, { title: "Ночью", artist: "Слава", isrc: "RU1", platform: "Яндекс", upc: "111" }),
      row("b1", "imp-q3", 900, { title: "Утро", artist: "Кто-то", internal_code: "X-1" }),
      row("paid-later", "imp-q3", 5000, { title: "Утро", artist: "Кто-то" }),
      row("applied", "imp-q3", 700, { title: "Чужой" }, { action: "MATCH", user_id: "u1" }),
      row("zero", "imp-q3", 0, { title: "Пусто" })
    ]
  });

  assert.equal(result.totalAmount, 1250.5);
  assert.equal(result.totalRows, 3);
  assert.deepEqual(result.groups.map((group) => group.title), ["Утро", "Ночью"]);
  const night = result.groups[1];
  assert.equal(night.amount, 350.5);
  assert.equal(night.rows, 2);
  assert.equal(night.streams, 1000);
  assert.deepEqual(night.platforms, ["VK", "Яндекс"]);
  assert.deepEqual(night.upcs, ["111"]);
  assert.deepEqual(night.imports.map((item) => item.quarterLabel), ["2 кв 2026", "3 кв 2026"]);
  assert.equal(night.reasons[0], "UPC не найден в каталоге");
  assert.deepEqual(result.groups[0].codes, ["X-1"]);
  assert.equal(result.groups[0].reasons[0], "Владелец не найден");
});

test("a row with no title, artist or codes is flagged as a likely totals line", () => {
  const result = groupUnallocatedRows({
    imports,
    claimed: new Set(),
    rows: [row("t", "imp-q2", 9679, { title: "", platform: "" }), row("p", "imp-q2", 10, { title: "A", platform: "vk, Звук,vk" })]
  });
  assert.equal(result.groups[0].title, "Без названия");
  assert.deepEqual(result.groups[0].reasons, [EMPTY_ROW_REASON]);
  assert.deepEqual(result.groups[1].platforms, ["vk", "Звук"]);
});
