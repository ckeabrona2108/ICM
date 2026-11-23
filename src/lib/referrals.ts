import { randomBytes } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";
import { addMonths } from "date-fns";

import { deliverUserNotificationSafely } from "@/lib/notification-delivery-service";
import {
  normalizeReferralCode,
  REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_LADDER,
  REFERRAL_MIN_PAYMENT_RUB,
  REFERRAL_REWARD_DELAY_DAYS,
  type ReferralFriendStatus,
  type ReferralOverview
} from "@/lib/referral-shared";
import { getUserReleaseQuota } from "@/lib/release-quota";
import { applySubscriptionUpgrade } from "@/lib/subscription-limits";

/*
 * Referral program on the server. Tables: referral_codes, referrals, referral_bonus_ledger,
 * referral_ladder_rewards (migration 20261124120000_referrals). Rules: src/lib/referral-shared.ts.
 *
 * There is no background job: due rewards are settled whenever the inviter's referral data is read
 * (invite page, release wizard), and the admin page settles everyone's.
 */

type Db = PrismaClient;

const SITE_URL = "https://www.icecreammusic.net";

function siteUrl(): string {
  return (process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || SITE_URL).replace(/\/+$/u, "");
}

export function buildReferralLink(code: string): string {
  return `${siteUrl()}/r/${code}`;
}

const CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function newCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

export async function getOrCreateReferralCode(db: Db, userId: string): Promise<string> {
  const existing = await db.$queryRaw<Array<{ code: string }>>`
    SELECT code FROM icecream.referral_codes WHERE user_id = ${userId}::uuid`;
  if (existing[0]) return existing[0].code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rows = await db.$queryRaw<Array<{ code: string }>>`
      INSERT INTO icecream.referral_codes (user_id, code) VALUES (${userId}::uuid, ${newCode()})
      ON CONFLICT DO NOTHING
      RETURNING code`;
    if (rows[0]) return rows[0].code;
    const again = await db.$queryRaw<Array<{ code: string }>>`
      SELECT code FROM icecream.referral_codes WHERE user_id = ${userId}::uuid`;
    if (again[0]) return again[0].code;
  }
  throw new Error("referral_code_failed");
}

/**
 * The name a friend sees: the artist name from the inviter's latest release, else the cabinet
 * name. Never the email or anything else — the invite link is public.
 */
export async function resolveReferralNickname(db: Db, userId: string): Promise<string> {
  const release = await db.release.findFirst({
    where: { userId, performer: { not: null } },
    orderBy: { date: "desc" },
    select: { performer: true }
  });
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const name = release?.performer?.trim() || user?.name?.trim() || "артист ICECREAMMUSIC";
  return name.length > 40 ? `${name.slice(0, 39)}…` : name;
}

export async function findReferrerByCode(db: Db, rawCode: unknown): Promise<{ userId: string; nickname: string } | null> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const rows = await db.$queryRaw<Array<{ user_id: string }>>`
    SELECT user_id FROM icecream.referral_codes WHERE code = ${code}`;
  const userId = rows[0]?.user_id;
  if (!userId) return null;
  return { userId, nickname: await resolveReferralNickname(db, userId) };
}

/** Ties a just-created account to the inviter. Called only right after sign-up. */
export async function bindReferral(db: Db, params: { referredId: string; code: unknown }): Promise<boolean> {
  const referrer = await findReferrerByCode(db, params.code);
  if (!referrer || referrer.userId === params.referredId) return false;
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO icecream.referrals (referrer_id, referred_id)
    VALUES (${referrer.userId}::uuid, ${params.referredId}::uuid)
    ON CONFLICT (referred_id) DO NOTHING
    RETURNING id`;
  if (!rows[0]) return false;
  const friend = await resolveReferralNickname(db, params.referredId);
  await deliverUserNotificationSafely(db, {
    id: `referral-joined-${rows[0].id}`,
    userId: referrer.userId,
    kind: "referral_joined",
    title: "Друг зарегистрировался по твоей ссылке",
    message: `${friend} с тобой! Когда друг оплатит релиз или подписку, ты получишь бесплатный релиз.`,
    href: "/dashboard/referrals",
    sendTelegram: true,
    sendVk: true
  });
  return true;
}

/** 20% off for a friend who has not paid yet; 0 for everyone else. */
export async function getReferralDiscountPercent(db: Db, userId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ ok: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM icecream.referrals
      WHERE referred_id = ${userId}::uuid AND paid_at IS NULL AND revoked_at IS NULL
    ) AS ok`;
  if (!rows[0]?.ok) return 0;
  const paid = await db.orders.count({
    where: { userId, confirmed: true, type: { in: ["release", "subscription"] } }
  });
  return paid > 0 ? 0 : REFERRAL_DISCOUNT_PERCENT;
}

