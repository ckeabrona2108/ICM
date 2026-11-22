/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  rejectReleaseByAdmin,
  setReleaseModerationClaimByAdmin,
  withAdminReleaseChangesRequiredState
} from "@/lib/admin-release-service";
import { withReleaseLifecycleState } from "@/lib/release-counts";
import {
  getActiveReleaseModerationClaim,
  isReleaseClaimedByModerator,
  readReleaseModerationClaim,
  RELEASE_MODERATION_CLAIMED_MESSAGE,
  withReleaseModerationClaim,
  withoutReleaseModerationClaim
} from "@/lib/release-moderation-claim";
import { canCancelModeration, canEditRelease } from "@/lib/release-policy";
import { withReleaseTimelineStamp } from "@/lib/release-timeline";

const SUBMITTED = new Date("2026-11-20T10:00:00.000Z");
const CLAIMED = new Date("2026-11-20T12:00:00.000Z");

function onModeration(extra: Record<string, unknown> = {}) {
  return withReleaseLifecycleState(withReleaseTimelineStamp(extra, "submittedAt", SUBMITTED), "moderation");
}

function claimed(roles: Record<string, unknown> = onModeration()) {
  return withReleaseModerationClaim(roles, { adminId: "admin_1", adminName: "Ника", at: CLAIMED });
}

test("a claim stores who took the release and when", () => {
  const roles = claimed();
  assert.deepEqual(readReleaseModerationClaim(roles), {
    adminId: "admin_1",
    adminName: "Ника",
    claimedAt: CLAIMED.toISOString()
  });
  assert.equal(isReleaseClaimedByModerator("moderating", roles), true);
  assert.equal(isReleaseClaimedByModerator("moderating", withoutReleaseModerationClaim(roles)), false);
});

test("a claim locks only a release on moderation", () => {
  const roles = withReleaseLifecycleState(claimed(), "changes_required");
  assert.equal(isReleaseClaimedByModerator("moderating", roles), false);
  assert.equal(isReleaseClaimedByModerator("approved", withReleaseLifecycleState(claimed(), "approved")), false);
});

test("a claim from an earlier round does not lock a resubmitted version", () => {
  const roles = withReleaseTimelineStamp(claimed(), "submittedAt", new Date("2026-11-21T09:00:00.000Z"));
  assert.equal(getActiveReleaseModerationClaim("moderating", roles), null);
});

test("broken claim records are ignored", () => {
  assert.equal(readReleaseModerationClaim({ moderationClaim: { adminId: "", claimedAt: CLAIMED.toISOString() } }), null);
  assert.equal(readReleaseModerationClaim({ moderationClaim: { adminId: "a", claimedAt: "not a date" } }), null);
  assert.equal(readReleaseModerationClaim(null), null);
});

test("the artist can neither edit nor cancel a claimed release", () => {
  const edit = canEditRelease({ status: "moderation", moderationStarted: false, claimedByModerator: true });
  assert.equal(edit.allowed, false);
  assert.equal(edit.requiresCancellation, undefined);
  assert.equal(edit.message, RELEASE_MODERATION_CLAIMED_MESSAGE);

  const cancel = canCancelModeration({ status: "moderation", moderationStarted: false, claimedByModerator: true });
  assert.deepEqual(cancel, { allowed: false, message: RELEASE_MODERATION_CLAIMED_MESSAGE });

  // Without the claim an unpaid release on moderation can still be withdrawn, as before.
  assert.equal(canCancelModeration({ status: "moderation", moderationStarted: false }).allowed, true);
  // A stale flag does not matter once the release left moderation.
  assert.equal(canEditRelease({ status: "changes_required", claimedByModerator: true }).allowed, true);
});

function fakePrisma(release: Record<string, unknown> | null) {
  const state = { release, updates: [] as any[], logs: [] as any[], locked: 0 };
  const tx = {
    $queryRaw: async () => {
      state.locked += 1;
      return [];
    },
    release: {
      findUnique: async () => state.release,
      update: async ({ data }: any) => {
        state.updates.push(data);
        state.release = { ...(state.release as Record<string, unknown>), ...data };
        return state.release;
      }
    },
    adminLog: {
      create: async ({ data }: any) => {
        state.logs.push(data);
        return data;
      }
    }
  };
  const prisma = { ...tx, $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) };
  return { prisma: prisma as any, state };
}

