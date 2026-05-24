// @ts-nocheck
import { randomBytes, createHash } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { hashPassword } from "@/lib/password";
import { getSmtpBzTransporter, getSmtpFromAddress } from "@/lib/smtp-bz";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_PREFIX = "password-reset:";

type PrismaLike = Pick<PrismaClient, "user" | "verificationToken" | "session" | "$transaction">;

export interface PasswordResetEmailPayload {
  userEmail: string;
  userName: string | null;
  resetUrl: string;
  expiresAt: Date;
}

export interface PasswordResetRequestResult {
  accepted: true;
  previewUrl: string | null;
}

export interface PasswordResetConsumeResult {
  ok: true;
}

type Logger = Pick<Console, "warn" | "error" | "info">;

function getLogger(logger?: Logger): Logger {
  return logger ?? console;
}

function buildAppUrl(path: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_DOMAIN?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "http://localhost:3000";
  return new URL(path, baseUrl).toString();
}

function buildIdentifier(user_id: string) {
  return `${PASSWORD_RESET_PREFIX}${user_id}`;
}

function parseIdentifier(identifier: string): string | null {
  if (!identifier.startsWith(PASSWORD_RESET_PREFIX)) return null;
  const user_id = identifier.slice(PASSWORD_RESET_PREFIX.length).trim();
  return user_id || null;
}

function hashToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function allowPreviewMode() {
  return process.env.NODE_ENV !== "production" || process.env.AUTH_SHOW_RESET_PREVIEW === "true";
}

async function sendPasswordResetEmail(payload: PasswordResetEmailPayload, logger: Logger): Promise<string | null> {
  const transporter = getSmtpBzTransporter();
  const from = getSmtpFromAddress();

  if (!transporter || !from) {
    if (allowPreviewMode()) {
      logger.info(
        `[auth] password reset preview for ${payload.userEmail}: ${payload.resetUrl}`
      );
      return payload.resetUrl;
    }
    logger.warn(
      `[auth] password reset email skipped for ${payload.userEmail}: SMTP.BZ credentials or sender address is not configured`
    );
    return null;
  }

  await transporter.sendMail({
    from,
    to: payload.userEmail,
    subject: "Восстановление пароля",
    html: [
      "<div style=\"font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#0f172a;\">",
      "<h2 style=\"margin:0 0 12px;\">Сброс пароля</h2>",
      "<p style=\"margin:0 0 12px;\">Мы получили запрос на смену пароля для вашего аккаунта ICECREAMMUSIC.</p>",
      `<p style=\"margin:0 0 16px;\"><a href=\"${payload.resetUrl}\" style=\"display:inline-block;padding:10px 14px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;\">Сбросить пароль</a></p>`,
      "<p style=\"margin:0;color:#64748b;font-size:13px;\">Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо.</p>",
      "</div>"
    ].join(""),
    text: [
      "Сброс пароля ICECREAMMUSIC",
      "",
      "Мы получили запрос на смену пароля для вашего аккаунта.",
      `Ссылка для сброса пароля: ${payload.resetUrl}`,
      "Если вы не запрашивали восстановление пароля, просто проигнорируйте это письмо."
    ].join("\n")
  });

  logger.info(`[auth] password reset email sent to ${payload.userEmail}`);
  return null;
}

export async function requestPasswordReset(params: {
  prisma: PrismaLike;
  email: string;
  now?: Date;
  logger?: Logger;
  notify?: (payload: PasswordResetEmailPayload) => Promise<string | null>;
}): Promise<PasswordResetRequestResult> {
  const logger = getLogger(params.logger);
  const email = params.email.trim().toLowerCase();
  const now = params.now ?? new Date();

  const user = await params.prisma.user.findFirst({
    where: {
      email: {
        equals: email,
        mode: "insensitive"
      }
    },
    select: { id: true, email: true, name: true }
  });

  if (!user) {
    return { accepted: true, previewUrl: null };
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS);
  const identifier = buildIdentifier(user.id);

  await params.prisma.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({
      where: {
        OR: [
          { identifier },
          {
            expires: {
              lt: now
            }
          }
        ]
      }
    });

    await tx.verificationToken.create({
      data: {
        identifier,
        token: tokenHash,
        expires: expiresAt
      }
    });
  });

  const resetUrl = buildAppUrl(`/reset-password?token=${encodeURIComponent(rawToken)}`);

  try {
    const previewUrl = await (params.notify ?? ((payload) => sendPasswordResetEmail(payload, logger)))({
      userEmail: user.email,
      userName: user.name,
      resetUrl,
      expiresAt
    });

    return {
      accepted: true,
      previewUrl
    };
  } catch (error) {
    logger.error("[auth] password reset delivery failed", error);
    return {
      accepted: true,
      previewUrl: null
    };
  }
}

export async function resetPasswordWithToken(params: {
  prisma: PrismaLike;
  token: string;
  password: string;
  now?: Date;
}): Promise<PasswordResetConsumeResult> {
  const rawToken = params.token.trim();
  if (!rawToken) {
    throw new Error("INVALID_RESET_TOKEN");
  }

  const tokenHash = hashToken(rawToken);
  const now = params.now ?? new Date();

  const verificationToken = await params.prisma.verificationToken.findUnique({
    where: { token: tokenHash }
  });

  if (!verificationToken || verificationToken.expires <= now) {
    if (verificationToken) {
      await params.prisma.verificationToken.deleteMany({ where: { token: tokenHash } });
    }
    throw new Error("INVALID_RESET_TOKEN");
  }

  const user_id = parseIdentifier(verificationToken.identifier);
  if (!user_id) {
    await params.prisma.verificationToken.deleteMany({ where: { token: tokenHash } });
    throw new Error("INVALID_RESET_TOKEN");
  }

  const passwordHash = await hashPassword(params.password);

  await params.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user_id },
      data: {
        passwordHash
      }
    });

    await tx.session.deleteMany({
      where: { userId: user_id }
    });

    await tx.verificationToken.deleteMany({
      where: {
        identifier: verificationToken.identifier
      }
    });
  });

  return { ok: true };
}
