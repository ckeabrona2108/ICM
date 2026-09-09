import assert from "node:assert/strict";
import test from "node:test";

import { retryPrismaSerializationConflict } from "@/lib/prisma-errors";

test("retries a serialization conflict before returning a payout result", async () => {
  let attempts = 0;
  const result = await retryPrismaSerializationConflict(async () => {
    attempts += 1;
    if (attempts < 3) {
      throw { code: "P2034", message: "Transaction failed due to a write conflict" };
    }
    return "created";
  });

  assert.equal(result, "created");
  assert.equal(attempts, 3);
});

test("does not retry a non-serialization error", async () => {
  let attempts = 0;
  await assert.rejects(
    retryPrismaSerializationConflict(async () => {
      attempts += 1;
      throw new Error("database unavailable");
    }),
    /database unavailable/
  );
  assert.equal(attempts, 1);
});
