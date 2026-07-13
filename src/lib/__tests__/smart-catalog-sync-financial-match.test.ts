import assert from "node:assert/strict";
import test from "node:test";

import { pickFinancialReleaseMatchByNormalizedUpc } from "@/lib/smart-catalog-sync-service";

test("financial UPC fallback matches release by normalized UPC and title", () => {
  const match = pickFinancialReleaseMatchByNormalizedUpc({
    normalizedUpc: "5063466256706",
    title: "Последний танец",
    candidates: [
      {
        id: "release_1",
        upc: "5063466256706\u200B",
        title: "Последний танец",
        userId: "user_1",
        track: [{ id: "track_1", title: "Последний танец" }]
      }
    ]
  });

  assert.equal(match?.release.id, "release_1");
  assert.equal(match?.track?.id, "track_1");
});

test("financial UPC fallback does not match different normalized UPC", () => {
  const match = pickFinancialReleaseMatchByNormalizedUpc({
    normalizedUpc: "5063466256706",
    title: "Последний танец",
    candidates: [
      {
        id: "release_1",
        upc: "9999999999999",
        title: "Последний танец",
        userId: "user_1",
        track: [{ id: "track_1", title: "Последний танец" }]
      }
    ]
  });

  assert.equal(match, null);
});

test("financial UPC fallback prefers confirmed release when duplicate UPC exists", () => {
  const match = pickFinancialReleaseMatchByNormalizedUpc({
    normalizedUpc: "5063635044004",
    title: "НЕ БОЮСЬ",
    candidates: [
      {
        id: "release_unconfirmed",
        upc: "5063635044004",
        title: "НЕ БОЮСЬ",
        userId: "user_1",
        confirmed: false,
        track: [{ id: "track_1", title: "НЕ БОЮСЬ" }]
      },
      {
        id: "release_confirmed",
        upc: "5063635044004",
        title: "NOT AFRAID",
        userId: "user_2",
        confirmed: true,
        track: [{ id: "track_2", title: "NOT AFRAID" }]
      }
    ]
  });

  assert.equal(match?.release.id, "release_confirmed");
});
