import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ReleaseStatus } from "@prisma/client";

import {
  approveContractSignatureByAdmin,
  createContractSignature,
  getAdminVerificationCounts,
  getContractDocumentDownloadAsset,
  getContractSignatureDownloadAsset,
  getUserContractStatus,
  rejectContractSignatureByAdmin
} from "@/lib/contract-verification";

const SIGNATURE_DATA_URL = `data:image/png;base64,${Buffer.alloc(512, 1).toString("base64")}`;
const LEGACY_MISSING_SIGNATURE_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg==";

function validSignerData() {
  return {
    fullName: "Иван Иванов",
    birthDate: "1990-01-01",
    passportNumber: "1234 567890",
    passportIssuedBy: "ОВД Москвы",
    passportCode: "123-456",
    passportIssueDate: "2010-01-01",
    address: "Москва",
    ogrnip: "",
    inn: "1234567890",
    snils: "123-456-789 00",
    confirmationAccepted: true
  } as const;
}

type VerificationRow = {
  id: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  contractVersion: string;
  contractFileName: string;
  contractFileUrl: string;
  signatureImageUrl: string;
  signedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
  status: "NOT_SIGNED" | "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  approvedAt: Date | null;
  approvedByAdminId: string | null;
  rejectedAt: Date | null;
  rejectedByAdminId: string | null;
  createdAt: Date;
  updatedAt: Date;
  fullName: string;
  birthDate: string | null;
  passportNumber: string | null;
  passportIssuedBy: string | null;
  passportCode: string | null;
  passportIssueDate: string | null;
  address: string | null;
  ogrnip: string | null;
  inn: string | null;
  snils: string | null;
};

type ReleaseRow = {
  id: string;
  userId: string;
  status: ReleaseStatus;
  moderationStartedAt: Date | null;
  moderationCancelledAt: Date | null;
  moderationReturnedAt: Date | null;
  moderationComment: string | null;
  rejectionReason: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
};

