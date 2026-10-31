import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFreeReleaseIdentityKey,
  claimFreeRelease,
  getFreeReleaseStatus,
  isFreeReleaseSubmissionAllowed,
  markFreeReleaseConsumed,
  tryClaimFreeRelease
} from "@/lib/free-release";
import { getUserReleaseQuota, getReleasePaymentDisplayFromRoles, mergeReleaseRolesPaymentUsage, buildFreeFirstReleasePaymentUsage } from "@/lib/release-quota";

process.env.FREE_RELEASE_IDENTITY_SECRET = "test-secret";

type Claim = {
  id: string;
  user_id: string;
  release_id: string | null;
  identity_key: string;
  vk_user_id: string;
  status: string;
  consumed_at: Date | null;
};
type Release = { id: string; userId: string; confirmed: boolean; status: string; roles: unknown };
type Passport = { id: string; userId: string; passSeries: string; passNum: string };

function createDb(state: {
  claims?: Claim[];
  vkLinks?: Array<{ user_id: string; vk_user_id: string; is_group_member: boolean }>;
  releases?: Release[];
  passports?: Passport[];
}) {
  const claims = state.claims ?? [];
  const releases = state.releases ?? [];
  const passports = state.passports ?? [];
  const vkLinks = state.vkLinks ?? [];

  const db = {
    free_release_claims: {
      findUnique: async ({ where }: { where: { user_id?: string; release_id?: string } }) => {
        const claim = claims.find((item) =>
          where.user_id ? item.user_id === where.user_id : item.release_id === where.release_id
        );
        if (!claim) return null;
        const release = releases.find((item) => item.id === claim.release_id) ?? null;
        return { ...claim, release };
      },
      findFirst: async ({ where }: { where: { identity_key?: string; vk_user_id?: string; user_id: { not: string } } }) =>
        claims.find(
          (item) =>
            item.user_id !== where.user_id.not &&
            (where.identity_key ? item.identity_key === where.identity_key : item.vk_user_id === where.vk_user_id)
        ) ?? null,
      upsert: async ({ where, create, update }: { where: { user_id: string }; create: Omit<Claim, "id" | "consumed_at">; update: Partial<Claim> }) => {
        const conflict = claims.find(
          (item) =>
            item.user_id !== where.user_id &&
            (item.identity_key === create.identity_key || item.vk_user_id === create.vk_user_id)
        );
        if (conflict) throw { code: "P2002" };
        const existing = claims.find((item) => item.user_id === where.user_id);
        if (existing) Object.assign(existing, update);
        else claims.push({ id: `claim_${claims.length + 1}`, consumed_at: null, ...create });
      },
      updateMany: async ({ where, data }: { where: { release_id: string }; data: Partial<Claim> }) => {
        for (const claim of claims) {
          if (claim.release_id === where.release_id && !claim.consumed_at) Object.assign(claim, data);
        }
      }
    },
    vk_links: {
      findUnique: async ({ where }: { where: { user_id: string } }) =>
        vkLinks.find((item) => item.user_id === where.user_id) ?? null
    },
    release: {
      findMany: async ({ where }: { where: { userId: string; id: { notIn: string[] } } }) =>
        releases.filter((item) => item.userId === where.userId && !where.id.notIn.includes(item.id))
    },
    verification: {
      findMany: async ({ where }: { where: { userId: string } }) => passports.filter((item) => item.userId === where.userId),
      findFirst: async ({ where }: { where: { userId: { not: string }; passSeries: string; passNum: string } }) =>
        passports.find(
          (item) =>
            item.userId !== where.userId.not &&
            item.passSeries === where.passSeries &&
            item.passNum === where.passNum
        ) ?? null
    }
  };
  return { db: db as never, claims };
}

const contractApproved = { readContractState: async () => "approved" as const };
const contractPending = { readContractState: async () => "pending" as const };
const contractMissing = { readContractState: async () => "none" as const };

