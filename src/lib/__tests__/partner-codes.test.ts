import assert from "node:assert/strict";
import test from "node:test";

import {
  checkPartnerCodeForRelease,
  consumePartnerCodeForRelease
} from "@/lib/partner-codes";

function createPartnerCodeClient(seed?: {
  codes?: Array<{
    id: string;
    code: string;
    active?: boolean;
    coversReleasePayment?: boolean;
    maxUses?: number | null;
    usedCount?: number;
    expiresAt?: Date | null;
    allowedUserId?: string | null;
    allowedEmailDomain?: string | null;
  }>;
}) {
  const codes = new Map(
    (seed?.codes ?? []).map((item) => [
      item.code,
      {
        id: item.id,
        code: item.code,
        active: item.active ?? true,
        coversReleasePayment: item.coversReleasePayment ?? true,
        maxUses: item.maxUses ?? null,
        usedCount: item.usedCount ?? 0,
        expiresAt: item.expiresAt ?? null,
        allowedUserId: item.allowedUserId ?? null,
        allowedEmailDomain: item.allowedEmailDomain ?? null
      }
    ])
  );
  const usages: Array<{ id: string; partnerCodeId: string; releaseId: string; userId: string }> = [];
  let sequence = 1;

  return {
    client: {
      partner_codes: {
        findUnique: async ({ where: { code } }: { where: { code: string } }) => codes.get(code) ?? null,
        update: async ({
          where: { id },
          data
        }: {
          where: { id: string };
          data: { usedCount?: { increment: number } };
        }) => {
          const item = [...codes.values()].find((entry) => entry.id === id);
          if (!item) return null;
          if (data.usedCount?.increment) item.usedCount += data.usedCount.increment;
          return item;
        }
      },
      partner_code_usages: {
        findFirst: async ({
          where
        }: {
          where: { partnerCodeId: string; releaseId: string };
        }) =>
          usages.find(
            (usage) =>
              usage.partnerCodeId === where.partnerCodeId && usage.releaseId === where.releaseId
          ) ?? null,
        create: async ({
          data
        }: {
          data: { partnerCodeId: string; userId: string; releaseId: string; codeSnapshot: string };
        }) => {
          usages.push({
            id: `usage_${sequence++}`,
            partnerCodeId: data.partnerCodeId,
            releaseId: data.releaseId,
            userId: data.userId
          });
          return usages[usages.length - 1];
        }
      }
    },
    getState() {
      return {
        codes: [...codes.values()],
        usages: [...usages]
      };
    }
  };
}

test("valid partner code confirms eligibility and can be consumed", async () => {
  const { client, getState } = createPartnerCodeClient({
    codes: [{ id: "pc_1", code: "PARTNER-1" }]
  });

  const check = await checkPartnerCodeForRelease({
    prisma: client as never,
    code: "partner-1",
    userId: "user_1",
    userEmail: "artist@example.com",
    releaseId: "rel_1"
  });
  assert.equal(check.ok, true);

  const consumed = await consumePartnerCodeForRelease({
    prisma: client as never,
    code: "partner-1",
    userId: "user_1",
    userEmail: "artist@example.com",
    releaseId: "rel_1"
  });

  assert.equal(consumed.ok, true);
  assert.equal(getState().codes[0]?.usedCount, 1);
  assert.equal(getState().usages.length, 1);
});

test("partner code can be preview-validated without release id", async () => {
  const { client, getState } = createPartnerCodeClient({
    codes: [{ id: "pc_1", code: "PREVIEW-1" }]
  });

  const result = await checkPartnerCodeForRelease({
    prisma: client as never,
    code: "preview-1",
    userId: "user_1",
    userEmail: "artist@example.com"
  });

  assert.equal(result.ok, true);
  assert.equal(getState().usages.length, 0);
});

test("invalid partner code does not activate", async () => {
  const { client } = createPartnerCodeClient();

  const result = await checkPartnerCodeForRelease({
    prisma: client as never,
    code: "missing",
    userId: "user_1",
    userEmail: "artist@example.com",
    releaseId: "rel_1"
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_found");
});

test("expired partner code is rejected", async () => {
  const { client } = createPartnerCodeClient({
    codes: [
      {
        id: "pc_1",
        code: "EXPIRED",
        expiresAt: new Date(Date.now() - 60_000)
      }
    ]
  });

  const result = await checkPartnerCodeForRelease({
    prisma: client as never,
    code: "expired",
    userId: "user_1",
    userEmail: "artist@example.com",
    releaseId: "rel_1"
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "expired");
});

test("exhausted partner code is rejected", async () => {
  const { client } = createPartnerCodeClient({
    codes: [
      {
        id: "pc_1",
        code: "LIMITED",
        maxUses: 1,
        usedCount: 1
      }
    ]
  });

  const result = await checkPartnerCodeForRelease({
    prisma: client as never,
    code: "limited",
    userId: "user_1",
    userEmail: "artist@example.com",
    releaseId: "rel_1"
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "limit_reached");
});

test("second release with single-use code is rejected after first consume", async () => {
  const { client } = createPartnerCodeClient({
    codes: [
      {
        id: "pc_1",
        code: "ONCE",
        maxUses: 1
      }
    ]
  });

  const first = await consumePartnerCodeForRelease({
    prisma: client as never,
    code: "once",
    userId: "user_1",
    userEmail: "artist@example.com",
    releaseId: "rel_1"
  });
  assert.equal(first.ok, true);

  const second = await checkPartnerCodeForRelease({
    prisma: client as never,
    code: "once",
    userId: "user_1",
    userEmail: "artist@example.com",
    releaseId: "rel_2"
  });

  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "limit_reached");
});
