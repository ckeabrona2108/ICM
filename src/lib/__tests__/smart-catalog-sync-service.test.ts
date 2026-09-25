// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinancialImportDetailsExportRows,
  detectSmartColumns,
  getDuplicateFinancialReportUserIds,
  resolveSelectedReportQuarterPeriod,
  shouldRollbackFinancialImportBeforeDelete
} from "@/lib/smart-catalog-sync-service";

test("selected finance report quarter resolves to quarter date range", () => {
  const period = resolveSelectedReportQuarterPeriod({
    quarter: 2,
    year: 2026
  });

  assert.equal(period?.periodStart.toISOString(), "2026-04-01T00:00:00.000Z");
  assert.equal(period?.periodEnd.toISOString(), "2026-06-30T23:59:59.999Z");
});

test("invalid finance report quarter selection returns null", () => {
  assert.equal(resolveSelectedReportQuarterPeriod({ quarter: 5, year: 2026 }), null);
  assert.equal(resolveSelectedReportQuarterPeriod({ quarter: 2, year: 1999 }), null);
});

test("duplicate report users are detected before reapplying an import period", () => {
  assert.deepEqual(
    getDuplicateFinancialReportUserIds(
      ["user-1", "user-2"],
      [{ userId: "user-1" }, { userId: "other-user" }, { userId: "user-1" }]
    ),
    ["user-1"]
  );
});

test("finance report csv columns detect artist, quantity and royalty detail fields", () => {
  const columns = detectSmartColumns([
    "UPC",
    "Название",
    "Исполнитель",
    "Платформа",
    "Вид использования",
    "Период начала",
    "Период окончания",
    "Количество",
    "Вознаграждение Лицензиара (Авторские)",
    "Вознаграждение Лицензиара (Смежные)",
    "Лейбл"
  ]);

  assert.equal(columns.upc, "UPC");
  assert.equal(columns.title, "Название");
  assert.equal(columns.artist, "Исполнитель");
  assert.equal(columns.platform, "Платформа");
  assert.equal(columns.usage_type, "Вид использования");
  assert.equal(columns.quantity, "Количество");
  assert.equal(columns.royalty_author, "Вознаграждение Лицензиара (Авторские)");
  assert.equal(columns.royalty_related, "Вознаграждение Лицензиара (Смежные)");
});

test("finance detail headings from distributor and streaming reports are detected", () => {
  const columns = detectSmartColumns([
    "Период использования",
    "Площадка",
    "Тип прав",
    "Территория",
    "Тип контента",
    "Название трека",
    "Название альбома",
    "Автор слов",
    "Автор музыки",
    "Доля авторских прав Лицензиара",
    "Доля смежных прав Лицензиара",
    "ISRC",
    "Код лицензиара",
    "Вознаграждение ЛИЦЕНЗИАРА за авторские права",
    "Вознаграждение ЛИЦЕНЗИАРА за смежные права",
    "Итого вознаграждение ЛИЦЕНЗИАРА",
    "Все прослушивания",
    "Прослушивания >30 секунд"
  ]);

  assert.equal(columns.usage_period, "Период использования");
  assert.equal(columns.platform, "Площадка");
  assert.equal(columns.rights_type, "Тип прав");
  assert.equal(columns.territory, "Территория");
  assert.equal(columns.content_type, "Тип контента");
  assert.equal(columns.title, "Название трека");
  assert.equal(columns.album_title, "Название альбома");
  assert.equal(columns.lyrics_author, "Автор слов");
  assert.equal(columns.music_author, "Автор музыки");
  assert.equal(columns.author_rights_share, "Доля авторских прав Лицензиара");
  assert.equal(columns.related_rights_share, "Доля смежных прав Лицензиара");
  assert.equal(columns.isrc, "ISRC");
  assert.equal(columns.licensee_code, "Код лицензиара");
  assert.equal(columns.royalty_author, "Вознаграждение ЛИЦЕНЗИАРА за авторские права");
  assert.equal(columns.royalty_related, "Вознаграждение ЛИЦЕНЗИАРА за смежные права");
  assert.equal(columns.royalty_total, "Итого вознаграждение ЛИЦЕНЗИАРА");
  assert.equal(columns.streams, "Все прослушивания");
  assert.equal(columns.paid_streams, "Прослушивания >30 секунд");
});

test("confirmed finance import is rolled back before deletion", () => {
  assert.equal(shouldRollbackFinancialImportBeforeDelete("CONFIRMED"), true);
  assert.equal(shouldRollbackFinancialImportBeforeDelete("PREVIEW"), false);
  assert.equal(shouldRollbackFinancialImportBeforeDelete("ROLLED_BACK"), false);
});

test("financial detail export uses net rights amounts after commission", () => {
  const [row] = buildFinancialImportDetailsExportRows([{
    action: "MATCH",
    user_id: "user-1",
    gross_amount: 9.59,
    net_amount: 5.76,
    commission_amount: 3.83,
    commission_rate: 0.4,
    normalized_data: { __preview: { incoming_values: { upc: "123" } } },
    raw_data: {
      SourceRowsData: [{
        rowNumber: 1,
        platformName: "VK Музыка",
        title: "Тест",
        amount: 9.59,
        authorAmount: 4.8,
        relatedAmount: 4.79
      }]
    }
  }]);

  assert.equal(row["К начислению"], 5.76);
  assert.equal(row["Комиссия ICECREAMMUSIC"], 3.83);
  assert.equal(
    Number((row["Вознаграждение Лицензиара (Авторские)"] + row["Вознаграждение Лицензиара (Смежные)"]).toFixed(2)),
    5.76
  );
});

test("financial detail export parses European royalty amounts", () => {
  const [row] = buildFinancialImportDetailsExportRows([{
    action: "MATCH",
    user_id: "user-1",
    gross_amount: "78.885,00",
    net_amount: "78.885,00",
    commission_amount: 0,
    commission_rate: 0,
    normalized_data: {
      __preview: {
        incoming_values: {
          royalty_total: "78.885,00"
        }
      }
    },
    raw_data: {}
  }]);

  assert.equal(row["Сумма до комиссии"], 78885);
  assert.equal(row["К начислению"], 78885);
});

test("financial detail export omits columns that are absent from the source report", () => {
  const [row] = buildFinancialImportDetailsExportRows([{
    action: "MATCH",
    user_id: "user-1",
    gross_amount: 0.02,
    net_amount: 0.02,
    commission_amount: 0,
    commission_rate: 0,
    normalized_data: {
      __preview: {
        incoming_values: {
          upc: "GUT12980",
          title: "11",
          platform: "vk",
          usage_type: "Аудиостриминг",
          royalty_author: 0,
          royalty_related: 0.02
        }
      }
    },
    raw_data: {}
  }]);

  assert.equal(row["Площадка"], "vk");
  assert.equal(row["Вид использования"], "Аудиостриминг");
  assert.equal("Территория" in row, false);
  assert.equal("Название альбома" in row, false);
  assert.equal("Все прослушивания" in row, false);
});
