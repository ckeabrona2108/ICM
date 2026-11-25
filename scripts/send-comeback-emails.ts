// "We miss you" letters for quiet artists.
//
//   npx tsx --env-file=.env scripts/send-comeback-emails.ts                         who would get each letter (reads only)
//   npx tsx --env-file=.env scripts/send-comeback-emails.ts --preview-to=me@mail.ru  both letters to one address to look at
//   npx tsx --env-file=.env scripts/send-comeback-emails.ts --send --campaign=comeback-released --limit=10
//                                                                                     send, one letter every --delay-sec (default 120)
//   npx tsx --env-file=.env scripts/send-comeback-emails.ts --resend --campaign=comeback-released [--send --limit=10]
//                                                                                     the same letter again to artists who got it before
//                                                                                     --resend-before (default 2026-11-24, when smtp.bz still
//                                                                                     marked every letter as bulk mail and Yandex put it in Spam)
//
// --env-file loads the mail settings (SMTP) and the database address from .env.
//
// Only confirmed real addresses get a letter. Skipped: unsubscribed artists, artists who already got
// this campaign, and artists who got any campaign letter in the last --cooldown-days (default 90),
// so a new campaign does not land right after the previous one. The command can be stopped and
// started again safely.

import { PrismaClient } from "@prisma/client";

import {
  buildComebackLetter,
  COMEBACK_CAMPAIGNS,
  isComebackCampaign,
  newUnsubscribeToken,
  type ComebackCampaign
} from "@/lib/comeback-emails";
import { getSmtpBzTransporter, getSmtpFromAddress } from "@/lib/smtp-bz";

const prisma = new PrismaClient();

function readArg(name: string): string | null {
  const direct = process.argv.find((arg) => arg === name);
  if (direct) return "true";
  const prefixed = process.argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : null;
}

interface Recipient {
  id: string;
  email: string;
}

