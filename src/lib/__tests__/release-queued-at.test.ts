/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import { updateReleasePaymentStatusByAdmin } from "@/lib/admin-release-service";
import { isModerationDelayed } from "@/lib/moderation-schedule";
import { transferReleasePayment } from "@/lib/release-payment-transfer";
import { readReleaseModerationClaim, withReleaseModerationClaim } from "@/lib/release-moderation-claim";
import { readReleaseTimeline } from "@/lib/release-timeline";

const msk = (value: string) => new Date(`${value}:00+03:00`);
// Monday 23.11.2026 noon: sent. Thursday 26.11.2026 noon: paid.
const SENT = msk("2026-11-23T12:00");
const PAID = msk("2026-11-26T12:00");

function queuedAt(roles: Record<string, unknown>, moderationStartedAt: Date | null = null) {
  return readReleaseTimeline(roles, { moderationStartedAt }).queuedAt?.toISOString() ?? null;
}

test("a release paid or free at sending is queued when it is sent", () => {
  assert.equal(queuedAt({ timeline: { submittedAt: SENT.toISOString() } }), SENT.toISOString());
  // A subscription slot is taken at sending: not a later payment.
  assert.equal(
    queuedAt({
      timeline: { submittedAt: SENT.toISOString() },
      paymentUsage: { type: "subscription_included", usedAt: PAID.toISOString() }
    }),
    SENT.toISOString()
  );
  assert.equal(queuedAt({}), null);
});

test("a release paid later is queued at the payment", () => {
  assert.equal(
    queuedAt({ timeline: { submittedAt: SENT.toISOString(), queuedAt: PAID.toISOString() } }),
    PAID.toISOString()
  );
});

test("a queue mark left from an earlier round loses to the new sending", () => {
  const earlier = msk("2026-11-10T12:00").toISOString();
  assert.equal(queuedAt({ timeline: { submittedAt: SENT.toISOString(), queuedAt: earlier } }), SENT.toISOString());
  assert.equal(
    queuedAt({
      timeline: { submittedAt: SENT.toISOString() },
      paymentUsage: { type: "standalone_payment", usedAt: earlier }
    }),
    SENT.toISOString()
  );
});

test("releases queued before the mark existed get the moment from what was recorded then", () => {
  const sent = { submittedAt: SENT.toISOString() };
  assert.equal(
    queuedAt({ timeline: sent, paymentUsage: { type: "standalone_payment", usedAt: PAID.toISOString() } }),
    PAID.toISOString()
  );
  assert.equal(queuedAt({ timeline: sent, extrasSupplement: { paidAt: PAID.toISOString() } }), PAID.toISOString());
  assert.equal(queuedAt({ timeline: sent, paymentTransferredFrom: { at: PAID.toISOString() } }), PAID.toISOString());
  assert.equal(queuedAt({ timeline: sent }, PAID), PAID.toISOString());
});

test("sent on Monday, paid on Thursday: not late until the days counted from Thursday pass", () => {
  const roles = { timeline: { submittedAt: SENT.toISOString(), queuedAt: PAID.toISOString() } };
  const queued = readReleaseTimeline(roles).queuedAt!;

  // Counted from the sending it would be late from Wednesday noon already.
  assert.equal(isModerationDelayed(SENT, msk("2026-11-26T13:00")), true);
  // From the payment: answer Thu or Fri, the weekend is off, late from Monday 30.11 noon.
  assert.equal(isModerationDelayed(queued, msk("2026-11-26T13:00")), false);
  assert.equal(isModerationDelayed(queued, msk("2026-11-27T18:00")), false);
  assert.equal(isModerationDelayed(queued, msk("2026-11-30T11:00")), false);
  assert.equal(isModerationDelayed(queued, msk("2026-11-30T12:00")), true);
});

function fakeRelease(release: Record<string, unknown>) {
  const state = { release, updates: [] as any[] };
  const prisma = {
    release: {
      findUnique: async () => state.release,
      update: async ({ data }: any) => {
        state.updates.push(data);
        state.release = { ...state.release, ...data };
        return state.release;
      }
    }
  } as any;
  return { prisma, state };
}

test("«Отметить как оплачено» queues the release now", async () => {
  const { prisma, state } = fakeRelease({
    id: "rel_1",
    confirmed: false,
    roles: { lifecycleState: "moderation", timeline: { submittedAt: SENT.toISOString() } }
  });
  const before = Date.now();
  await updateReleasePaymentStatusByAdmin({ prisma, adminId: "admin_1", releaseId: "rel_1", paid: true });

  assert.equal(state.updates[0].confirmed, true);
  const queued = readReleaseTimeline(state.updates[0].roles).queuedAt!;
  assert.ok(queued.getTime() >= before);
  assert.equal(readReleaseTimeline(state.updates[0].roles).submittedAt?.toISOString(), SENT.toISOString());
});

test("«Снять оплату» also takes the release out of work", async () => {
  const roles = withReleaseModerationClaim(
    { lifecycleState: "moderation", timeline: { submittedAt: SENT.toISOString() } },
    { adminId: "admin_1", adminName: "Ника", at: PAID }
  );
  const { prisma, state } = fakeRelease({ id: "rel_1", confirmed: true, roles });
  await updateReleasePaymentStatusByAdmin({ prisma, adminId: "admin_1", releaseId: "rel_1", paid: false });

  assert.equal(state.updates[0].confirmed, false);
  assert.equal(readReleaseModerationClaim(state.updates[0].roles), null);
});

test("a moved payment queues the release at the moment of the move", async () => {
  const rows: Record<string, any> = {
    old: {
      id: "old",
      title: "TANCYI",
      status: "rejected",
      confirmed: true,
      upc: null,
      userId: "u1",
      roles: {
        lifecycleState: "changes_required",
        needsChanges: true,
        paymentUsage: { type: "standalone_payment", usedAt: msk("2026-11-01T12:00").toISOString() }
      }
    },
    new: {
      id: "new",
      title: "TANCYI",
      status: "moderating",
      confirmed: false,
      upc: null,
      userId: "u1",
      roles: { lifecycleState: "moderation", timeline: { submittedAt: SENT.toISOString() } }
    }
  };
  const db = {
    release: {
      findUnique: async ({ where }: any) => rows[where.id] ?? null,
      update: async ({ where, data }: any) => {
        rows[where.id] = { ...rows[where.id], ...data };
        return rows[where.id];
      }
    }
  } as any;

  const moved = await transferReleasePayment(db, { fromReleaseId: "old", toReleaseId: "new", adminId: "admin", at: PAID });
  assert.ok(moved);
  assert.equal(readReleaseTimeline(rows.new.roles).queuedAt?.toISOString(), PAID.toISOString());
});
