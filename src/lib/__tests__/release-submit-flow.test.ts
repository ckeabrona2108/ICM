import assert from "node:assert/strict";
import test from "node:test";

import { submitReleaseWithLatestDraft } from "@/lib/release-submit-flow";

test("submit saves latest draft before moderation submit", async () => {
  const calls: string[] = [];

  const result = await submitReleaseWithLatestDraft({
    saveLatestDraft: async () => {
      calls.push("save");
      return { releaseId: "rel_1", draftsCount: 2 };
    },
    submitForModeration: async (releaseId) => {
      calls.push(`submit:${releaseId}`);
    }
  });

  assert.deepEqual(calls, ["save", "submit:rel_1"]);
  assert.equal(result.releaseId, "rel_1");
});

test("submit does not call moderation when saving draft failed", async () => {
  let submitCalled = false;

  await assert.rejects(
    async () =>
      await submitReleaseWithLatestDraft({
        saveLatestDraft: async () => {
          throw new Error("save_failed");
        },
        submitForModeration: async () => {
          submitCalled = true;
        }
      }),
    /save_failed/
  );

  assert.equal(submitCalled, false);
});

test("submit propagates submit error after successful save", async () => {
  let saveCalled = false;

  await assert.rejects(
    async () =>
      await submitReleaseWithLatestDraft({
        saveLatestDraft: async () => {
          saveCalled = true;
          return { releaseId: "rel_2", draftsCount: 1 };
        },
        submitForModeration: async () => {
          throw new Error("submit_failed");
        }
      }),
    /submit_failed/
  );

  assert.equal(saveCalled, true);
});
