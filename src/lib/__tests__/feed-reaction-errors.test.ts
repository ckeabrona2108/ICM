import assert from "node:assert/strict";
import test from "node:test";

import { resolveFeedReactionErrorResponse } from "@/lib/feed-reaction-errors";

test("feed reaction errors degrade missing reaction tables to JSON 503", () => {
  const response = resolveFeedReactionErrorResponse(
    new Error("The table `icecream.artist_profile_post_likes` does not exist in the current database.")
  );

  assert.deepEqual(response, { error: "Реакции временно недоступны", status: 503 });
});

test("feed reaction errors degrade connection failures to JSON 503", () => {
  const response = resolveFeedReactionErrorResponse(
    new Error("Can't reach database server at `localhost:5433`")
  );

  assert.deepEqual(response, { error: "Реакции временно недоступны", status: 503 });
});

test("feed reaction errors leave unknown failures for route-level 500 handling", () => {
  assert.equal(resolveFeedReactionErrorResponse(new Error("Unexpected invariant violation")), null);
});
