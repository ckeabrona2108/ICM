import assert from "node:assert/strict";
import test from "node:test";

import {
  findPaidPredecessorRelease,
  getReleaseResubmission,
  readReleaseCopySourceId,
  readReleaseUpc,
  withReleaseCopySource,
  withReleaseResubmission
} from "@/lib/release-resubmission";

test("withReleaseResubmission stores a readable marker", () => {
  const roles = withReleaseResubmission(
    { lifecycleState: "moderation" },
    { previousStatus: "changes_required", sourceReleaseId: "rel_old", resubmittedAt: new Date("2026-10-01T00:00:00Z") }
  );
  assert.equal(roles.lifecycleState, "moderation");
  assert.deepEqual(getReleaseResubmission(roles), {
    resubmittedAt: "2026-10-01T00:00:00.000Z",
    previousStatus: "changes_required",
    sourceReleaseId: "rel_old"
  });
  assert.equal(getReleaseResubmission({}), null);
});

test("readReleaseUpc falls back to submission data", () => {
  assert.equal(readReleaseUpc({ upc: " 5064133307028 ", roles: {} }), "5064133307028");
  assert.equal(readReleaseUpc({ upc: null, roles: { submissionData: { upc: "5064133307028" } } }), "5064133307028");
  assert.equal(readReleaseUpc({ upc: "", roles: { submissionData: { upc: "" } } }), null);
});

test("findPaidPredecessorRelease matches a paid release of the same artist by UPC", async () => {
  const db = {
    release: {
      findMany: async () => [
        { id: "rel_other", title: "Другой", status: "approved", upc: "1111111111111", roles: {} },
        {
          id: "rel_rejected",
          title: "Игристое",
          status: "rejected",
          upc: null,
          roles: { lifecycleState: "changes_required", submissionData: { upc: "5064133307028" } }
        },
        {
          id: "rel_paid",
          title: "Игристое",
          status: "approved",
          upc: null,
          roles: { lifecycleState: "approved", submissionData: { upc: "5064133307028" } }
        }
      ]
    }
  } as unknown as Parameters<typeof findPaidPredecessorRelease>[0];

  assert.deepEqual(
    await findPaidPredecessorRelease(db, { userId: "u1", releaseId: "rel_copy", upc: "5064133307028" }),
    { id: "rel_paid", title: "Игристое" }
  );
  assert.equal(await findPaidPredecessorRelease(db, { userId: "u1", releaseId: "rel_copy", upc: "" }), null);
});

test("approving a copy of an approved release merges it into the original and hides the copy", async () => {
  const { approveReleaseByAdmin } = await import("@/lib/admin-release-service");
  const releaseUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const trackUpdates: string[] = [];
  const createdTracks: unknown[] = [];
  const copyTrack = {
    id: "t_copy",
    releaseId: "rel_copy",
    title: "Игристое (fix)",
    subtitle: null,
    isrc: "RU1",
    partner_code: null,
    roles: null,
    preview_start: "0",
    instant_gratification_date: null,
    focus: false,
    explicit: false,
    live: false,
    cover: false,
    remix: false,
    instrumental: false,
    language: "Русский",
    text: "lyrics",
    track: "audio.wav",
    text_sync: "karaoke.ttml",
    ringtone: null,
    video: null,
    author_rights: "",
    video_shot: null,
    index: 0
  };
  const copyRoles = { lifecycleState: "moderation", copyOfReleaseId: "rel_paid", submissionData: { upc: "5064133307028", title: "Игристое" } };
  const tx = {
    release: {
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        releaseUpdates.push(args);
        return {};
      }
    },
    track: {
      update: async (args: { where: { id: string } }) => {
        trackUpdates.push(args.where.id);
        return {};
      },
      create: async (args: unknown) => {
        createdTracks.push(args);
        return {};
      },
      deleteMany: async () => ({ count: 0 })
    }
  };
  const prisma = {
    release: {
      findUnique: async (args: { where: { id: string }; include?: unknown }) => {
        if (args.where.id === "rel_copy" && !args.include) {
          return { id: "rel_copy", title: "Игристое", status: "moderating", confirmed: true, roles: copyRoles, upc: null, userId: "u1", user: { email: null, name: null } };
        }
        if (args.where.id === "rel_copy") {
          return { id: "rel_copy", userId: "u1", title: "Игристое", roles: copyRoles, track: [copyTrack] };
        }
        return { id: "rel_paid", userId: "u1", roles: { paymentUsage: { type: "standalone_payment" }, lifecycleState: "approved" }, track: [{ id: "t_orig" }] };
      },
      findFirst: async () => null,
      findMany: async () => [
        { id: "rel_paid", title: "Игристое", status: "approved", upc: "5064133307028", roles: { lifecycleState: "approved" } }
      ]
    },
    $transaction: async (fn: (client: typeof tx) => Promise<void>) => fn(tx),
    userNotification: undefined
  } as unknown as Parameters<typeof approveReleaseByAdmin>[0]["prisma"];

  const result = await approveReleaseByAdmin({ prisma, adminId: "admin", releaseId: "rel_copy", upc: "5064133307028" });

  assert.ok(result && !("error" in result));
  assert.equal(result.releaseId, "rel_paid");
  const original = releaseUpdates.find((update) => update.where.id === "rel_paid");
  assert.equal(original?.data.status, "approved");
  assert.equal(original?.data.upc, "5064133307028");
  assert.equal((original?.data.roles as Record<string, unknown>).paymentUsage !== undefined, true);
  assert.deepEqual(trackUpdates, ["t_orig"]);
  assert.equal(createdTracks.length, 0);
  const copy = releaseUpdates.find((update) => update.where.id === "rel_copy");
  const copyDeletion = (copy?.data.roles as Record<string, Record<string, unknown>>).deletionRequest;
  assert.equal(copyDeletion.status, "deleted");
});

