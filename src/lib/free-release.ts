import { createHmac } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { getUserContractStatus } from "@/lib/contract-verification";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { getReleaseLifecycleStatus } from "@/lib/release-counts";
import type { FreeReleaseStatus, FreeReleaseSteps } from "@/lib/free-release-shared";

export { isFreeReleaseSubmissionAllowed } from "@/lib/free-release-shared";
export type { FreeReleaseState, FreeReleaseStatus, FreeReleaseSteps } from "@/lib/free-release-shared";

// The free first single: a new artist with an approved contract, a linked VK account and a
// subscription to the VK group may release one single with one track for free. One claim per
// cabinet, per VK account and per passport; artists who already released anything are excluded.

type FreeReleaseDb = Prisma.TransactionClient | PrismaClient;

export type FreeReleaseClaimResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

const FREE_RELEASE_TABLES = ["free_release_claims", "icecream.free_release_claims", "vk_links", "icecream.vk_links"];
const SUBMITTED_LIFECYCLES = new Set(["pending_verification", "moderation", "changes_required", "approved", "dsp_confirmed", "archived"]);
const APPROVED_LIFECYCLES = new Set(["approved", "dsp_confirmed"]);
const NO_STEPS: FreeReleaseSteps = { contract: false, contractPending: false, vkLinked: false, groupMember: false };

function readIdentitySecret(): string {
  return process.env.FREE_RELEASE_IDENTITY_SECRET?.trim() ?? "";
}

// The passport itself is never stored in the claim: only a keyed hash of series + number.
export function buildFreeReleaseIdentityKey(params: {
  passSeries: string;
  passNum: string;
  secret: string;
}): string | null {
  const digits = `${params.passSeries}${params.passNum}`.replace(/\D/gu, "");
  // Contract signing stores "0000"/"000000" when the passport is missing.
  if (digits.length < 6 || /^0+$/u.test(digits)) return null;
  return createHmac("sha256", params.secret).update(digits).digest("hex");
}

type ContractState = "approved" | "pending" | "none";

async function readContractState(db: FreeReleaseDb, userId: string): Promise<ContractState> {
  const contract = await getUserContractStatus({ prisma: db as PrismaClient, userId });
  if (contract.status !== "unavailable" && contract.canSubmitReleases) return "approved";
  return contract.status === "pending" ? "pending" : "none";
}

function isStorageMissing(error: unknown): boolean {
  return isAnyPrismaTableMissingError(error, FREE_RELEASE_TABLES);
}

function unavailable(reason: string): FreeReleaseStatus {
  return { state: "unavailable", reason, steps: NO_STEPS, releaseId: null };
}

async function readLatestPassport(db: FreeReleaseDb, userId: string) {
  const rows = await db.verification.findMany({
    where: { userId },
    select: { passSeries: true, passNum: true }
  });
  // Rows have no timestamp; the contract status already picked the approved one, and all
  // rows of one person carry the same passport, so any non-empty row will do.
  return rows.find((row) => /[1-9]/u.test(`${row.passSeries}${row.passNum}`)) ?? null;
}

async function isPassportUsedByAnotherUser(
  db: FreeReleaseDb,
  userId: string,
  passport: { passSeries: string; passNum: string }
): Promise<boolean> {
  const other = await db.verification.findFirst({
    where: { userId: { not: userId }, passSeries: passport.passSeries, passNum: passport.passNum },
    select: { id: true }
  });
  return Boolean(other);
}

async function hasEarlierRelease(db: FreeReleaseDb, userId: string, ignoreReleaseIds: string[]): Promise<boolean> {
  const releases = await db.release.findMany({
    where: { userId, id: { notIn: ignoreReleaseIds } },
    select: { confirmed: true, status: true, roles: true }
  });
  return releases.some((release) => {
    if (release.confirmed) return true;
    const lifecycle = getReleaseLifecycleStatus(release.status, release.roles);
    return lifecycle !== null && SUBMITTED_LIFECYCLES.has(lifecycle);
  });
}