function newArtist(overrides: Partial<Parameters<typeof createDb>[0]> = {}) {
  return createDb({
    vkLinks: [{ user_id: "u1", vk_user_id: "100", is_group_member: true }],
    releases: [{ id: "draft", userId: "u1", confirmed: false, status: "moderating", roles: { lifecycleState: "draft" } }],
    passports: [{ id: "v1", userId: "u1", passSeries: "4510", passNum: "123456" }],
    ...overrides
  });
}

test("only a one-track standard single can be released for free", () => {
  assert.equal(isFreeReleaseSubmissionAllowed({ releaseType: "single", releaseKind: "standard", trackCount: 1 }).ok, true);
  assert.equal(isFreeReleaseSubmissionAllowed({ releaseType: "single", releaseKind: null, trackCount: 1 }).ok, true);
  assert.equal(isFreeReleaseSubmissionAllowed({ releaseType: "single", releaseKind: "standard", trackCount: 2 }).ok, false);
  assert.equal(isFreeReleaseSubmissionAllowed({ releaseType: "single", releaseKind: "single_maxi", trackCount: 1 }).ok, false);
  assert.equal(isFreeReleaseSubmissionAllowed({ releaseType: "ep", releaseKind: "standard", trackCount: 1 }).ok, false);
  assert.equal(isFreeReleaseSubmissionAllowed({ releaseType: "album", releaseKind: "standard", trackCount: 1 }).ok, false);
});

test("identity key hashes the passport and ignores placeholders", () => {
  const key = buildFreeReleaseIdentityKey({ passSeries: "45 10", passNum: "123456", secret: "s" });
  assert.equal(key, buildFreeReleaseIdentityKey({ passSeries: "4510", passNum: "123 456", secret: "s" }));
  assert.ok(key && !key.includes("4510"));
  assert.equal(buildFreeReleaseIdentityKey({ passSeries: "0000", passNum: "000000", secret: "s" }), null);
});

test("a new artist with every step done can use the free release", async () => {
  const { db } = newArtist();
  const status = await getFreeReleaseStatus(db, "u1", contractApproved);
  assert.equal(status.state, "available");
  assert.deepEqual(status.steps, { contract: true, contractPending: false, vkLinked: true, groupMember: true });
});

test("missing steps keep the offer locked", async () => {
  const { db } = newArtist({ vkLinks: [] });
  const status = await getFreeReleaseStatus(db, "u1", contractMissing);
  assert.equal(status.state, "locked");
  assert.deepEqual(status.steps, { contract: false, contractPending: false, vkLinked: false, groupMember: false });

  const pending = await getFreeReleaseStatus(createDb({}).db, "u1", contractPending);
  assert.equal(pending.state, "locked");
  assert.equal(pending.steps.contractPending, true);

  const notMember = newArtist({ vkLinks: [{ user_id: "u1", vk_user_id: "100", is_group_member: false }] });
  assert.equal((await getFreeReleaseStatus(notMember.db, "u1", contractApproved)).state, "locked");
});

test("artists who already submitted or paid a release are not eligible", async () => {
  const submitted = newArtist({
    releases: [{ id: "r1", userId: "u1", confirmed: false, status: "moderating", roles: { lifecycleState: "moderation" } }]
  });
  assert.equal((await getFreeReleaseStatus(submitted.db, "u1", contractApproved)).state, "not_eligible");

  const paid = newArtist({ releases: [{ id: "r1", userId: "u1", confirmed: true, status: "approved", roles: {} }] });
  assert.equal((await getFreeReleaseStatus(paid.db, "u1", contractApproved)).state, "not_eligible");
});

test("a passport already used by another cabinet blocks the offer", async () => {
  const { db } = newArtist({
    passports: [
      { id: "v1", userId: "u1", passSeries: "4510", passNum: "123456" },
      { id: "v2", userId: "u2", passSeries: "4510", passNum: "123456" }
    ]
  });
  assert.equal((await getFreeReleaseStatus(db, "u1", contractApproved)).state, "not_eligible");
});