test("a copy made from an approved release keeps a readable link to it", () => {
  const roles = withReleaseCopySource({ lifecycleState: "draft" }, "rel_paid");
  assert.equal(readReleaseCopySourceId(roles), "rel_paid");
  assert.equal(roles.lifecycleState, "draft");
  assert.equal(readReleaseCopySourceId({}), null);
  assert.equal(readReleaseCopySourceId({ copyOfReleaseId: "  " }), null);
});

test("findPaidPredecessorRelease finds the original of a copy without a UPC", async () => {
  const db = {
    release: {
      findMany: async () => [
        { id: "rel_same_upc", title: "Другой", status: "approved", upc: "1111111111111", roles: {} },
        { id: "rel_paid", title: "Ночью", status: "approved", upc: "5064133307028", roles: { lifecycleState: "approved" } },
        {
          id: "rel_unapproved",
          title: "Ночью",
          status: "rejected",
          upc: null,
          roles: { lifecycleState: "changes_required" }
        }
      ]
    }
  } as unknown as Parameters<typeof findPaidPredecessorRelease>[0];

  assert.deepEqual(
    await findPaidPredecessorRelease(db, { userId: "u1", releaseId: "rel_copy", upc: "", sourceReleaseId: "rel_paid" }),
    { id: "rel_paid", title: "Ночью" }
  );
  // The copy link wins over a UPC match.
  assert.deepEqual(
    await findPaidPredecessorRelease(db, {
      userId: "u1",
      releaseId: "rel_copy",
      upc: "1111111111111",
      sourceReleaseId: "rel_paid"
    }),
    { id: "rel_paid", title: "Ночью" }
  );
  // A link to a release that is not approved is ignored.
  assert.equal(
    await findPaidPredecessorRelease(db, { userId: "u1", releaseId: "rel_copy", upc: null, sourceReleaseId: "rel_unapproved" }),
    null
  );
});

test("findPaidPredecessorRelease accepts several UPCs (stored one and the one the admin typed)", async () => {
  const db = {
    release: {
      findMany: async () => [
        { id: "rel_paid", title: "Ночью", status: "approved", upc: "5064133307028", roles: { lifecycleState: "approved" } }
      ]
    }
  } as unknown as Parameters<typeof findPaidPredecessorRelease>[0];

  assert.deepEqual(
    await findPaidPredecessorRelease(db, { userId: "u1", releaseId: "rel_copy", upc: [null, "5064133307028"] }),
    { id: "rel_paid", title: "Ночью" }
  );
  assert.equal(await findPaidPredecessorRelease(db, { userId: "u1", releaseId: "rel_copy", upc: [null, ""] }), null);
});

test("approving a linked copy without a UPC merges it into its original", async () => {
  const { approveReleaseByAdmin } = await import("@/lib/admin-release-service");
  const releaseUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const copyRoles = { lifecycleState: "moderation", copyOfReleaseId: "rel_paid", submissionData: { upc: "", title: "Ночью" } };
  const tx = {
    release: {
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        releaseUpdates.push(args);
        return {};
      }
    },
    track: { update: async () => ({}), create: async () => ({}), deleteMany: async () => ({ count: 0 }) }
  };
  const prisma = {
    release: {
      findUnique: async (args: { where: { id: string }; include?: unknown }) => {
        if (args.where.id === "rel_copy" && !args.include) {
          return { id: "rel_copy", title: "Ночью", status: "moderating", confirmed: true, roles: copyRoles, upc: null, userId: "u1", user: { email: null, name: null } };
        }
        if (args.where.id === "rel_copy") {
          return { id: "rel_copy", userId: "u1", title: "Ночью", roles: copyRoles, track: [] };
        }
        return { id: "rel_paid", userId: "u1", roles: { lifecycleState: "approved" }, track: [] };
      },
      findFirst: async () => null,
      findMany: async () => [
        { id: "rel_paid", title: "Ночью", status: "approved", upc: "5064133307028", roles: { lifecycleState: "approved" } }
      ]
    },
    $transaction: async (fn: (client: typeof tx) => Promise<void>) => fn(tx),
    userNotification: undefined
  } as unknown as Parameters<typeof approveReleaseByAdmin>[0]["prisma"];

  const result = await approveReleaseByAdmin({ prisma, adminId: "admin", releaseId: "rel_copy", upc: "5064133307028" });

  assert.ok(result && !("error" in result));
  assert.equal(result.releaseId, "rel_paid");
  assert.ok(releaseUpdates.some((update) => update.where.id === "rel_paid" && update.data.status === "approved"));
});