// Quiet means: no release dated within the last month and nothing done in the cabinet for a month
// (sending a release, paying, AI, support messages, posts, payouts, contract).
const SELECT_RECIPIENTS = `
WITH act AS (
  SELECT u.id, u.email,
    (SELECT count(*) FROM icecream.release r WHERE r."userId" = u.id) AS releases,
    (SELECT max(r.date) FROM icecream.release r WHERE r."userId" = u.id) AS last_release,
    GREATEST(
      (SELECT max(r.date) FROM icecream.release r WHERE r."userId" = u.id AND r.date <= now()),
      (SELECT max(x.created_at) FROM icecream.release_submission_requests x WHERE x.user_id = u.id),
      (SELECT max(x."createdAt") FROM icecream.orders x WHERE x."userId" = u.id),
      (SELECT max(x.created_at) FROM icecream.ai_generations x WHERE x.user_id = u.id),
      (SELECT max(x."createdAt") FROM icecream."Message" x WHERE x."userId" = u.id AND x.direction = 'INBOUND'),
      (SELECT max(x.created_at) FROM icecream.artist_profile_posts x WHERE x.user_id = u.id),
      (SELECT max(x."createdAt") FROM icecream.payouts x WHERE x."userId" = u.id),
      (SELECT max(x."getDate") FROM icecream.verification x WHERE x."userId" = u.id)
    ) AS last_activity
  FROM icecream."user" u
  WHERE u."isAdmin" = false
    AND u."emailVerified" IS NOT NULL
    AND u.email LIKE '%@%'
    AND u.email NOT LIKE '%.invalid'
    -- Throwaway and made-up addresses only bounce and hurt the sender's reputation.
    AND lower(u.email) ~ '^[^@ ]+@[a-z0-9-]+([.][a-z0-9-]+)*[.](ru|com|net|org|me|io|de|ua|by|kz|eu|su|info)$'
    AND split_part(lower(u.email), '@', 2) NOT IN ('byom.de', 'mowline.com', 'qwe.qwe', 'test.com', 'example.com', 'mailinator.com', 'yopmail.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com', 'sharklasers.com')
)
SELECT id, email FROM act
WHERE COALESCE(last_activity, 'epoch') < now() - interval '1 month'
  AND (
    ($1::text = 'comeback-released' AND releases > 0 AND last_release < now() - interval '1 month')
    OR ($1::text = 'comeback-first-release' AND releases = 0)
  )
ORDER BY email`;

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regclass(${`icecream.${name}`}) IS NOT NULL AS "exists"`;
  return rows[0]?.exists === true;
}

const COOLDOWN_DAYS = (() => {
  const value = Number(readArg("--cooldown-days") ?? "90");
  return Number.isFinite(value) && value >= 0 ? value : 90;
})();

async function listRecipients(campaign: ComebackCampaign): Promise<{ all: Recipient[]; pending: Recipient[] }> {
  const all = await prisma.$queryRawUnsafe<Recipient[]>(SELECT_RECIPIENTS, campaign);
  if (!(await tableExists("email_campaign_sends")) || !(await tableExists("marketing_email_optouts"))) {
    return { all, pending: all };
  }
  const since = new Date(Date.now() - COOLDOWN_DAYS * 24 * 60 * 60_000);
  const [sent, recent, optedOut] = await Promise.all([
    prisma.email_campaign_sends.findMany({ where: { campaign }, select: { user_id: true, email: true } }),
    prisma.email_campaign_sends.findMany({ where: { sent_at: { gt: since } }, select: { user_id: true, email: true } }),
    prisma.marketing_email_optouts.findMany({ select: { user_id: true } })
  ]);
  const skip = new Set([...sent, ...recent, ...optedOut].map((row) => row.user_id));
  // One mailbox gets one letter, however the address is spelled in different cabinets.
  const mailboxes = new Set([...sent, ...recent].map((row) => row.email.trim().toLowerCase()));
  const pending: Recipient[] = [];
  for (const row of all) {
    const mailbox = row.email.trim().toLowerCase();
    if (skip.has(row.id) || mailboxes.has(mailbox)) continue;
    mailboxes.add(mailbox);
    pending.push(row);
  }
  return { all, pending };
}

const RESEND_BEFORE = new Date(readArg("--resend-before") ?? "2026-11-24T00:00:00Z");

// Artists who got this campaign before RESEND_BEFORE, still fit it, have not unsubscribed and have not
// been resent yet. A resend is stored as its own campaign "<campaign>:resend".
async function listResendRecipients(campaign: ComebackCampaign): Promise<Recipient[]> {
  const { all } = await listRecipients(campaign);
  const [earlier, resent, optedOut] = await Promise.all([
    prisma.email_campaign_sends.findMany({ where: { campaign, sent_at: { lt: RESEND_BEFORE } }, select: { user_id: true } }),
    prisma.email_campaign_sends.findMany({ where: { campaign: `${campaign}:resend` }, select: { user_id: true, email: true } }),
    prisma.marketing_email_optouts.findMany({ select: { user_id: true } })
  ]);
  const wanted = new Set(earlier.map((row) => row.user_id));
  const skip = new Set([...resent, ...optedOut].map((row) => row.user_id));
  const mailboxes = new Set(resent.map((row) => row.email.trim().toLowerCase()));
  const pending: Recipient[] = [];
  for (const row of all) {
    const mailbox = row.email.trim().toLowerCase();
    if (!wanted.has(row.id) || skip.has(row.id) || mailboxes.has(mailbox)) continue;
    mailboxes.add(mailbox);
    pending.push(row);
  }
  return pending;
}

function mask(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

function transporterOrExit() {
  const transporter = getSmtpBzTransporter();
  const from = getSmtpFromAddress();
  if (!transporter || !from) {
    console.error("Почта не настроена: нет SMTP в .env");
    process.exit(1);
  }
  return { transporter, from };
}

async function preview(to: string) {
  const { transporter, from } = transporterOrExit();
  for (const campaign of COMEBACK_CAMPAIGNS) {
    // A preview is not stored, so its unsubscribe link opens "link is not valid".
    const letter = buildComebackLetter(campaign, { unsubscribeToken: newUnsubscribeToken() });
    // Same headers as the real letter, so the preview shows how mail services treat it.
    await transporter.sendMail({ from, to, subject: `[Проверка] ${letter.subject}`, text: letter.text, html: letter.html, headers: letter.headers });
    console.log(`Отправлено на ${to}: ${campaign}`);
  }
}

async function send(campaign: ComebackCampaign, limit: number, delayMs: number, resend: boolean) {
  if (!(await tableExists("email_campaign_sends")) || !(await tableExists("marketing_email_optouts"))) {
    console.error("Нет таблиц рассылок в базе: сначала примените миграцию 20261122150000_email_campaigns.");
    process.exit(1);
  }
  const { transporter, from } = transporterOrExit();
  const pending = resend ? await listResendRecipients(campaign) : (await listRecipients(campaign)).pending;
  const storedCampaign = resend ? `${campaign}:resend` : campaign;
  const batch = pending.slice(0, limit);
  console.log(`${storedCampaign}: осталось ${pending.length}, отправляю ${batch.length}, пауза ${Math.round(delayMs / 1000)} с`);

  for (const [index, recipient] of batch.entries()) {
    const token = newUnsubscribeToken();
    const letter = buildComebackLetter(campaign, { unsubscribeToken: token });
    try {
      // The row is written first: if the process dies after sending, the artist is not mailed twice.
      const row = await prisma.email_campaign_sends.create({
        data: { campaign: storedCampaign, user_id: recipient.id, email: recipient.email, token },
        select: { id: true }
      });
      const info = await transporter.sendMail({
        from,
        to: recipient.email,
        subject: letter.subject,
        text: letter.text,
        html: letter.html,
        headers: letter.headers
      });
      await prisma.email_campaign_sends.update({
        where: { id: row.id },
        data: { message_id: typeof info.messageId === "string" ? info.messageId : null }
      });
      console.log(`${index + 1}/${batch.length} ✓ ${mask(recipient.email)}`);
    } catch (error) {
      console.error(`${index + 1}/${batch.length} ✗ ${mask(recipient.email)}`, error instanceof Error ? error.message : error);
    }
    if (index < batch.length - 1) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function main() {
  const previewTo = readArg("--preview-to");
  if (previewTo && previewTo !== "true") {
    await preview(previewTo);
    return;
  }

  const campaignArg = readArg("--campaign");
  const campaigns = campaignArg && campaignArg !== "true" ? [campaignArg] : [...COMEBACK_CAMPAIGNS];
  for (const campaign of campaigns) {
    if (!isComebackCampaign(campaign)) {
      console.error(`Неизвестная рассылка: ${campaign}. Есть: ${COMEBACK_CAMPAIGNS.join(", ")}`);
      process.exit(1);
    }
  }

  const resend = readArg("--resend") === "true";

  if (readArg("--send")) {
    if (campaigns.length !== 1) {
      console.error("Для отправки укажите одну рассылку: --campaign=...");
      process.exit(1);
    }
    const limit = Number(readArg("--limit") ?? "10");
    const delaySec = Number(readArg("--delay-sec") ?? "120");
    await send(campaigns[0] as ComebackCampaign, Number.isFinite(limit) && limit > 0 ? limit : 10, Math.max(5, delaySec) * 1000, resend);
    return;
  }

  for (const campaign of campaigns as ComebackCampaign[]) {
    if (resend) {
      const pending = await listResendRecipients(campaign);
      console.log(`\n${campaign}: повторно получат ${pending.length} (письмо ушло до ${RESEND_BEFORE.toISOString().slice(0, 10)})`);
      for (const recipient of pending) console.log(`  ${mask(recipient.email)}`);
      continue;
    }
    const { all, pending } = await listRecipients(campaign);
    console.log(`\n${campaign}: подходят ${all.length}, ещё не получили ${pending.length}`);
    for (const recipient of pending) console.log(`  ${mask(recipient.email)}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
