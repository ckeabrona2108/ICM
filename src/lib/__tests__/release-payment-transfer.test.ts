import assert from "node:assert/strict";
import test from "node:test";

import { getUserReleaseQuota } from "@/lib/release-quota";
import {
  isPaidReleaseAwaitingChanges,
  pickPaidTwin,
  transferReleasePayment,
  type PaidTwinCandidate
} from "@/lib/release-payment-transfer";

const usage = (type: string) => ({ type, usedAt: "2026-11-20T07:34:40.556Z", orderId: "order-1" });

function paidRejected(patch: Partial<PaidTwinCandidate> = {}): PaidTwinCandidate {
  return {
    id: "old",
    title: "TANCYI",
    status: "rejected",
    confirmed: true,
    upc: null,
    roles: {
      lifecycleState: "changes_required",
      needsChanges: true,
      paymentUsage: usage("standalone_payment"),
      submissionData: { upc: "5064000586945" }
    },
    ...patch
  };
}

test("the TANCYI case: a new release with the UPC of a paid release sent back for changes", () => {
  const twin = pickPaidTwin([paidRejected()], { id: "new", title: "TANCYI", upc: "5064000586945" });
  assert.deepEqual(twin, { id: "old", title: "TANCYI", match: "upc" });
});

test("the same title without the UPC only warns", () => {
  const twin = pickPaidTwin([paidRejected()], { id: "new", title: " tancyi ", upc: null });
  assert.equal(twin?.match, "title");
});

test("approved, unpaid, free, closed or already moved releases are not twins", () => {
  assert.equal(isPaidReleaseAwaitingChanges(paidRejected({ status: "approved", roles: { lifecycleState: "approved", paymentUsage: usage("standalone_payment") } })), false);
  assert.equal(isPaidReleaseAwaitingChanges(paidRejected({ confirmed: false })), false);
  assert.equal(isPaidReleaseAwaitingChanges(paidRejected({ roles: { lifecycleState: "changes_required", paymentUsage: usage("free_first_release") } })), false);
  assert.equal(isPaidReleaseAwaitingChanges(paidRejected({ roles: { lifecycleState: "changes_required", paymentUsage: usage("standalone_payment"), deletionRequest: { status: "deleted" } } })), false);
  assert.equal(isPaidReleaseAwaitingChanges(paidRejected({ roles: { lifecycleState: "changes_required", paymentUsage: usage("standalone_payment"), paymentMovedToReleaseId: "x" } })), false);
  assert.equal(isPaidReleaseAwaitingChanges(paidRejected()), true);
});

function fakeDb(rows: Record<string, { id: string; title: string; status: string; confirmed: boolean; upc: string | null; roles: unknown; userId: string }>) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  return {
    updates,
    db: {
      release: {
        findUnique: async ({ where }: { where: { id: string } }) => rows[where.id] ?? null,
        update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: where.id, data });
          rows[where.id] = { ...rows[where.id]!, ...(data as object) } as never;
          return rows[where.id];
        }
      }
    } as never
  };
}

test("the payment moves to the new release and the old one is closed", async () => {
  const old = paidRejected();
  const { db, updates } = fakeDb({
    old: { ...old, title: "TANCYI", status: "rejected", confirmed: true, userId: "u1" } as never,
    new: { id: "new", title: "TANCYI", status: "moderating", confirmed: false, upc: null, roles: { paymentReminders: { stage: 1 } }, userId: "u1" }
  });
  const moved = await transferReleasePayment(db, { fromReleaseId: "old", toReleaseId: "new", adminId: null });
  assert.deepEqual(moved, { fromTitle: "TANCYI", toTitle: "TANCYI" });

  const toUpdate = updates.find((update) => update.id === "new")!.data;
  const toRoles = toUpdate.roles as Record<string, unknown>;
  assert.equal(toUpdate.confirmed, true);
  assert.deepEqual(toRoles.paymentUsage, usage("standalone_payment"));
  assert.equal((toRoles.paymentTransferredFrom as Record<string, unknown>).releaseId, "old");
  assert.equal("paymentReminders" in toRoles, false);

  const fromRoles = updates.find((update) => update.id === "old")!.data.roles as Record<string, unknown>;
  assert.equal((fromRoles.deletionRequest as Record<string, unknown>).status, "deleted");
  assert.equal(fromRoles.paymentMovedToReleaseId, "new");
});

test("no transfer between artists or from a release already published", async () => {
  const other = fakeDb({
    old: { ...paidRejected(), userId: "u1" } as never,
    new: { id: "new", title: "TANCYI", status: "moderating", confirmed: false, upc: null, roles: {}, userId: "u2" }
  });
  assert.equal(await transferReleasePayment(other.db, { fromReleaseId: "old", toReleaseId: "new", adminId: "admin" }), null);
  assert.equal(other.updates.length, 0);

  const published = fakeDb({
    old: { ...paidRejected({ status: "approved", roles: { lifecycleState: "approved", paymentUsage: usage("standalone_payment") } }), userId: "u1" } as never,
    new: { id: "new", title: "TANCYI", status: "moderating", confirmed: false, upc: null, roles: {}, userId: "u1" }
  });
  assert.equal(await transferReleasePayment(published.db, { fromReleaseId: "old", toReleaseId: "new", adminId: "admin" }), null);
});

test("a moved subscription payment holds one slot, not two", async () => {
  const subscription = { type: "subscription", usedAt: new Date().toISOString(), plan: "STANDARD" };
  const client = {
    user: { findUnique: async () => ({ isSubscribed: true, subscribeLevel: "standard", expiresAt: new Date(Date.now() + 20 * 86_400_000) }) },
    release: {
      findMany: async () => [
        { id: "old", date: new Date(), confirmed: true, roles: { paymentUsage: subscription, paymentMovedToReleaseId: "new" } },
        { id: "new", date: new Date(), confirmed: true, roles: { paymentUsage: subscription } }
      ]
    },
    orders: { findMany: async () => [] }
  } as never;
  const quota = await getUserReleaseQuota("u1", client);
  assert.equal(quota.used, 1);
});
