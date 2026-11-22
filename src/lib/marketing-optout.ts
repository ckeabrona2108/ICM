import type { PrismaClient } from "@prisma/client";

import { isUnsubscribeTokenShape } from "@/lib/comeback-emails";

type Db = Pick<PrismaClient, "email_campaign_sends">;

/** The artist a letter's unsubscribe token belongs to, or null for an unknown or malformed token. */
export async function findUnsubscribeUser(db: Db, token: string | null | undefined): Promise<string | null> {
  if (!isUnsubscribeTokenShape(token)) return null;
  const row = await db.email_campaign_sends.findUnique({ where: { token }, select: { user_id: true } }).catch(() => null);
  return row?.user_id ?? null;
}

/** Stops campaign letters for this artist. Account mail is not affected. */
export async function optOutOfCampaignLetters(db: Pick<PrismaClient, "marketing_email_optouts">, userId: string): Promise<void> {
  await db.marketing_email_optouts.upsert({ where: { user_id: userId }, create: { user_id: userId }, update: {} });
}
