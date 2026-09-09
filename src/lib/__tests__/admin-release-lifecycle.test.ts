import assert from "node:assert/strict";
import test from "node:test";

import {
  canRejectRelease,
  rejectReleaseByAdmin,
  withAdminReleaseChangesRequiredState
} from "@/lib/admin-release-service";
import { getReleaseLifecycleStatus } from "@/lib/release-counts";

test("admin reject uses effective lifecycle instead of legacy status", () => {
  assert.equal(
    canRejectRelease("rejected", { lifecycleState: "moderation" }),
    true
  );
  assert.equal(
    canRejectRelease("moderating", { lifecycleState: "changes_required" }),
    false
  );
});

test("admin reject moves release lifecycle to changes required", () => {
  const roles = withAdminReleaseChangesRequiredState(
    {
      lifecycleState: "moderation",
      submittedToModeration: true,
      submissionData: {
        lifecycleState: "moderation",
        submittedToModeration: true
      }
    },
    "Нужно оплатить релиз",
    {
      action: "request_changes",
      returnedAt: "2026-08-10T14:00:00.000Z",
      remarks: [
        {
          field: "cover",
          section: "Релиз",
          message: "Нужно обновить обложку."
        }
      ]
    }
  );

  assert.equal(getReleaseLifecycleStatus("rejected", roles), "changes_required");
  assert.equal(roles.submittedToModeration, false);
  assert.equal(roles.needsChanges, true);
  assert.equal(roles.rejectReason, "Нужно оплатить релиз");
  assert.equal(roles.moderationStatus, "changes_required");
  assert.equal(roles.moderationReturnedAt, "2026-08-10T14:00:00.000Z");
  assert.deepEqual(roles.moderationRemarks, [
    {
      field: "cover",
      section: "Релиз",
      message: "Нужно обновить обложку."
    }
  ]);
  assert.deepEqual(roles.submissionData, {
    lifecycleState: "changes_required",
    submittedToModeration: false,
    needsChanges: true,
    moderationStatus: "changes_required",
    rejectReason: "Нужно оплатить релиз",
    rejectionReason: "Нужно оплатить релиз",
    moderationComment: "Нужно оплатить релиз",
    moderatorComment: "Нужно оплатить релиз",
    moderationRemarks: [
      {
        field: "cover",
        section: "Релиз",
        message: "Нужно обновить обложку."
      }
    ],
    moderationReturnedAt: "2026-08-10T14:00:00.000Z"
  });
});

test("reject service repairs a legacy rejected release still marked as moderation", async () => {
  const state: { savedData: Record<string, unknown> | null } = { savedData: null };
  const prisma = {
    release: {
      findUnique: async () => ({
        id: "release-1",
        title: "Тестовый релиз",
        status: "rejected",
        roles: { lifecycleState: "moderation" },
        user: { email: null, name: null }
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        state.savedData = data;
        return {};
      }
    }
  };

  const result = await rejectReleaseByAdmin({
    prisma: prisma as never,
    adminId: "admin-1",
    releaseId: "release-1",
    reason: "Требуется оплата",
    action: "request_changes",
    remarks: [
      {
        field: "tracks.0.audioFile",
        section: "Трек 1",
        message: "Перезагрузите аудио."
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.remarks, [
    {
      field: "tracks.0.audioFile",
      section: "Трек 1",
      message: "Перезагрузите аудио."
    }
  ]);
  assert.ok(state.savedData);
  assert.equal(state.savedData.status, "rejected");
  assert.equal(state.savedData.rejectReason, "Требуется оплата");
  assert.deepEqual(
    (state.savedData.roles as Record<string, unknown>).moderationRemarks,
    [
      {
        field: "tracks.0.audioFile",
        section: "Трек 1",
        message: "Перезагрузите аудио."
      }
    ]
  );
  assert.deepEqual(
    result.remarks,
    [
      {
        field: "tracks.0.audioFile",
        section: "Трек 1",
        message: "Перезагрузите аудио."
      }
    ]
  );
  assert.equal(
    getReleaseLifecycleStatus("rejected", state.savedData.roles),
    "changes_required"
  );
});
