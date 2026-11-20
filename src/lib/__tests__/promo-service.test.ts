import test from "node:test";
import assert from "node:assert/strict";

import { computePromoAvailability } from "@/lib/promo-service";

const NOW = new Date("2026-07-05T12:00:00.000Z");

function check(releaseDate: string, upc = "123456789012", alreadySubmitted = false) {
  return computePromoAvailability({
    releaseDate: new Date(`${releaseDate}T00:00:00.000Z`),
    alreadySubmitted,
    upc,
    status: "approved",
    now: NOW
  });
}

test("a request 13 or more days before the release is on time for pitching", () => {
  const result = check("2026-07-18");
  assert.equal(result.isPromoAvailable, true);
  assert.equal(result.unavailableReason, null);
  assert.equal(result.pitchingLate, false);
  assert.equal(result.pitchingDeadline, "2026-07-05");
});

test("a later request is accepted with a warning until the release day", () => {
  const soon = check("2026-07-17");
  assert.equal(soon.isPromoAvailable, true);
  assert.equal(soon.pitchingLate, true);
  assert.equal(soon.pitchingDeadline, "2026-07-04");

  const releaseDay = check("2026-07-05");
  assert.equal(releaseDay.isPromoAvailable, true);
  assert.equal(releaseDay.pitchingLate, true);
});

test("requests close once the release is out", () => {
  const result = check("2026-07-04");
  assert.equal(result.isPromoAvailable, false);
  assert.equal(result.unavailableReason, "Недоступно: релиз уже вышел. Заявку на промо можно подать до дня выхода");
});

test("promo waits for the UPC given on approval", () => {
  const result = check("2026-08-01", "");
  assert.equal(result.isPromoAvailable, false);
  assert.equal(result.unavailableReason, "Откроется после модерации: у релиза ещё нет UPC");
});

test("promo is blocked after repeat submission", () => {
  const result = check("2026-08-01", "123456789012", true);
  assert.equal(result.isPromoAvailable, false);
  assert.equal(result.unavailableReason, "Недоступно: релиз уже отправлен на промо");
});
