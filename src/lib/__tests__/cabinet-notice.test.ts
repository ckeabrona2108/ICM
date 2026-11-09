import assert from "node:assert/strict";
import test from "node:test";

import { normalizeCabinetNotice, visibleCabinetNotice } from "@/lib/cabinet-notice";

test("a switched-off or empty notice is not shown", () => {
  assert.equal(visibleCabinetNotice(normalizeCabinetNotice({ enabled: false, title: "Отчёт задерживается" })), null);
  assert.equal(visibleCabinetNotice(normalizeCabinetNotice({ enabled: true, title: "  ", message: "" })), null);
  assert.ok(visibleCabinetNotice(normalizeCabinetNotice({ enabled: true, title: "Отчёт задерживается" })));
});

test("only site links and https links are kept for the button", () => {
  assert.equal(normalizeCabinetNotice({ linkHref: "/dashboard/finance", linkLabel: "Финансы" }).linkHref, "/dashboard/finance");
  assert.equal(normalizeCabinetNotice({ linkHref: "javascript:alert(1)", linkLabel: "x" }).linkHref, "");
  assert.equal(normalizeCabinetNotice({ linkHref: "//evil.example", linkLabel: "x" }).linkHref, "");
  assert.equal(normalizeCabinetNotice({ linkHref: "", linkLabel: "Подробнее" }).linkLabel, "");
});

test("an unknown colour falls back to the warning one", () => {
  assert.equal(normalizeCabinetNotice({ tone: "red" }).tone, "warning");
});