test("«Взять в работу» marks the release and writes the admin log", async () => {
  const { prisma, state } = fakePrisma({ id: "rel_1", status: "moderating", confirmed: true, roles: onModeration() });
  const result = await setReleaseModerationClaimByAdmin({
    prisma,
    adminId: "admin_1",
    adminName: "Ника",
    releaseId: "rel_1",
    claim: true,
    now: CLAIMED
  });

  assert.deepEqual(result, {
    ok: true,
    claim: { adminId: "admin_1", adminName: "Ника", claimedAt: CLAIMED.toISOString() }
  });
  assert.equal(state.locked, 1);
  assert.equal(isReleaseClaimedByModerator("moderating", (state.release as any).roles), true);
  assert.equal(state.logs.length, 1);
  assert.equal(state.logs[0].action, "release.moderation_claim");
  assert.equal(state.logs[0].targetId, "rel_1");
});

test("«Вернуть в очередь» removes the mark and writes the admin log", async () => {
  const { prisma, state } = fakePrisma({ id: "rel_1", status: "moderating", confirmed: true, roles: claimed() });
  const result = await setReleaseModerationClaimByAdmin({ prisma, adminId: "admin_2", releaseId: "rel_1", claim: false });

  assert.deepEqual(result, { ok: true, claim: null });
  assert.equal(readReleaseModerationClaim((state.release as any).roles), null);
  assert.equal(state.logs[0].action, "release.moderation_unclaim");
  assert.equal(state.logs[0].payload.oldValue.adminId, "admin_1");
});

test("a release taken by another moderator is not taken over", async () => {
  const { prisma, state } = fakePrisma({ id: "rel_1", status: "moderating", confirmed: true, roles: claimed() });
  const result = await setReleaseModerationClaimByAdmin({ prisma, adminId: "admin_2", releaseId: "rel_1", claim: true });

  assert.deepEqual(result, { ok: false, status: 409, error: "Релиз уже взял в работу Ника." });
  assert.equal(state.updates.length, 0);
});

test("only a release on moderation that is not waiting for payment can be taken", async () => {
  const draft = fakePrisma({
    id: "rel_1",
    status: "moderating",
    confirmed: false,
    roles: withReleaseLifecycleState({}, "draft")
  });
  const notOnModeration = await setReleaseModerationClaimByAdmin({
    prisma: draft.prisma,
    adminId: "admin_1",
    releaseId: "rel_1",
    claim: true
  });
  assert.equal(notOnModeration.ok, false);

  const unpaid = fakePrisma({ id: "rel_2", status: "moderating", confirmed: false, roles: onModeration() });
  const awaitingPayment = await setReleaseModerationClaimByAdmin({
    prisma: unpaid.prisma,
    adminId: "admin_1",
    releaseId: "rel_2",
    claim: true
  });
  assert.equal(awaitingPayment.ok, false);
  assert.equal(unpaid.state.updates.length, 0);

  // A copy of a paid release waits for the moderator even though `confirmed` is false.
  const copy = fakePrisma({
    id: "rel_3",
    status: "moderating",
    confirmed: false,
    roles: onModeration({ resubmission: { resubmittedAt: SUBMITTED.toISOString(), sourceReleaseId: "rel_0" } })
  });
  const copyResult = await setReleaseModerationClaimByAdmin({
    prisma: copy.prisma,
    adminId: "admin_1",
    releaseId: "rel_3",
    claim: true
  });
  assert.equal(copyResult.ok, true);

  const missing = fakePrisma(null);
  const notFound = await setReleaseModerationClaimByAdmin({
    prisma: missing.prisma,
    adminId: "admin_1",
    releaseId: "nope",
    claim: true
  });
  assert.deepEqual(notFound, { ok: false, status: 404, error: "Релиз не найден." });
});

test("a decision of the moderator removes the mark", async (t) => {
  // The artist's notifications are not set up in this fake database.
  t.mock.method(console, "error", () => {});
  assert.equal(readReleaseModerationClaim(withAdminReleaseChangesRequiredState(claimed(), "Исправьте обложку")), null);

  let savedRoles: unknown = null;
  const prisma = {
    release: {
      findUnique: async () => ({ id: "rel_1", title: "Трек", status: "moderating", roles: claimed(), userId: "user_1", user: null }),
      update: async ({ data }: any) => {
        savedRoles = data.roles;
        return {};
      }
    },
    ai_user_notifications: { upsert: async () => ({}), findUnique: async () => null, create: async () => ({}) }
  } as any;
  const result = await rejectReleaseByAdmin({
    prisma,
    adminId: "admin_1",
    releaseId: "rel_1",
    reason: "Исправьте обложку",
    action: "request_changes"
  });
  assert.equal(result.ok, true);
  assert.equal(readReleaseModerationClaim(savedRoles), null);
});
