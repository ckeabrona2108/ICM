import { randomBytes } from "node:crypto";

import { Prisma } from "@prisma/client";

import { isOAuthPlaceholderEmail } from "@/lib/oauth-login";
import { prisma } from "@/lib/prisma";
import { getSmtpBzTransporter, getSmtpFromAddress } from "@/lib/smtp-bz";

// Password links, email confirmation and the notices that follow them. Links are single-use
// rows in verification_tokens: `recover` sets or resets the password, `confirm` proves an
// email address (the address itself is kept on the row until the link is opened).

const PASSWORD_LINK_TTL_MS = 30 * 60_000;
const EMAIL_CONFIRM_TTL_MS = 24 * 60 * 60_000;

export type PasswordLinkKind = "reset" | "set";
export type PasswordNoticeKind = "set" | "changed" | "reset";
export type EmailConfirmError = "invalid" | "expired" | "taken";

export class AccountEmailUnavailableError extends Error {
  constructor() {
    super("smtp_not_configured");
  }
}

export function resolveAppBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/u, "");
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function escapeEmailHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

// Mail never goes to the .invalid addresses VK sign-ins get when VK hides the email.
export function canReceiveAccountEmail(email: string | null | undefined): email is string {
  return typeof email === "string" && email.includes("@") && !isOAuthPlaceholderEmail(email);
}

export interface AccountEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function greeting(name: string | null | undefined) {
  const trimmed = name?.trim();
  return trimmed ? `Здравствуйте, ${trimmed}.` : "Здравствуйте.";
}

function paragraphs(lines: string[]) {
  return lines.map((line) => `<p>${line}</p>`).join("");
}

function link(url: string) {
  const safe = escapeEmailHtml(url);
  return `<a href="${safe}">${safe}</a>`;
}

export function buildPasswordLinkEmail(params: {
  to: string;
  name: string | null;
  url: string;
  kind: PasswordLinkKind;
}): AccountEmail {
  const action = params.kind === "set" ? "установить пароль" : "сбросить пароль";
  const subject = params.kind === "set" ? "Установка пароля ICECREAMMUSIC" : "Восстановление пароля ICECREAMMUSIC";
  return {
    to: params.to,
    subject,
    text: `${greeting(params.name)}\n\nПерейдите по ссылке, чтобы ${action}: ${params.url}\n\nСсылка действует 30 минут. Если вы не запрашивали письмо, просто проигнорируйте его.`,
    html: paragraphs([
      escapeEmailHtml(greeting(params.name)),
      `Перейдите по ссылке, чтобы ${action}:`,
      link(params.url),
      "Ссылка действует 30 минут. Если вы не запрашивали письмо, просто проигнорируйте его."
    ])
  };
}

export function buildEmailConfirmationEmail(params: { to: string; name: string | null; url: string }): AccountEmail {
  return {
    to: params.to,
    subject: "Подтверждение email ICECREAMMUSIC",
    text: `${greeting(params.name)}\n\nПодтвердите, что этот адрес принадлежит вам: ${params.url}\n\nСсылка действует 24 часа. Если вы не запрашивали письмо, просто проигнорируйте его.`,
    html: paragraphs([
      escapeEmailHtml(greeting(params.name)),
      "Подтвердите, что этот адрес принадлежит вам:",
      link(params.url),
      "Ссылка действует 24 часа. Если вы не запрашивали письмо, просто проигнорируйте его."
    ])
  };
}

export function buildPasswordNoticeEmail(params: {
  to: string;
  name: string | null;
  kind: PasswordNoticeKind;
  resetUrl: string;
}): AccountEmail {
  const what =
    params.kind === "set"
      ? "Для вашего аккаунта установлен пароль."
      : params.kind === "reset"
        ? "Пароль от вашего аккаунта восстановлен по ссылке из письма."
        : "Пароль от вашего аккаунта изменён в настройках.";
  const warning = "Если это были не вы, сразу восстановите пароль:";
  return {
    to: params.to,
    subject: params.kind === "set" ? "Пароль установлен — ICECREAMMUSIC" : "Пароль изменён — ICECREAMMUSIC",
    text: `${greeting(params.name)}\n\n${what}\n\n${warning} ${params.resetUrl}`,
    html: paragraphs([escapeEmailHtml(greeting(params.name)), what, warning, link(params.resetUrl)])
  };
}

export function buildEmailChangedNoticeEmail(params: {
  to: string;
  name: string | null;
  newEmail: string;
  supportUrl: string;
}): AccountEmail {
  const what = `Email вашего аккаунта изменён на ${params.newEmail}. Письма больше не будут приходить на этот адрес.`;
  const warning = "Если это были не вы, срочно напишите в поддержку:";
  return {
    to: params.to,
    subject: "Email аккаунта изменён — ICECREAMMUSIC",
    text: `${greeting(params.name)}\n\n${what}\n\n${warning} ${params.supportUrl}`,
    html: paragraphs([escapeEmailHtml(greeting(params.name)), escapeEmailHtml(what), warning, link(params.supportUrl)])
  };
}

