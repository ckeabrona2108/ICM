import assert from "node:assert/strict";
import test from "node:test";

import { updateReleasePaymentStatusByAdmin } from "@/lib/admin-release-service";

test("updateReleasePaymentStatusByAdmin updates confirmed when value changes", async () => {
  let savedConfirmed: boolean | null = null;

  const result = await updateReleasePaymentStatusByAdmin({
    prisma: {
      release: {
        findUnique: async () => ({ id: "rel_1", confirmed: false }),
        update: async ({ data }: { data: { confirmed: boolean } }) => {
          savedConfirmed = data.confirmed;
          return {};
        }
      }
    } as never,
    adminId: "admin_1",
    releaseId: "rel_1",
    paid: true
  });

  assert.equal(result?.releaseId, "rel_1");
  assert.equal(result?.confirmed, true);
  assert.equal(savedConfirmed, true);
});

test("updateReleasePaymentStatusByAdmin skips update when confirmed is already current", async () => {
  let updateCalled = false;

  const result = await updateReleasePaymentStatusByAdmin({
    prisma: {
      release: {
        findUnique: async () => ({ id: "rel_1", confirmed: true }),
        update: async () => {
          updateCalled = true;
          return {};
        }
      }
    } as never,
    adminId: "admin_1",
    releaseId: "rel_1",
    paid: true
  });

  assert.equal(result?.confirmed, true);
  assert.equal(updateCalled, false);
});