function createFakePrisma(seed?: {
  verifications?: VerificationRow[];
  releases?: ReleaseRow[];
}) {
  const state = {
    verifications: [...(seed?.verifications ?? [])],
    releases: [...(seed?.releases ?? [])],
    adminLogs: [] as Array<Record<string, unknown>>
  };

  type FakePrisma = {
    userContractSignature: {
      findFirst(args: { where: { userId: string } }): Promise<VerificationRow | null>;
      create(args: { data: Omit<VerificationRow, "id" | "createdAt" | "updatedAt"> }): Promise<VerificationRow>;
      findMany(): Promise<VerificationRow[]>;
      findUnique(args: { where: { id: string } }): Promise<VerificationRow | null>;
      update(args: { where: { id: string }; data: Partial<VerificationRow> }): Promise<VerificationRow | null>;
      count(args: { where: { status: VerificationRow["status"] } }): Promise<number>;
    };
    release: {
      findMany(args: {
        where: { userId: string; status: ReleaseStatus };
        select: { id: true };
      }): Promise<Array<{ id: string }>>;
      updateMany(args: {
        where: { id: { in: string[] } };
        data: Partial<ReleaseRow>;
      }): Promise<{ count: number }>;
      count(args: { where: { status: ReleaseStatus } }): Promise<number>;
    };
    adminLog: {
      create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
    };
    $transaction<T>(
      input: ((tx: FakePrisma) => Promise<T>) | Array<Promise<unknown>>
    ): Promise<T | unknown[]>;
  };

  const prisma: FakePrisma = {
    userContractSignature: {
      findFirst: async ({ where }: { where: { userId: string } }) => {
        return (
          state.verifications
            .filter((item) => item.userId === where.userId)
            .sort((a, b) => b.signedAt.getTime() - a.signedAt.getTime())[0] ?? null
        );
      },
      create: async ({ data }: { data: Omit<VerificationRow, "id" | "createdAt" | "updatedAt"> }) => {
        const row: VerificationRow = {
          ...data,
          id: `ver_${state.verifications.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.verifications.unshift(row);
        return row;
      },
      findMany: async () => state.verifications.slice(),
      findUnique: async ({ where }: { where: { id: string } }) => {
        return state.verifications.find((item) => item.id === where.id) ?? null;
      },
      update: async ({
        where,
        data
      }: {
        where: { id: string };
        data: Partial<VerificationRow>;
      }) => {
        const row = state.verifications.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      count: async ({ where }: { where: { status: VerificationRow["status"] } }) =>
        state.verifications.filter((item) => item.status === where.status).length
    },
    release: {
      findMany: async ({
        where
      }: {
        where: { userId: string; status: ReleaseStatus };
        select: { id: true };
      }) => {
        return state.releases
          .filter((item) => item.userId === where.userId && item.status === where.status)
          .map((item) => ({ id: item.id }));
      },
      updateMany: async ({
        where,
        data
      }: {
        where: { id: { in: string[] } };
        data: Partial<ReleaseRow>;
      }) => {
        let count = 0;
        for (const row of state.releases) {
          if (where.id.in.includes(row.id)) {
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
      count: async ({ where }: { where: { status: ReleaseStatus } }) =>
        state.releases.filter((item) => item.status === where.status).length
    },
    adminLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.adminLogs.push(data);
        return data;
      }
    },
    $transaction: async <T>(
      input: ((tx: typeof prisma) => Promise<T>) | Array<Promise<unknown>>
    ): Promise<T | unknown[]> => {
      if (typeof input === "function") {
        return input(prisma);
      }
      return Promise.all(input);
    }
  };

  return { prisma, state };
}

test("new user signs contract and verification becomes pending", async () => {
  const { prisma } = createFakePrisma();

  const result = await createContractSignature({
    prisma: prisma as never,
    userId: "user_1",
    userEmail: "artist@example.com",
    userName: "Artist",
    contractVersion: "2026-01",
    signatureImage: SIGNATURE_DATA_URL,
    signerData: validSignerData(),
    ipAddress: "127.0.0.1",
    userAgent: "test"
  });

  assert.equal(result.status, "pending");
  assert.equal(result.signed, true);
  assert.equal(result.canSubmitReleases, false);

  const status = await getUserContractStatus({
    prisma: prisma as never,
    userId: "user_1"
  });
  assert.equal(status.status, "pending");
});

test("admin counts include pending verification and pending verification releases", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const { prisma } = createFakePrisma({
    verifications: [
      {
        id: "ver_1",
        userId: "user_1",
        userEmail: "artist@example.com",
        userName: "Artist",
        contractVersion: "2026-01",
        contractFileName: "contract-2026-01.pdf",
        contractFileUrl: "/docs/contract-2026-01.pdf",
        signatureImageUrl: SIGNATURE_DATA_URL,
        signedAt: now,
        ipAddress: null,
        userAgent: null,
        status: "PENDING",
        rejectionReason: null,
        approvedAt: null,
        approvedByAdminId: null,
        rejectedAt: null,
        rejectedByAdminId: null,
        createdAt: now,
        updatedAt: now,
        fullName: "Иван Иванов",
        birthDate: "1990-01-01",
        passportNumber: "1234 567890",
        passportIssuedBy: "ОВД Москвы",
        passportCode: "123-456",
        passportIssueDate: "2010-01-01",
        address: "Москва",
        ogrnip: null,
        inn: "1234567890",
        snils: "123-456-789 00"
      }
    ],
    releases: [
      {
        id: "rel_pending",
        userId: "user_1",
        status: ReleaseStatus.PENDING_VERIFICATION,
        moderationStartedAt: null,
        moderationCancelledAt: null,
        moderationReturnedAt: null,
        moderationComment: null,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null
      },
      {
        id: "rel_mod",
        userId: "user_2",
        status: ReleaseStatus.MODERATION,
        moderationStartedAt: now,
        moderationCancelledAt: null,
        moderationReturnedAt: null,
        moderationComment: null,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null
      }
    ]
  });

  const counts = await getAdminVerificationCounts({
    prisma: prisma as never
  });

  assert.deepEqual(counts, {
    verification_pending: 1,
    releases_moderation: 1,
    releases_pending_verification: 1
  });
});

test("missing migrated signature becomes invalid_signature and blocks release creation", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const { prisma } = createFakePrisma({
    verifications: [
      {
        id: "ver_invalid",
        userId: "user_invalid",
        userEmail: "artist@example.com",
        userName: "Artist",
        contractVersion: "2026-01",
        contractFileName: "contract-2026-01.pdf",
        contractFileUrl: "/docs/contract-2026-01.pdf",
        signatureImageUrl: LEGACY_MISSING_SIGNATURE_DATA_URL,
        signedAt: now,
        ipAddress: null,
        userAgent: null,
        status: "PENDING",
        rejectionReason: null,
        approvedAt: null,
        approvedByAdminId: null,
        rejectedAt: null,
        rejectedByAdminId: null,
        createdAt: now,
        updatedAt: now,
        fullName: "Иван Иванов",
        birthDate: "1990-01-01",
        passportNumber: "1234 567890",
        passportIssuedBy: "ОВД Москвы",
        passportCode: "123-456",
        passportIssueDate: "2010-01-01",
        address: "Москва",
        ogrnip: null,
        inn: "1234567890",
        snils: "123-456-789 00"
      }
    ]
  });

  const status = await getUserContractStatus({
    prisma: prisma as never,
    userId: "user_invalid"
  });

  assert.equal(status.status, "invalid_signature");
  assert.equal(status.isVerified, false);
  assert.equal(status.canCreateRelease, false);
  assert.match(status.reason, /Подпишите договор заново/u);
});

test("approved verification allows release creation", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const { prisma } = createFakePrisma({
    verifications: [
      {
        id: "ver_approved",
        userId: "user_approved",
        userEmail: "artist@example.com",
        userName: "Artist",
        contractVersion: "2026-01",
        contractFileName: "contract-2026-01.pdf",
        contractFileUrl: "/docs/contract-2026-01.pdf",
        signatureImageUrl: SIGNATURE_DATA_URL,
        signedAt: now,
        ipAddress: null,
        userAgent: null,
        status: "APPROVED",
        rejectionReason: null,
        approvedAt: now,
        approvedByAdminId: "admin_1",
        rejectedAt: null,
        rejectedByAdminId: null,
        createdAt: now,
        updatedAt: now,
        fullName: "Иван Иванов",
        birthDate: "1990-01-01",
        passportNumber: "1234 567890",
        passportIssuedBy: "ОВД Москвы",
        passportCode: "123-456",
        passportIssueDate: "2010-01-01",
        address: "Москва",
        ogrnip: null,
        inn: "1234567890",
        snils: "123-456-789 00"
      }
    ]
  });

  const status = await getUserContractStatus({
    prisma: prisma as never,
    userId: "user_approved"
  });

  assert.equal(status.status, "approved");
  assert.equal(status.isVerified, true);
  assert.equal(status.canCreateRelease, true);
  assert.equal(status.canSubmitReleases, true);
});

test("admin approval approves verification and moves releases to moderation", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const { prisma, state } = createFakePrisma({
    verifications: [
      {
        id: "ver_1",
        userId: "user_1",
        userEmail: "artist@example.com",
        userName: "Artist",
        contractVersion: "2026-01",
        contractFileName: "contract-2026-01.pdf",
        contractFileUrl: "/docs/contract-2026-01.pdf",
        signatureImageUrl: SIGNATURE_DATA_URL,
        signedAt: now,
        ipAddress: null,
        userAgent: null,
        status: "PENDING",
        rejectionReason: null,
        approvedAt: null,
        approvedByAdminId: null,
        rejectedAt: null,
        rejectedByAdminId: null,
        createdAt: now,
        updatedAt: now,
        fullName: "Иван Иванов",
        birthDate: "1990-01-01",
        passportNumber: "1234 567890",
        passportIssuedBy: "ОВД Москвы",
        passportCode: "123-456",
        passportIssueDate: "2010-01-01",
        address: "Москва",
        ogrnip: null,
        inn: "1234567890",
        snils: "123-456-789 00"
      }
    ],
    releases: [
      {
        id: "rel_1",
        userId: "user_1",
        status: ReleaseStatus.PENDING_VERIFICATION,
        moderationStartedAt: null,
        moderationCancelledAt: null,
        moderationReturnedAt: null,
        moderationComment: null,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null
      }
    ]
  });

  const result = await approveContractSignatureByAdmin({
    prisma: prisma as never,
    verificationId: "ver_1",
    adminId: "admin_1"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.movedReleaseIds, ["rel_1"]);
  assert.equal(state.verifications[0]?.status, "APPROVED");
  assert.equal(state.verifications[0]?.approvedByAdminId, "admin_1");
  assert.equal(state.releases[0]?.status, ReleaseStatus.MODERATION);
  assert.ok(state.releases[0]?.moderationStartedAt instanceof Date);
});

test("admin rejection saves reason and moves releases to changes required", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const { prisma, state } = createFakePrisma({
    verifications: [
      {
        id: "ver_1",
        userId: "user_1",
        userEmail: "artist@example.com",
        userName: "Artist",
        contractVersion: "2026-01",
        contractFileName: "contract-2026-01.pdf",
        contractFileUrl: "/docs/contract-2026-01.pdf",
        signatureImageUrl: SIGNATURE_DATA_URL,
        signedAt: now,
        ipAddress: null,
        userAgent: null,
        status: "PENDING",
        rejectionReason: null,
        approvedAt: null,
        approvedByAdminId: null,
        rejectedAt: null,
        rejectedByAdminId: null,
        createdAt: now,
        updatedAt: now,
        fullName: "Иван Иванов",
        birthDate: "1990-01-01",
        passportNumber: "1234 567890",
        passportIssuedBy: "ОВД Москвы",
        passportCode: "123-456",
        passportIssueDate: "2010-01-01",
        address: "Москва",
        ogrnip: null,
        inn: "1234567890",
        snils: "123-456-789 00"
      }
    ],
    releases: [
      {
        id: "rel_1",
        userId: "user_1",
        status: ReleaseStatus.PENDING_VERIFICATION,
        moderationStartedAt: null,
        moderationCancelledAt: null,
        moderationReturnedAt: null,
        moderationComment: null,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null
      }
    ]
  });

  const result = await rejectContractSignatureByAdmin({
    prisma: prisma as never,
    verificationId: "ver_1",
    adminId: "admin_1",
    reason: "Подпись не совпадает с паспортом"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.movedReleaseIds, ["rel_1"]);
  assert.equal(state.verifications[0]?.status, "REJECTED");
  assert.equal(state.verifications[0]?.rejectionReason, "Подпись не совпадает с паспортом");
  assert.equal(state.releases[0]?.status, ReleaseStatus.CHANGES_REQUIRED);
  assert.match(state.releases[0]?.moderationComment ?? "", /Верификация отклонена/u);
});

test("signature download asset returns PNG blob for base64 signatures", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const { prisma } = createFakePrisma({
    verifications: [
      {
        id: "ver_1",
        userId: "user_1",
        userEmail: "artist@example.com",
        userName: "Artist",
        contractVersion: "2026-01",
        contractFileName: "contract-2026-01.pdf",
        contractFileUrl: "/docs/contract-2026-01.pdf",
        signatureImageUrl: SIGNATURE_DATA_URL,
        signedAt: now,
        ipAddress: null,
        userAgent: null,
        status: "PENDING",
        rejectionReason: null,
        approvedAt: null,
        approvedByAdminId: null,
        rejectedAt: null,
        rejectedByAdminId: null,
        createdAt: now,
        updatedAt: now,
        fullName: "Иван Иванов",
        birthDate: "1990-01-01",
        passportNumber: "1234 567890",
        passportIssuedBy: "ОВД Москвы",
        passportCode: "123-456",
        passportIssueDate: "2010-01-01",
        address: "Москва",
        ogrnip: null,
        inn: "1234567890",
        snils: "123-456-789 00"
      }
    ]
  });

  const asset = await getContractSignatureDownloadAsset({
    prisma: prisma as never,
    id: "ver_1"
  });

  assert.equal(asset?.contentType, "image/png");
  assert.equal(asset?.fileName, "signature-user_1-2026-05-06.png");
  assert.ok(asset?.body);
  assert.equal(asset?.body?.byteLength, Buffer.from(SIGNATURE_DATA_URL.split(",")[1] ?? "", "base64").byteLength);
});

test("contract download asset returns contract PDF body", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const { prisma } = createFakePrisma({
    verifications: [
      {
        id: "ver_1",
        userId: "user_1",
        userEmail: "artist@example.com",
        userName: "Artist",
        contractVersion: "2026-01",
        contractFileName: "contract-2026-01.pdf",
        contractFileUrl: "/docs/contract-2026-01.pdf",
        signatureImageUrl: SIGNATURE_DATA_URL,
        signedAt: now,
        ipAddress: null,
        userAgent: null,
        status: "APPROVED",
        rejectionReason: null,
        approvedAt: now,
        approvedByAdminId: "admin_1",
        rejectedAt: null,
        rejectedByAdminId: null,
        createdAt: now,
        updatedAt: now,
        fullName: "Иван Иванов",
        birthDate: "1990-01-01",
        passportNumber: "1234 567890",
        passportIssuedBy: "ОВД Москвы",
        passportCode: "123-456",
        passportIssueDate: "2010-01-01",
        address: "Москва",
        ogrnip: null,
        inn: "1234567890",
        snils: "123-456-789 00"
      }
    ]
  });

  const asset = await getContractDocumentDownloadAsset({
    prisma: prisma as never,
    id: "ver_1"
  });
  const expected = await readFile(path.join(process.cwd(), "public", "docs", "contract-2026-01.pdf"));

  assert.equal(asset?.contentType, "application/pdf");
  assert.equal(asset?.fileName, "contract-2026-01.pdf");
  assert.ok(asset?.body);
  assert.equal(asset?.body?.byteLength, expected.byteLength);
});
