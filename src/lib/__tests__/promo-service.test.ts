import test from "node:test";
import assert from "node:assert/strict";

import { computePromoAvailability } from "@/lib/promo-service";

test("promo is available immediately when UPC exists even before release date", () => {
  const result = computePromoAvailability({
    releaseDate: new Date("2026-07-12T00:00:00.000Z"),
    alreadySubmitted: false,
    upc: "123456789012",
    status: "approved",
    now: new Date("2026-07-05T12:00:00.000Z")
  });

  assert.equal(result.isPromoAvailable, true);
  assert.equal(result.unavailableReason, null);
});

test("promo stays available up to 7 days after release when UPC exists", () => {
  const result = computePromoAvailability({
    releaseDate: new Date("2026-06-28T00:00:00.000Z"),
    alreadySubmitted: false,
    upc: "123456789012",
    status: "approved",
    now: new Date("2026-07-05T12:00:00.000Z")
  });

  assert.equal(result.isPromoAvailable, true);
  assert.equal(result.unavailableReason, null);
});

test("promo is blocked after 7 days from release even when UPC exists", () => {
  const result = computePromoAvailability({
    releaseDate: new Date("2026-06-27T00:00:00.000Z"),
    alreadySubmitted: false,
    upc: "123456789012",
    status: "approved",
    now: new Date("2026-07-05T12:00:00.000Z")
  });

  assert.equal(result.isPromoAvailable, false);
  assert.equal(result.unavailableReason, "Недоступно: после выхода прошло больше 7 дней");
});

test("promo is blocked when release has no UPC", () => {
  const result = computePromoAvailability({
    releaseDate: new Date("2026-07-05T00:00:00.000Z"),
    alreadySubmitted: false,
    upc: "",
    status: "approved",
    now: new Date("2026-07-05T12:00:00.000Z")
  });

  assert.equal(result.isPromoAvailable, false);
  assert.equal(result.unavailableReason, "Недоступно: у релиза ещё нет UPC");
});

test("promo is blocked after repeat submission", () => {
  const result = computePromoAvailability({
    releaseDate: new Date("2026-07-05T00:00:00.000Z"),
    alreadySubmitted: true,
    upc: "123456789012",
    status: "approved",
    now: new Date("2026-07-05T12:00:00.000Z")
  });

  assert.equal(result.isPromoAvailable, false);
  assert.equal(result.unavailableReason, "Недоступно: релиз уже отправлен на промо");
});