test("a VK account or passport that already got a free release elsewhere is refused", async () => {
  const otherKey = buildFreeReleaseIdentityKey({ passSeries: "9999", passNum: "111111", secret: "test-secret" })!;
  const sameVk = newArtist({
    claims: [{ id: "c", user_id: "u2", release_id: "x", identity_key: otherKey, vk_user_id: "100", status: "consumed", consumed_at: new Date() }]
  });
  assert.equal((await getFreeReleaseStatus(sameVk.db, "u1", contractApproved)).state, "not_eligible");
});

test("claiming reserves the release, and approval consumes it for good", async () => {
  const { db, claims } = newArtist();
  assert.deepEqual(await claimFreeRelease(db, { userId: "u1", releaseId: "draft" }, contractApproved), { ok: true });
  assert.equal(claims[0]?.release_id, "draft");

  // Re-sending the same release is fine; a second release is refused while the first is pending.
  assert.deepEqual(await claimFreeRelease(db, { userId: "u1", releaseId: "draft" }, contractApproved), { ok: true });
  const second = await claimFreeRelease(db, { userId: "u1", releaseId: "other" }, contractApproved);
  assert.equal(second.ok, false);

  await markFreeReleaseConsumed(db, "draft");
  assert.ok(claims[0]?.consumed_at);
  claims[0]!.release_id = null; // the release was deleted after approval
  assert.equal((await getFreeReleaseStatus(db, "u1", contractApproved)).state, "used");
});

test("deleting a free release before approval frees the claim again", async () => {
  const key = buildFreeReleaseIdentityKey({ passSeries: "4510", passNum: "123456", secret: "test-secret" })!;
  const { db } = newArtist({
    claims: [{ id: "c", user_id: "u1", release_id: null, identity_key: key, vk_user_id: "100", status: "reserved", consumed_at: null }]
  });
  assert.equal((await getFreeReleaseStatus(db, "u1", contractApproved)).state, "available");
  assert.deepEqual(await claimFreeRelease(db, { userId: "u1", releaseId: "draft" }, contractApproved), { ok: true });
});

test("free releases do not use the subscription quota and show their own label", async () => {
  const roles = mergeReleaseRolesPaymentUsage(null, buildFreeFirstReleasePaymentUsage());
  assert.equal(getReleasePaymentDisplayFromRoles(roles).kind, "free_first_release");

  const quota = await getUserReleaseQuota("u1", {
    user: {
      findUnique: async () => ({ isSubscribed: true, subscribeLevel: "standard", expiresAt: new Date(Date.now() + 10 * 86_400_000) })
    },
    release: { findMany: async () => [{ id: "free", date: new Date(), roles }] },
    orders: { findMany: async () => [] }
  } as never);
  assert.equal(quota.used, 0);
});

test("a failing free claim falls back without breaking the submission transaction", async () => {
  const statements: string[] = [];
  const { db: base } = newArtist();
  const db = Object.assign(base as object, {
    $executeRawUnsafe: async (sql: string) => {
      statements.push(sql);
    }
  }) as never;

  const ok = await tryClaimFreeRelease(db, { userId: "u1", releaseId: "draft" }, contractApproved);
  assert.deepEqual(ok, { ok: true });
  assert.deepEqual(statements, ["SAVEPOINT free_release_claim", "RELEASE SAVEPOINT free_release_claim"]);

  statements.length = 0;
  const refused = await tryClaimFreeRelease(db, { userId: "u1", releaseId: "other" }, contractApproved);
  assert.equal(refused.ok, false);
  assert.equal(statements.at(-1), "ROLLBACK TO SAVEPOINT free_release_claim");

  statements.length = 0;
  const vkDown = await tryClaimFreeRelease(
    db,
    { userId: "u1", releaseId: "draft" },
    { readContractState: async () => { throw new Error("contract storage down"); } }
  );
  assert.deepEqual(vkDown, { ok: false, code: "free_release_error", message: "Не удалось применить бесплатный релиз." });
  assert.equal(statements.at(-1), "ROLLBACK TO SAVEPOINT free_release_claim");
});