export async function getFreeReleaseStatus(
  db: FreeReleaseDb,
  userId: string,
  options: {
    forReleaseId?: string;
    readContractState?: (db: FreeReleaseDb, userId: string) => Promise<ContractState>;
  } = {}
): Promise<FreeReleaseStatus & { identityKey: string | null; vkUserId: string | null }> {
  const secret = readIdentitySecret();
  if (!secret) return { ...unavailable("Акция временно недоступна."), identityKey: null, vkUserId: null };

  let claim;
  let vkLink;
  try {
    [claim, vkLink] = await Promise.all([
      db.free_release_claims.findUnique({
        where: { user_id: userId },
        select: {
          release_id: true,
          consumed_at: true,
          release: { select: { status: true, roles: true } }
        }
      }),
      db.vk_links.findUnique({
        where: { user_id: userId },
        select: { vk_user_id: true, is_group_member: true }
      })
    ]);
  } catch (error) {
    if (isStorageMissing(error)) {
      return { ...unavailable("Акция временно недоступна."), identityKey: null, vkUserId: null };
    }
    throw error;
  }

  const contract = await (options.readContractState ?? readContractState)(db, userId);
  const steps: FreeReleaseSteps = {
    contract: contract === "approved",
    contractPending: contract === "pending",
    vkLinked: Boolean(vkLink),
    groupMember: Boolean(vkLink?.is_group_member)
  };
  const vkUserId = vkLink?.vk_user_id ?? null;
  const base = { steps, identityKey: null, vkUserId };

  if (claim?.consumed_at) {
    return { ...base, state: "used", reason: "Бесплатный релиз уже использован.", releaseId: claim.release_id };
  }
  if (claim?.release_id) {
    const lifecycle = getReleaseLifecycleStatus(claim.release?.status, claim.release?.roles);
    if (lifecycle && APPROVED_LIFECYCLES.has(lifecycle)) {
      await markFreeReleaseConsumed(db, claim.release_id);
      return { ...base, state: "used", reason: "Бесплатный релиз уже использован.", releaseId: claim.release_id };
    }
    if (claim.release_id !== options.forReleaseId) {
      return {
        ...base,
        state: "reserved",
        reason: "Бесплатный релиз уже закреплён за другим релизом.",
        releaseId: claim.release_id
      };
    }
  }

  const ignore = [options.forReleaseId, claim?.release_id].filter((id): id is string => Boolean(id));
  if (await hasEarlierRelease(db, userId, ignore)) {
    return { ...base, state: "not_eligible", reason: "Бесплатный релиз доступен только для первого релиза.", releaseId: null };
  }

  let identityKey: string | null = null;
  if (steps.contract) {
    const passport = await readLatestPassport(db, userId);
    identityKey = passport ? buildFreeReleaseIdentityKey({ ...passport, secret }) : null;
    if (!passport || !identityKey) {
      return { ...base, state: "locked", reason: "В договоре не указаны паспортные данные.", releaseId: null };
    }
    if (await isPassportUsedByAnotherUser(db, userId, passport)) {
      return { ...base, state: "not_eligible", reason: "По этим паспортным данным уже есть другой кабинет.", releaseId: null };
    }
  }

  const [identityTaken, vkTaken] = await Promise.all([
    identityKey
      ? db.free_release_claims.findFirst({ where: { identity_key: identityKey, user_id: { not: userId } }, select: { id: true } })
      : null,
    vkUserId
      ? db.free_release_claims.findFirst({ where: { vk_user_id: vkUserId, user_id: { not: userId } }, select: { id: true } })
      : null
  ]);
  if (identityTaken || vkTaken) {
    return { ...base, state: "not_eligible", reason: "Бесплатный релиз уже получен в другом кабинете.", releaseId: null };
  }

  if (!steps.contract || !steps.vkLinked || !steps.groupMember) {
    return { ...base, identityKey, state: "locked", reason: null, releaseId: null };
  }
  return { ...base, identityKey, state: "available", reason: null, releaseId: claim?.release_id ?? null };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

// Must run inside the submission transaction, so the claim and the release update commit together.
export async function claimFreeRelease(
  db: Prisma.TransactionClient,
  params: { userId: string; releaseId: string },
  options: { readContractState?: (db: FreeReleaseDb, userId: string) => Promise<ContractState> } = {}
): Promise<FreeReleaseClaimResult> {
  const status = await getFreeReleaseStatus(db, params.userId, { ...options, forReleaseId: params.releaseId });
  if (status.state !== "available" || !status.identityKey || !status.vkUserId) {
    return {
      ok: false,
      code: `free_release_${status.state}`,
      message: status.reason ?? "Выполните все шаги, чтобы получить бесплатный релиз."
    };
  }

  try {
    await db.free_release_claims.upsert({
      where: { user_id: params.userId },
      create: {
        user_id: params.userId,
        release_id: params.releaseId,
        identity_key: status.identityKey,
        vk_user_id: status.vkUserId,
        status: "reserved"
      },
      update: {
        release_id: params.releaseId,
        identity_key: status.identityKey,
        vk_user_id: status.vkUserId,
        status: "reserved"
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: "free_release_conflict", message: "Бесплатный релиз уже получен в другом кабинете." };
    }
    throw error;
  }
  return { ok: true };
}

// The free release is a bonus, never a gate: any failure (VK, storage, a bug) comes back as
// { ok: false } with the transaction still usable, so the release goes the usual paid way.
export async function tryClaimFreeRelease(
  db: Prisma.TransactionClient,
  params: { userId: string; releaseId: string },
  options: { readContractState?: (db: FreeReleaseDb, userId: string) => Promise<ContractState> } = {}
): Promise<FreeReleaseClaimResult> {
  await db.$executeRawUnsafe("SAVEPOINT free_release_claim");
  try {
    const result = await claimFreeRelease(db, params, options);
    await db.$executeRawUnsafe(result.ok ? "RELEASE SAVEPOINT free_release_claim" : "ROLLBACK TO SAVEPOINT free_release_claim");
    return result;
  } catch (error) {
    console.error("[free-release] claim failed, falling back to the paid flow", { releaseId: params.releaseId, error });
    await db.$executeRawUnsafe("ROLLBACK TO SAVEPOINT free_release_claim");
    return { ok: false, code: "free_release_error", message: "Не удалось применить бесплатный релиз." };
  }
}

export async function isFreeReleaseClaimedBy(db: FreeReleaseDb, releaseId: string): Promise<boolean> {
  try {
    const claim = await db.free_release_claims.findUnique({ where: { release_id: releaseId }, select: { id: true } });
    return Boolean(claim);
  } catch (error) {
    if (isStorageMissing(error)) return false;
    throw error;
  }
}

// Called on approval. Afterwards deleting the release no longer frees the claim.
export async function markFreeReleaseConsumed(db: FreeReleaseDb, releaseId: string): Promise<void> {
  try {
    await db.free_release_claims.updateMany({
      where: { release_id: releaseId, consumed_at: null },
      data: { consumed_at: new Date(), status: "consumed" }
    });
  } catch (error) {
    if (isStorageMissing(error)) return;
    throw error;
  }
}
