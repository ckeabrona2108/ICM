// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import { ReleaseStatus } from "@/lib/legacy-business-enums";
import { withReleaseLifecycleState } from "@/lib/release-counts";
import { CONTRACT_VERSION } from "@/lib/contract-verification-shared";

import {
  approveContractSignatureByAdmin,
  createContractSignature,
  getAdminVerificationCounts,
  getContractSignatureById,
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
  roles?: unknown;
  moderationStartedAt: Date | null;
  moderationCancelledAt: Date | null;
  moderationReturnedAt: Date | null;
  moderationComment: string | null;
  moderatorComment?: string | null;
  rejectionReason: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
};

function createFakePrisma(seed?: {
  verifications?: VerificationRow[];
  releases?: ReleaseRow[];
  failReleaseModerationTimestampUpdate?: boolean;
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
        where: { userId?: string; status?: ReleaseStatus };
        select: { id?: true; status?: true; confirmed?: true; roles?: true };
      }): Promise<Array<{ id?: string; status?: ReleaseStatus; confirmed?: boolean; roles?: unknown }>>;
      update(args: {
        where: { id: string };
        data: Partial<ReleaseRow>;
      }): Promise<ReleaseRow | null>;
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
      count: async ({ where }: { where: { status: VerificationRow["status"] } }) => {
        const expectedStatus = where.status === "moderating" ? "PENDING" : where.status;
        return state.verifications.filter((item) => item.status === expectedStatus).length;
      }
    },
    release: {
      findMany: async ({
        where,
        select
      }: {
        where: { userId?: string; status?: ReleaseStatus };
        select: { id?: true; status?: true; confirmed?: true; roles?: true };
      }) => {
        const rows = state.releases.filter((item) => {
            if (where.userId && item.userId !== where.userId) return false;
            if (where.status && item.status !== where.status) return false;
            return true;
          });
        if (select.status) {
          return rows.map((item) => ({
            status: item.status,
            confirmed: item.status === ReleaseStatus.MODERATION,
            roles: item.roles ?? null
          }));
        }
        return rows.map((item) => ({
          id: item.id,
          ...(select.roles ? { roles: item.roles ?? null } : {})
        }));
      },
      update: async ({
        where,
        data
      }: {
        where: { id: string };
        data: Partial<ReleaseRow>;
      }) => {
        if (seed?.failReleaseModerationTimestampUpdate && "moderationStartedAt" in data) {
          throw new Error("Unknown argument `moderationStartedAt`.");
        }
        const row = state.releases.find((item) => item.id === where.id);
        if (!row) return null;
        Object.assign(row, data);
        return row;
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
        const snapshot = structuredClone(state);
        try {
          return await input(prisma);
        } catch (error) {
          state.verifications.splice(0, state.verifications.length, ...snapshot.verifications);
          state.releases.splice(0, state.releases.length, ...snapshot.releases);
          state.adminLogs.splice(0, state.adminLogs.length, ...snapshot.adminLogs);
          throw error;
        }
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

test("updated terms require a new signature and retain the previous data for admin review", async () => {
  const { prisma, state } = createFakePrisma();
  await createContractSignature({
    prisma: prisma as never,
    userId: "user_1",
    userEmail: "artist@example.com",
    userName: "Artist",
    contractVersion: "legacy-client-version",
    signatureImage: SIGNATURE_DATA_URL,
    signerData: validSignerData()
  });

  const legacyMeta = JSON.parse(state.verifications[0]!.contract);
  legacyMeta.contractVersion = "2026-01";
  state.verifications[0]!.contract = JSON.stringify(legacyMeta);
  state.verifications[0]!.status = "APPROVED";

  const outdated = await getUserContractStatus({ prisma: prisma as never, userId: "user_1" });
  assert.equal(outdated.status, "update_required");
  assert.equal(outdated.canCreateRelease, false);
  assert.equal(outdated.signerData?.fullName, "Иван Иванов");

  const renewed = await createContractSignature({
    prisma: prisma as never,
    userId: "user_1",
    userEmail: "artist@example.com",
    userName: "Updated artist",
    contractVersion: "2026-01",
    signatureImage: SIGNATURE_DATA_URL,
    signerData: { ...validSignerData(), fullName: "Пётр Иванов" }
  });

  assert.equal(renewed.status, "pending");
  const nextMeta = JSON.parse(state.verifications[0]!.contract);
  assert.equal(nextMeta.contractVersion, CONTRACT_VERSION);
  assert.equal(nextMeta.contractNumber, 1534);
  assert.equal(nextMeta.contractHistory.length, 1);
  assert.equal(nextMeta.contractHistory[0].contractVersion, "2026-01");
  assert.equal(nextMeta.contractHistory[0].fullName, "Иван Иванов");
  assert.match(nextMeta.contractHistory[0].contractFileName, /^signed-contract-user_1-/u);
  assert.match(nextMeta.contractHistory[0].contractFileUrl, /^data:text\/html/u);
  assert.equal(nextMeta.contractHistory[0].contractContentType, "text/html; charset=utf-8");
  assert.equal(nextMeta.contractHistory[0].signatureImageUrl, SIGNATURE_DATA_URL);
  assert.match(nextMeta.contractHistory[0].signedDocumentHash, /^[a-f0-9]{64}$/u);
});

test("contract status reports unavailable verification storage without pretending it is unsigned", async () => {
  const status = await getUserContractStatus({
    prisma: {} as never,
    userId: "user_1"
  });

  assert.equal(status.status, "unavailable");
  assert.equal(status.signed, false);
  assert.equal(status.canCreateRelease, false);
  assert.match(status.reason, /временно недоступна/iu);
});

test("contract signing sends telegram notification only on first successful signature", async () => {
  const { prisma } = createFakePrisma();
  const notifications: Array<{ userId: string; userEmail: string }> = [];

  const first = await createContractSignature({
    prisma: prisma as never,
    userId: "user_1",
    userEmail: "artist@example.com",
    userName: "Artist",
    contractVersion: "2026-01",
    signatureImage: SIGNATURE_DATA_URL,
    signerData: validSignerData(),
    notify: async (payload) => {
      notifications.push({ userId: payload.userId, userEmail: payload.userEmail });
      return true;
    }
  });

  const second = await createContractSignature({
    prisma: prisma as never,
    userId: "user_1",
    userEmail: "artist@example.com",
    userName: "Artist",
    contractVersion: "2026-01",
    signatureImage: SIGNATURE_DATA_URL,
    signerData: validSignerData(),
    notify: async (payload) => {
      notifications.push({ userId: payload.userId, userEmail: payload.userEmail });
      return true;
    }
  });

  assert.equal(first.status, "pending");
  assert.equal(second.status, "pending");
  assert.equal(notifications.length, 1);
});

test("contract signing does not fail when telegram notification fails", async () => {
  const { prisma } = createFakePrisma();
  let loggerCalled = false;

  const result = await createContractSignature({
    prisma: prisma as never,
    userId: "user_1",
    userEmail: "artist@example.com",
    userName: "Artist",
    contractVersion: "2026-01",
    signatureImage: SIGNATURE_DATA_URL,
    signerData: validSignerData(),
    notify: async () => {
      throw new Error("telegram_down");
    },
    logger: {
      error: () => {
        loggerCalled = true;
      }
    }
  });

  assert.equal(result.status, "pending");
  assert.equal(loggerCalled, true);
});

test("contract signing creates downloadable signed document with signer data", async () => {
  const { prisma, state } = createFakePrisma();

  await createContractSignature({
    prisma: prisma as never,
    userId: "user_1",
    userEmail: "artist@example.com",
    userName: "Artist",
    contractVersion: "2026-01",
    signatureImage: SIGNATURE_DATA_URL,
    signerData: validSignerData()
  });

  const asset = await getContractDocumentDownloadAsset({
    prisma: prisma as never,
    id: "ver_1",
    inline: true
  });

  assert.equal(asset?.contentType, "text/html; charset=utf-8");
  assert.match(asset?.fileName ?? "", /^signed-contract-user_1-\d{4}-\d{2}-\d{2}(?:-[a-f0-9]{16})?\.html$/u);
  assert.ok(asset?.body);
  const contractMeta = JSON.parse(state.verifications[0]?.contract ?? "{}");
  assert.equal(contractMeta.contractNumber, 1534);
  assert.equal(contractMeta.pseudonym, "Artist");

  const html = asset!.body!.toString("utf8");
  assert.match(html, /ЛИЦЕНЗИОННЫЙ ДОГОВОР № 1534/u);
  assert.match(html, /г\. Калининград/u);
  assert.match(html, /Подписано: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2} \(Калининград\)/u);
  assert.doesNotMatch(html, /ЛИЦЕНЗИОННЫЙ ДОГОВОР № ______/u);
  assert.doesNotMatch(html, /202__ г\./u);
  assert.match(html, /\/Иван И\.\//u);
  assert.match(html, /Иван Иванов/u);
  assert.match(html, /data-contract-format="text-v2"/u);
  assert.match(html, /12\.7\. Адреса, банковские реквизиты и подписи сторон/iu);
  assert.match(html, /12\.6\./u);
  assert.doesNotMatch(html, /12\.7\. Реквизиты Сторон при бумажном подписании/iu);
  assert.doesNotMatch(html, /ICECREAMMUSIC\s*\|\s*ЛИЦЕНЗИОННЫЙ\s+ДОГОВОР\s+Страница\s+\d+/iu);
  assert.match(html, /alt="Подпись Лицензиата"/u);
  assert.doesNotMatch(html, /<p class="contract-paragraph">1\.<\/p>/u);
  assert.doesNotMatch(html, /обнародован ного/u);
  assert.doesNotMatch(html, />IP<\/dt>/u);
  assert.doesNotMatch(html, />User-Agent<\/dt>/u);
  assert.match(html, /data:image\/png;base64/u);
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
        status: ReleaseStatus.MODERATION,
        roles: withReleaseLifecycleState({}, "pending_verification"),
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
        status: ReleaseStatus.MODERATION,
        roles: withReleaseLifecycleState({}, "pending_verification"),
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
  assert.equal(state.verifications[0]?.status, "approved");
  const verification = await getContractSignatureById({
    prisma: prisma as never,
    id: "ver_1"
  });
  assert.equal(verification?.approvedByAdminId, "admin_1");
  assert.equal(state.releases[0]?.status, ReleaseStatus.MODERATION);
  assert.equal((state.releases[0]?.roles as { lifecycleState?: string } | undefined)?.lifecycleState, "moderation");
  assert.ok(state.releases[0]?.moderationStartedAt instanceof Date);

  const cancelled = await rejectContractSignatureByAdmin({
    prisma: prisma as never,
    verificationId: "ver_1",
    adminId: "admin_1",
    reason: "Договор требуется переоформить."
  });

  assert.equal(cancelled.ok, true);
  const cancelledVerification = await getContractSignatureById({
    prisma: prisma as never,
    id: "ver_1"
  });
  assert.equal(cancelledVerification?.status, "rejected");
  assert.equal(cancelledVerification?.rejectionReason, "Договор требуется переоформить.");
  assert.ok(cancelledVerification?.approvedAt);
  assert.ok(state.adminLogs.some((item) => item.action === "CONTRACT_VERIFICATION_CANCELLED"));
});

test("admin approval falls back when moderation timestamp columns are unavailable", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const { prisma, state } = createFakePrisma({
    failReleaseModerationTimestampUpdate: true,
    verifications: [
      {
        id: "ver_fallback",
        userId: "user_fallback",
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
        id: "rel_fallback",
        userId: "user_fallback",
        status: ReleaseStatus.MODERATION,
        roles: withReleaseLifecycleState({}, "pending_verification"),
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
    verificationId: "ver_fallback",
    adminId: "admin_1"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.movedReleaseIds, ["rel_fallback"]);
  assert.equal(state.releases[0]?.status, ReleaseStatus.MODERATION);
  assert.equal(state.releases[0]?.moderationStartedAt, null);
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
        status: ReleaseStatus.MODERATION,
        roles: withReleaseLifecycleState({}, "pending_verification"),
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
  assert.equal(state.verifications[0]?.status, "rejected");
  const verification = await getContractSignatureById({
    prisma: prisma as never,
    id: "ver_1"
  });
  assert.equal(verification?.rejectionReason, "Подпись не совпадает с паспортом");
  assert.equal(state.releases[0]?.status, ReleaseStatus.MODERATION);
  assert.equal((state.releases[0]?.roles as { lifecycleState?: string } | undefined)?.lifecycleState, "changes_required");
  assert.match(state.releases[0]?.moderatorComment ?? "", /Верификация отклонена/u);
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

test("legacy contract download asset generates signed document instead of static PDF", async () => {
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

  assert.equal(asset?.contentType, "text/html; charset=utf-8");
  assert.equal(asset?.fileName, "signed-contract-user_1-2026-05-06.html");
  assert.ok(asset?.body);
  const html = asset.body.toString("utf8");
  assert.match(html, /Подписанный договор ICECREAMMUSIC/u);
  assert.match(html, /Иван Иванов/u);
  assert.match(html, /data-contract-format="text-v2"/u);
  assert.match(html, /12\.7\. Адреса, банковские реквизиты и подписи сторон/iu);
  assert.match(html, /data:image\/png;base64/u);
});

test("legacy contract without a stored signature still renders as text HTML", async () => {
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
        signatureImageUrl: LEGACY_MISSING_SIGNATURE_DATA_URL,
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
    id: "ver_1",
    inline: true
  });

  assert.equal(asset?.contentType, "text/html; charset=utf-8");
  assert.ok(asset?.body);
  assert.match(asset!.body!.toString("utf8"), /Иван Иванов/u);
  assert.match(asset!.body!.toString("utf8"), /data-contract-format="text-v2"/u);
});

test("contract download embeds remote signature image into offline html", async () => {
  const now = new Date("2026-05-06T18:00:00.000Z");
  const remoteSignatureUrl = "https://cdn.example.com/contracts/signatures/user_1/signature.png";
  const signatureBody = Buffer.from("signature-png-body");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: RequestInfo | URL) => {
    assert.equal(String(url), remoteSignatureUrl);
    return new Response(signatureBody, {
      status: 200,
      headers: { "Content-Type": "image/png" }
    });
  }) as typeof fetch;

  try {
    const { prisma } = createFakePrisma({
      verifications: [
        {
          id: "ver_1",
          userId: "user_1",
          userEmail: "artist@example.com",
          userName: "Artist",
          contractVersion: "2026-01",
          contractFileName: "signed-contract-user_1-2026-05-06.html",
          contractFileUrl: "data:text/html;charset=utf-8;base64,PGh0bWw+L2FwaS92ZXJpZmljYXRpb24vY29udHJhY3Qvc2lnbmF0dXJlP2lubGluZT0xPC9odG1sPg==",
          signatureImageUrl: remoteSignatureUrl,
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
      id: "ver_1",
      signatureFallbackUrl: "/api/verification/contract/signature?inline=1"
    });

    assert.equal(asset?.contentType, "text/html; charset=utf-8");
    assert.ok(asset?.body);
    const html = asset.body.toString("utf8");
    assert.match(html, /data:image\/png;base64/u);
    assert.doesNotMatch(html, /\/api\/verification\/contract\/signature/u);
    assert.doesNotMatch(html, /cdn\.example\.com\/contracts\/signatures/u);
    assert.match(html, new RegExp(signatureBody.toString("base64"), "u"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