export async function sendAccountEmail(email: AccountEmail): Promise<void> {
  const transporter = getSmtpBzTransporter();
  const from = getSmtpFromAddress();
  if (!transporter || !from) throw new AccountEmailUnavailableError();
  await transporter.sendMail({ from, ...email });
}

// Notices are best effort: a failed notice must not undo the change it reports.
async function sendNotice(email: AccountEmail, context: string) {
  try {
    await sendAccountEmail(email);
  } catch (error) {
    console.error(`[account-security] ${context} notice failed`, error);
  }
}

function newToken() {
  return randomBytes(32).toString("hex");
}

export async function issuePasswordLink(params: {
  user: { id: string; email: string; name: string | null };
  baseUrl: string;
  kind: PasswordLinkKind;
}): Promise<void> {
  if (!canReceiveAccountEmail(params.user.email)) throw new AccountEmailUnavailableError();
  const token = newToken();
  await prisma.verification_tokens.deleteMany({ where: { user_id: params.user.id, type: "recover" } });
  await prisma.verification_tokens.create({
    data: { user_id: params.user.id, token, type: "recover", expires: new Date(Date.now() + PASSWORD_LINK_TTL_MS) }
  });
  try {
    await sendAccountEmail(
      buildPasswordLinkEmail({
        to: params.user.email,
        name: params.user.name,
        url: `${params.baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
        kind: params.kind
      })
    );
  } catch (error) {
    await prisma.verification_tokens.deleteMany({ where: { token } });
    throw error;
  }
}

export async function issueEmailConfirmation(params: {
  user: { id: string; name: string | null };
  email: string;
  baseUrl: string;
}): Promise<void> {
  const token = newToken();
  await prisma.verification_tokens.deleteMany({ where: { user_id: params.user.id, type: "confirm" } });
  await prisma.verification_tokens.create({
    data: {
      user_id: params.user.id,
      token,
      type: "confirm",
      email: params.email,
      expires: new Date(Date.now() + EMAIL_CONFIRM_TTL_MS)
    }
  });
  try {
    await sendAccountEmail(
      buildEmailConfirmationEmail({
        to: params.email,
        name: params.user.name,
        url: `${params.baseUrl}/api/auth/confirm-email?token=${encodeURIComponent(token)}`
      })
    );
  } catch (error) {
    await prisma.verification_tokens.deleteMany({ where: { token } });
    throw error;
  }
}

export async function findPendingEmail(userId: string): Promise<string | null> {
  const row = await prisma.verification_tokens.findFirst({
    where: { user_id: userId, type: "confirm", expires: { gt: new Date() } },
    select: { email: true }
  });
  return row?.email ?? null;
}

export async function confirmEmailToken(
  token: string,
  baseUrl: string
): Promise<{ ok: true } | { ok: false; error: EmailConfirmError }> {
  const row = await prisma.verification_tokens.findUnique({
    where: { token },
    select: { user_id: true, type: true, email: true, expires: true, user: { select: { email: true, name: true } } }
  });
  if (!row || row.type !== "confirm" || !row.email) return { ok: false, error: "invalid" };
  if (row.expires.getTime() < Date.now()) {
    await prisma.verification_tokens.deleteMany({ where: { token } });
    return { ok: false, error: "expired" };
  }

  const newEmail = row.email;
  const oldEmail = row.user.email;
  const taken = await prisma.user.findFirst({
    where: { email: { equals: newEmail, mode: "insensitive" }, id: { not: row.user_id } },
    select: { id: true }
  });
  if (taken) return { ok: false, error: "taken" };

  try {
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.user_id }, data: { email: newEmail, emailVerified: new Date() } }),
      prisma.verification_tokens.deleteMany({ where: { user_id: row.user_id, type: "confirm" } })
    ]);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "taken" };
    }
    throw error;
  }

  if (oldEmail.toLowerCase() !== newEmail.toLowerCase() && canReceiveAccountEmail(oldEmail)) {
    await sendNotice(
      buildEmailChangedNoticeEmail({
        to: oldEmail,
        name: row.user.name,
        newEmail,
        supportUrl: `${baseUrl}/dashboard/support`
      }),
      "email changed"
    );
  }
  return { ok: true };
}

export async function notifyPasswordChanged(params: {
  user: { email: string; name: string | null };
  kind: PasswordNoticeKind;
  baseUrl: string;
}): Promise<void> {
  if (!canReceiveAccountEmail(params.user.email)) return;
  await sendNotice(
    buildPasswordNoticeEmail({
      to: params.user.email,
      name: params.user.name,
      kind: params.kind,
      resetUrl: `${params.baseUrl}/forgot-password`
    }),
    "password"
  );
}
