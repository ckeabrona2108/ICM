import assert from "node:assert/strict";
import test from "node:test";

import { artistVisibleReportComment } from "../report-comment";

test("artist does not see internal report notes", () => {
  assert.equal(artistVisibleReportComment(null), null);
  assert.equal(artistVisibleReportComment("   "), null);
  assert.equal(artistVisibleReportComment("Импорт ОТЧЕТЫ 2 кв.csv"), null);
  assert.equal(
    artistVisibleReportComment(
      "Персональная замена отчёта. Файл: a.xlsx. Старая сумма: 1 RUB. Новая сумма: 2 RUB."
    ),
    null
  );
});

test("artist sees a comment written for them", () => {
  assert.equal(
    artistVisibleReportComment("  Отчёт обновлён по данным дистрибьютора "),
    "Отчёт обновлён по данным дистрибьютора"
  );
});
