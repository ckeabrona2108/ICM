import assert from "node:assert/strict";
import test from "node:test";

import { getPublicFeedPayload, isFeedStorageUnavailableError } from "@/lib/public-feed-service";

test("feed storage unavailable matches missing social feed tables", () => {
  assert.equal(
    isFeedStorageUnavailableError(
      new Error("The table `icecream.social_activity_events` does not exist in the current database.")
    ),
    true
  );
  assert.equal(
    isFeedStorageUnavailableError(
      new Error("The table `icecream.unrelated_table` does not exist in the current database.")
    ),
    false
  );
});

test("public feed falls back to demo payload when feed storage tables are missing", async () => {
  const missingTablePrisma = new Proxy({}, {
    get() {
      return new Proxy(() => undefined, {
        get() {
          return () => {
            throw new Error("The table `icecream.social_activity_events` does not exist in the current database.");
          };
        },
        apply() {
          throw new Error("The table `icecream.social_activity_events` does not exist in the current database.");
        }
      });
    }
  }) as never;

  const payload = await getPublicFeedPayload({
    prisma: missingTablePrisma,
    scope: "all",
    type: "all",
    limit: 20
  });

  assert.equal(payload.scopeAccess, "granted");
  assert.equal(payload.hasMore, false);
  assert.equal(payload.items.length > 0, true);
  assert.equal(Array.isArray(payload.people), true);
  assert.equal(payload.community.status, "ready");
});
