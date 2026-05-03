import assert from "node:assert/strict";
import test from "node:test";

import {
  hasInconsistentListState,
  normalizePagination
} from "@/lib/releases-list-utils";

test("normalizePagination resets out-of-range page to first available page", () => {
  const pagination = normalizePagination({
    total: 1,
    page: 3,
    perPage: 20
  });

  assert.equal(pagination.safePage, 1);
  assert.equal(pagination.totalPages, 1);
  assert.equal(pagination.start, 0);
  assert.equal(pagination.end, 20);
});

test("hasInconsistentListState flags non-empty totals with zero visible items", () => {
  assert.equal(
    hasInconsistentListState({ total: 1, visibleItemsCount: 0 }),
    true
  );
  assert.equal(
    hasInconsistentListState({ total: 0, visibleItemsCount: 0 }),
    false
  );
  assert.equal(
    hasInconsistentListState({ total: 1, visibleItemsCount: 1 }),
    false
  );
});
