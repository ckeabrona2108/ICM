/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import {
  approveReleaseByAdmin,
  canApproveReleaseStatus,
  canManageReleases,
  canRejectReleaseStatus,
  deleteReleaseByAdmin,
  isReleaseInAdminTab,
  rejectReleaseByAdmin
} from "@/lib/admin-release-service";
import { ReleaseStatus } from "@prisma/client";

test("non-admin cannot manage releases", () => {
  assert.equal(canManageReleases("USER"), false);
  assert.equal(canManageReleases("MODERATOR"), false);
  assert.equal(canManageReleases("ADMIN"), true);
});

test("moderation tab only shows moderation releases", () => {
  assert.equal(isReleaseInAdminTab(ReleaseStatus.MODERATION, "moderation"), true);
  assert.equal(isReleaseInAdminTab(ReleaseStatus.APPROVED, "moderation"), false);
  assert.equal(isReleaseInAdminTab(ReleaseStatus.REJECTED, "moderation"), false);
});

test("approve/reject transitions are only allowed from moderation statuses", () => {
  assert.equal(canApproveReleaseStatus(ReleaseStatus.MODERATION), true);
  assert.equal(canApproveReleaseStatus(ReleaseStatus.CHANGES_REQUIRED), false);
  assert.equal(canApproveReleaseStatus(ReleaseStatus.DRAFT), false);
  assert.equal(canApproveReleaseStatus(ReleaseStatus.APPROVED), false);

  assert.equal(canRejectReleaseStatus(ReleaseStatus.MODERATION), true);
  assert.equal(canRejectReleaseStatus(ReleaseStatus.CHANGES_REQUIRED), false);
  assert.equal(canRejectReleaseStatus(ReleaseStatus.REJECTED), false);
});

test("approve requires valid UPC", async () => {
  const result = await approveReleaseByAdmin({
    prisma: {
      release: {
        findUnique: async () => ({ id: "rel_1", status: "MODERATION", priority: false })
      }
    } as any,
    adminId: "admin_1",
    releaseId: "rel_1",
    upc: "abc"
  });

  assert.ok(result && "error" in result);
  assert.match(String((result as { error?: string }).error), /upc/i);
});

test("reject requires reason", async () => {
  const result = await rejectReleaseByAdmin({
    prisma: {} as any,
    adminId: "admin_1",
    releaseId: "rel_1",
    reason: "  "
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Причина отклонения обязательна/i);
});

test("reject saves reason and status", async () => {
  let savedReason: string | null = null;
  let savedStatus: string | null = null;

  const prisma = {
    release: {
      findUnique: async () => ({ id: "rel_1", status: "MODERATION" }),
      update: async ({ data }: { data: { rejectionReason: string; status: string } }) => {
        savedReason = data.rejectionReason;
        savedStatus = data.status;
        return {};
      }
    },
    adminLog: {
      create: async () => ({ id: "log_1" })
    },
    $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
  } as any;

  const result = await rejectReleaseByAdmin({
    prisma,
    adminId: "admin_1",
    releaseId: "rel_1",
    reason: "Неверная обложка"
  });

  assert.equal(result.ok, true);
  assert.equal(savedReason, "Неверная обложка");
  assert.equal(savedStatus, "CHANGES_REQUIRED");
});

test("approve changes release status to approved and persists UPC", async () => {
  let savedStatus: string | null = null;
  let savedUpc: string | null = null;

  const prisma = {
    release: {
      findUnique: async () => ({ id: "rel_1", status: "MODERATION", priority: false }),
      findFirst: async () => null,
      update: async ({ data }: { data: { status: string; upc: string } }) => {
        savedStatus = data.status;
        savedUpc = data.upc;
        return {};
      }
    },
    adminLog: {
      create: async () => ({ id: "log_1" })
    },
    $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
  } as any;

  const result = await approveReleaseByAdmin({
    prisma,
    adminId: "admin_1",
    releaseId: "rel_1",
    upc: "5063635661195"
  });

  assert.equal(result?.releaseId, "rel_1");
  assert.equal(savedStatus, "APPROVED");
  assert.equal(savedUpc, "5063635661195");
});

test("reject is blocked for non-moderation statuses", async () => {
  const prisma = {
    release: {
      findUnique: async () => ({ id: "rel_1", status: "APPROVED" })
    }
  } as any;

  const result = await rejectReleaseByAdmin({
    prisma,
    adminId: "admin_1",
    releaseId: "rel_1",
    reason: "Нужна доработка"
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /только для релизов на модерации/i);
});

test("approve is blocked for non-moderation statuses", async () => {
  let updateCalled = false;
  const prisma = {
    release: {
      findUnique: async () => ({ id: "rel_1", status: "DRAFT" }),
      update: async () => {
        updateCalled = true;
        return {};
      }
    },
    adminLog: {
      create: async () => ({})
    },
    $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
  } as any;

  const result = await approveReleaseByAdmin({
    prisma,
    adminId: "admin_1",
    releaseId: "rel_1",
    upc: "5063635661195"
  });

  assert.equal(updateCalled, false);
  assert.ok(result && "error" in result);
});

test("admin can delete release", async () => {
  let deleteCalled = false;

  const prisma = {
    release: {
      findUnique: async () => ({ id: "rel_1" }),
      delete: async () => {
        deleteCalled = true;
        return {};
      }
    },
    adminLog: {
      deleteMany: async () => ({}),
      create: async () => ({})
    },
    marketingCampaign: {
      deleteMany: async () => ({})
    },
    $transaction: async (items: Promise<unknown>[]) => Promise.all(items)
  } as any;

  const result = await deleteReleaseByAdmin({
    prisma,
    adminId: "admin_1",
    releaseId: "rel_1"
  });

  assert.equal(deleteCalled, true);
  assert.equal(result?.releaseId, "rel_1");
});