function readAmountRub(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return 0;
  const value = (metadata as Record<string, unknown>).amountRub;
  const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;
  return Number.isFinite(amount) ? amount : 0;
}

/** A confirmed release or subscription payment: the friend becomes paying, the bonus is scheduled. */
export async function recordReferralPayment(
  db: Db,
  order: { id: string; userId: string; type: string; metadata: unknown }
): Promise<void> {
  if (order.type !== "release" && order.type !== "subscription") return;
  if (readAmountRub(order.metadata) < REFERRAL_MIN_PAYMENT_RUB) return;
  const rows = await db.$queryRaw<Array<{ id: string; referrer_id: string; reward_due_at: Date }>>`
    UPDATE icecream.referrals
    SET paid_order_id = ${order.id}::uuid,
        paid_at = now(),
        reward_due_at = now() + make_interval(days => ${REFERRAL_REWARD_DELAY_DAYS}::int)
    WHERE referred_id = ${order.userId}::uuid AND paid_at IS NULL AND revoked_at IS NULL
    RETURNING id, referrer_id, reward_due_at`;
  const row = rows[0];
  if (!row) return;
  const friend = await resolveReferralNickname(db, order.userId);
  const due = row.reward_due_at.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  await deliverUserNotificationSafely(db, {
    id: `referral-paid-${row.id}`,
    userId: row.referrer_id,
    kind: "referral_paid",
    title: `${friend}: ${order.type === "subscription" ? "подписка оплачена" : "релиз оплачен"}`,
    message: `Бесплатный релиз придёт через ${REFERRAL_REWARD_DELAY_DAYS} дней, ${due}.`,
    href: "/dashboard/referrals",
    sendTelegram: true,
    sendVk: true
  });
}

const PLAN_RANK = { STANDARD: 1, PRO: 2, ENTERPRISE: 3 } as const;

async function grantLadderMonth(db: Db, userId: string, plan: "PRO" | "ENTERPRISE"): Promise<void> {
  // A month of the reward plan on top of whatever is left; an artist already on a higher active
  // plan keeps it and gets a month more.
  const quota = await getUserReleaseQuota(userId, db);
  const keep = quota.isActive && PLAN_RANK[quota.plan] > PLAN_RANK[plan] ? quota.plan : plan;
  const current = await db.user.findUnique({ where: { id: userId }, select: { expiresAt: true } });
  const now = new Date();
  const base = quota.isActive && current?.expiresAt && current.expiresAt > now ? current.expiresAt : now;
  const endsAt = addMonths(base, 1);
  await db.$transaction(async (tx) => {
    // Keeps the subscription records (and this month's release counter) in line with a paid month.
    await applySubscriptionUpgrade({ tx, userId, plan: keep });
    await tx.user.update({
      where: { id: userId },
      data: {
        isSubscribed: true,
        subscribeLevel: keep === "ENTERPRISE" ? "enterprise" : keep === "PRO" ? "professional" : "standard",
        expiresAt: endsAt
      }
    });
  });
}