test("approving a new release that only reuses an old UPC does not overwrite the old release", async () => {
  const { approveReleaseByAdmin } = await import("@/lib/admin-release-service");
  const releaseUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const roles = { lifecycleState: "moderation", submissionData: { upc: "5064133307028", title: "Новый альбом" } };
  const prisma = {
    release: {
      findUnique: async () => ({ id: "rel_new", title: "Новый альбом", status: "moderating", confirmed: true, roles, upc: null, userId: "u1", user: { email: null, name: null } }),
      findFirst: async () => null,
      findMany: async () => [
        { id: "rel_paid", title: "Старый сингл", status: "approved", upc: "5064133307028", roles: { lifecycleState: "approved" } }
      ],
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        releaseUpdates.push(args);
        return {};
      }
    },
    free_release_claims: undefined,
    userNotification: undefined
  } as unknown as Parameters<typeof approveReleaseByAdmin>[0]["prisma"];

  const result = await approveReleaseByAdmin({ prisma, adminId: "admin", releaseId: "rel_new", upc: "5064133307028" }).catch(() => null);

  assert.ok(!releaseUpdates.some((update) => update.where.id === "rel_paid"));
  if (result && !("error" in result)) assert.equal(result.releaseId, "rel_new");
});

test("approval is refused for an unpaid release and for one the artist pulled back from moderation", async () => {
  const { approveReleaseByAdmin } = await import("@/lib/admin-release-service");
  const make = (release: Record<string, unknown>) => ({
    release: {
      findUnique: async () => ({ id: "rel", title: "X", upc: null, userId: "u1", user: { email: null, name: null }, ...release }),
      findFirst: async () => null,
      findMany: async () => [],
      update: async () => { throw new Error("must not update"); }
    }
  }) as unknown as Parameters<typeof approveReleaseByAdmin>[0]["prisma"];

  const unpaid = await approveReleaseByAdmin({
    prisma: make({ status: "moderating", confirmed: false, roles: { lifecycleState: "moderation" } }),
    adminId: "admin", releaseId: "rel", upc: "5064133307028"
  });
  assert.ok(unpaid && "error" in unpaid && /не оплачен/u.test(String(unpaid.error)));

  const cancelled = await approveReleaseByAdmin({
    prisma: make({ status: "moderating", confirmed: false, roles: { lifecycleState: "changes_required" } }),
    adminId: "admin", releaseId: "rel", upc: "5064133307028"
  });
  assert.deepEqual(cancelled, { releaseId: "rel", error: "STATUS_TRANSITION_NOT_ALLOWED" });
});

test("copy tracks keep the original track ids by ISRC and title, not by position", async () => {
  const { pairCopyTracksWithSource } = await import("@/lib/admin-release-service");
  const source = [
    { id: "t1", isrc: "RU-A01-24-00001", title: "Первая" },
    { id: "t2", isrc: "RUA012400002", title: "Вторая" },
    { id: "t3", isrc: null, title: "Третья" }
  ];
  // Reordered, the second track removed, a new one added, the third renamed only in case.
  assert.deepEqual(
    pairCopyTracksWithSource(
      [
        { isrc: null, title: "третья" },
        { isrc: "RUA012400001", title: "Первая (remaster)" },
        { isrc: "RUA012400099", title: "Новая" }
      ],
      source
    ),
    ["t3", "t1", null]
  );
  // Same order, ISRCs not filled in the copy: position is still used.
  assert.deepEqual(
    pairCopyTracksWithSource([{ title: "A" }, { title: "B" }], [{ id: "x1", title: "Old A" }, { id: "x2", title: "Old B" }]),
    ["x1", "x2"]
  );
  // A different ISRC at the same position is another recording.
  assert.deepEqual(
    pairCopyTracksWithSource([{ isrc: "RUB000000001", title: "Другая" }], [{ id: "y1", isrc: "RUA000000001", title: "Старая" }]),
    [null]
  );
});