/** Gives the bonuses that are due (and the ladder months they unlock). Safe to call any time. */
export async function settleReferralRewards(db: Db, referrerId?: string): Promise<void> {
  const due = await db.$queryRaw<Array<{ id: string; referrer_id: string; referred_id: string; paid_order_id: string | null }>>`
    SELECT id, referrer_id, referred_id, paid_order_id FROM icecream.referrals
    WHERE reward_due_at <= now() AND rewarded_at IS NULL AND revoked_at IS NULL
      AND (${referrerId ?? null}::uuid IS NULL OR referrer_id = ${referrerId ?? null}::uuid)
    ORDER BY reward_due_at
    LIMIT 200`;
  const touched = new Set<string>();

  for (const row of due) {
    // The payment must still stand after the 14 days (not cancelled or refunded).
    const order = row.paid_order_id
      ? await db.orders.findUnique({ where: { id: row.paid_order_id }, select: { confirmed: true, payment_status: true } })
      : null;
    if (!order?.confirmed || ["canceled", "cancelled", "refunded", "failed"].includes(order.payment_status)) {
      // The payment was cancelled or refunded: this friend does not count.
      await db.$executeRaw`
        UPDATE icecream.referrals SET revoked_at = now(), revoke_reason = 'Оплата отменена или возвращена'
        WHERE id = ${row.id}::uuid AND rewarded_at IS NULL AND revoked_at IS NULL`;
      continue;
    }

    const claimed = await db.$queryRaw<Array<{ id: string }>>`
      UPDATE icecream.referrals SET rewarded_at = now()
      WHERE id = ${row.id}::uuid AND rewarded_at IS NULL AND revoked_at IS NULL
      RETURNING id`;
    if (!claimed[0]) continue;
    await db.$executeRaw`
      INSERT INTO icecream.referral_bonus_ledger (user_id, delta, reason, referral_id)
      VALUES (${row.referrer_id}::uuid, 1, 'referral', ${row.id}::uuid)
      ON CONFLICT DO NOTHING`;
    touched.add(row.referrer_id);
    const friend = await resolveReferralNickname(db, row.referred_id);
    const balance = await getReferralBonusBalance(db, row.referrer_id);
    await deliverUserNotificationSafely(db, {
      id: `referral-rewarded-${row.id}`,
      userId: row.referrer_id,
      kind: "referral_rewarded",
      title: "Бонус начислен: бесплатный релиз",
      message: `За друга ${friend}. Всего бесплатных релизов: ${balance}.`,
      href: "/dashboard/referrals",
      sendTelegram: true,
      sendVk: true
    });
  }

  for (const userId of touched) {
    const rewarded = await db.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM icecream.referrals
      WHERE referrer_id = ${userId}::uuid AND rewarded_at IS NOT NULL AND revoked_at IS NULL`;
    const count = rewarded[0]?.n ?? 0;
    for (const rung of REFERRAL_LADDER) {
      if (count < rung.step) continue;
      const inserted = await db.$queryRaw<Array<{ step: number }>>`
        INSERT INTO icecream.referral_ladder_rewards (user_id, step, plan)
        VALUES (${userId}::uuid, ${rung.step}, ${rung.plan})
        ON CONFLICT DO NOTHING
        RETURNING step`;
      if (!inserted[0]) continue;
      // Earned, not switched on: the artist activates the month with a button when it suits them.
      await deliverUserNotificationSafely(db, {
        id: `referral-ladder-${userId}-${rung.step}`,
        userId,
        kind: "referral_ladder",
        title: `${rung.step} оплативших друга — ${rung.label} твой!`,
        message: `Активируй его на странице «Пригласить друга», когда будет удобно: месяц ${rung.plan} добавится к текущей подписке.`,
        href: "/dashboard/referrals",
        sendTelegram: true,
        sendVk: true
      });
    }
  }
}

/**
 * Switches on an earned ladder month. It is added on top of the current subscription; an artist
 * on a higher plan keeps it and gets a month more. Each month can be activated once.
 */
export async function activateLadderReward(
  db: Db,
  params: { userId: string; step: number }
): Promise<{ ok: true; plan: string } | { ok: false; reason: "not_earned" | "already_active" }> {
  const rows = await db.$queryRaw<Array<{ plan: string }>>`
    UPDATE icecream.referral_ladder_rewards SET activated_at = now()
    WHERE user_id = ${params.userId}::uuid AND step = ${params.step} AND activated_at IS NULL
    RETURNING plan`;
  const plan = rows[0]?.plan;
  if (!plan) {
    const exists = await db.$queryRaw<Array<{ step: number }>>`
      SELECT step FROM icecream.referral_ladder_rewards WHERE user_id = ${params.userId}::uuid AND step = ${params.step}`;
    return { ok: false, reason: exists[0] ? "already_active" : "not_earned" };
  }
  try {
    await grantLadderMonth(db, params.userId, plan === "ENTERPRISE" ? "ENTERPRISE" : "PRO");
  } catch (error) {
    await db.$executeRaw`
      UPDATE icecream.referral_ladder_rewards SET activated_at = NULL
      WHERE user_id = ${params.userId}::uuid AND step = ${params.step}`;
    throw error;
  }
  return { ok: true, plan };
}

export async function getReferralBonusBalance(db: Db | Prisma.TransactionClient, userId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ n: number }>>`
    SELECT COALESCE(sum(delta), 0)::int AS n FROM icecream.referral_bonus_ledger WHERE user_id = ${userId}::uuid`;
  return Math.max(0, rows[0]?.n ?? 0);
}

/** Spends one bonus on a release. False when there is none left (or the release already used one). */
export async function claimReferralBonusForRelease(
  tx: Prisma.TransactionClient,
  params: { userId: string; releaseId: string }
): Promise<boolean> {
  // One claim at a time per artist, so two tabs cannot spend the same bonus.
  await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`referral-bonus:${params.userId}`}))) AS lock`;
  if ((await getReferralBonusBalance(tx, params.userId)) <= 0) return false;
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO icecream.referral_bonus_ledger (user_id, delta, reason, release_id)
    VALUES (${params.userId}::uuid, -1, 'used', ${params.releaseId}::uuid)
    ON CONFLICT DO NOTHING
    RETURNING id`;
  return Boolean(rows[0]);
}

function friendStatus(row: { paid_at: Date | null; rewarded_at: Date | null; revoked_at: Date | null }): ReferralFriendStatus {
  if (row.revoked_at) return "revoked";
  if (row.rewarded_at) return "rewarded";
  if (row.paid_at) return "paid";
  return "registered";
}

export async function getReferralOverview(db: Db, userId: string): Promise<ReferralOverview> {
  await settleReferralRewards(db, userId).catch((error) => console.error("[referrals] settle failed", error));
  const code = await getOrCreateReferralCode(db, userId);
  const rows = await db.$queryRaw<Array<{
    referred_id: string;
    created_at: Date;
    paid_at: Date | null;
    reward_due_at: Date | null;
    rewarded_at: Date | null;
    revoked_at: Date | null;
  }>>`
    SELECT referred_id, created_at, paid_at, reward_due_at, rewarded_at, revoked_at
    FROM icecream.referrals WHERE referrer_id = ${userId}::uuid
    ORDER BY created_at DESC LIMIT 200`;
  const friends = await Promise.all(
    rows.map(async (row) => ({
      nickname: await resolveReferralNickname(db, row.referred_id),
      joinedAt: row.created_at.toISOString(),
      status: friendStatus(row),
      rewardDueAt: row.reward_due_at && !row.rewarded_at ? row.reward_due_at.toISOString() : null
    }))
  );
  const payingFriends = friends.filter((friend) => friend.status === "paid" || friend.status === "rewarded").length;
  const earned = await db.$queryRaw<Array<{ step: number; activated_at: Date | null }>>`
    SELECT step, activated_at FROM icecream.referral_ladder_rewards WHERE user_id = ${userId}::uuid`;
  const earnedByStep = new Map(earned.map((row) => [row.step, row.activated_at]));
  return {
    code,
    link: buildReferralLink(code),
    bonusBalance: await getReferralBonusBalance(db, userId),
    payingFriends,
    friends,
    ladder: REFERRAL_LADDER.map((rung) => ({
      ...rung,
      reached: payingFriends >= rung.step,
      state: !earnedByStep.has(rung.step) ? "locked" : earnedByStep.get(rung.step) ? "activated" : "available"
    }))
  };
}

// ---- Admin ----------------------------------------------------------------------------------

export interface AdminReferralRow {
  id: string;
  referrerId: string;
  referrerName: string;
  referredId: string;
  referredName: string;
  createdAt: string;
  paidAt: string | null;
  rewardDueAt: string | null;
  rewardedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export async function listReferralsForAdmin(db: Db): Promise<AdminReferralRow[]> {
  await settleReferralRewards(db).catch((error) => console.error("[referrals] settle failed", error));
  const rows = await db.$queryRaw<Array<{
    id: string;
    referrer_id: string;
    referrer_name: string | null;
    referred_id: string;
    referred_name: string | null;
    created_at: Date;
    paid_at: Date | null;
    reward_due_at: Date | null;
    rewarded_at: Date | null;
    revoked_at: Date | null;
    revoke_reason: string | null;
  }>>`
    SELECT r.id, r.referrer_id, a.name AS referrer_name, r.referred_id, b.name AS referred_name,
           r.created_at, r.paid_at, r.reward_due_at, r.rewarded_at, r.revoked_at, r.revoke_reason
    FROM icecream.referrals r
    JOIN icecream."user" a ON a.id = r.referrer_id
    JOIN icecream."user" b ON b.id = r.referred_id
    ORDER BY r.created_at DESC LIMIT 500`;
  const iso = (value: Date | null) => (value ? value.toISOString() : null);
  return rows.map((row) => ({
    id: row.id,
    referrerId: row.referrer_id,
    referrerName: row.referrer_name ?? "—",
    referredId: row.referred_id,
    referredName: row.referred_name ?? "—",
    createdAt: row.created_at.toISOString(),
    paidAt: iso(row.paid_at),
    rewardDueAt: iso(row.reward_due_at),
    rewardedAt: iso(row.rewarded_at),
    revokedAt: iso(row.revoked_at),
    revokeReason: row.revoke_reason
  }));
}

/** Cancels a referral (e.g. obvious self-invites). A bonus already given is taken back. */
export async function revokeReferral(db: Db, params: { id: string; reason: string }): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ referrer_id: string; rewarded_at: Date | null }>>`
    UPDATE icecream.referrals SET revoked_at = now(), revoke_reason = ${params.reason.slice(0, 500)}
    WHERE id = ${params.id}::uuid AND revoked_at IS NULL
    RETURNING referrer_id, rewarded_at`;
  const row = rows[0];
  if (!row) return false;
  if (row.rewarded_at) {
    await db.$executeRaw`
      INSERT INTO icecream.referral_bonus_ledger (user_id, delta, reason, referral_id)
      VALUES (${row.referrer_id}::uuid, -1, 'revoked', ${params.id}::uuid)
      ON CONFLICT DO NOTHING`;
  }
  return true;
}

/**
 * The price a friend pays: 20% off the first release or subscription payment. Extras supplements
 * are charged in full. `discount` goes into the order metadata so the payment check accepts it.
 */
export async function priceWithReferralDiscount(
  db: Db,
  params: { userId: string; amountRub: number; supplement?: boolean }
): Promise<{ amountRub: number; discount: { percent: number; fullAmountRub: number } | null }> {
  if (params.supplement || params.amountRub <= 0) return { amountRub: params.amountRub, discount: null };
  const percent = await getReferralDiscountPercent(db, params.userId).catch(() => 0);
  if (!percent) return { amountRub: params.amountRub, discount: null };
  return {
    amountRub: Math.round(params.amountRub * (100 - percent) / 100),
    discount: { percent, fullAmountRub: params.amountRub }
  };
}
