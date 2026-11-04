import type { PrismaClient } from "@prisma/client";

import { canReceiveAccountEmail } from "@/lib/account-security";
import { readNotificationSettings } from "@/lib/notification-settings";
import { readOAuthEnv } from "@/lib/oauth-login";
import { isAnyPrismaColumnMissingError, isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { getTelegramLoginConfig } from "@/lib/telegram-login";
import { getVkIdConfig } from "@/lib/vk-id";
import { getVkMessagesConfig } from "@/lib/vk-messages";

// "Linked accounts" and "Notifications" in the profile: how the artist signs in and where
// account events reach them. Every sign-in method can be disconnected except the last one.

export type LoginMethodId = "password" | "yandex" | "vk" | "telegram";
export const LOGIN_METHOD_IDS: readonly LoginMethodId[] = ["password", "yandex", "vk", "telegram"];

export type LoginMethods = Record<LoginMethodId, boolean>;

export function isLoginMethodId(value: unknown): value is LoginMethodId {
  return typeof value === "string" && (LOGIN_METHOD_IDS as readonly string[]).includes(value);
}

export function countLoginMethods(methods: LoginMethods): number {
  return LOGIN_METHOD_IDS.filter((id) => methods[id]).length;
}

export function canDisconnectLoginMethod(methods: LoginMethods, method: LoginMethodId): boolean {
  return methods[method] && countLoginMethods(methods) > 1;
}

export type EmailChannelStatus = "active" | "unverified" | "missing";
export type MessengerChannelStatus = "active" | "not_allowed" | "not_linked" | "unavailable";
export type PushChannelStatus = "active" | "off" | "unavailable";

export interface LinkedAccountsState {
  isAdmin: boolean;
  methods: Record<LoginMethodId, { connected: boolean; available: boolean; canDisconnect: boolean }>;
  telegramBot: { id: string; username: string } | null;
  notifications: {
    // `enabled` is the artist's switch; a linked channel can be turned off without unlinking.
    email: { status: EmailChannelStatus; address: string | null; enabled: boolean };
    vk: { status: MessengerChannelStatus; enabled: boolean };
    telegram: { status: MessengerChannelStatus; botUsername: string | null; enabled: boolean };
    push: { status: PushChannelStatus; devices: number; publicKey: string | null };
  };
}

export function resolveEmailChannel(email: string | null | undefined, emailVerified: Date | null | undefined) {
  if (!canReceiveAccountEmail(email)) return { status: "missing" as const, address: null };
  return { status: emailVerified ? ("active" as const) : ("unverified" as const), address: email };
}

export function resolveMessengerChannel(params: {
  available: boolean;
  linked: boolean;
  allowed: boolean;
}): MessengerChannelStatus {
  if (!params.available) return "unavailable";
  if (!params.linked) return "not_linked";
  return params.allowed ? "active" : "not_allowed";
}

type Db = Pick<PrismaClient, "user" | "vk_links" | "oauth_accounts" | "push_subscriptions" | "user_notification_settings">;

const LINK_STORAGE = ["vk_links", "icecream.vk_links", "oauth_accounts", "icecream.oauth_accounts"];

function isLinkStorageMissing(error: unknown) {
  return (
    isAnyPrismaTableMissingError(error, LINK_STORAGE) ||
    isAnyPrismaColumnMissingError(error, ["vk_links.messages_allowed", "messages_allowed", "oauth_accounts.messages_blocked_at", "messages_blocked_at"])
  );
}

// Each link is read on its own: a missing table or a not-yet-applied column on one side must
// not hide the other (a VK link once showed as "not connected" before the Telegram migration).
async function readVkLink(db: Db, userId: string) {
  try {
    return await db.vk_links.findUnique({ where: { user_id: userId }, select: { messages_allowed: true } });
  } catch (error) {
    if (isAnyPrismaColumnMissingError(error, ["vk_links.messages_allowed", "messages_allowed"])) {
      const link = await db.vk_links.findUnique({ where: { user_id: userId }, select: { id: true } });
      return link ? { messages_allowed: false } : null;
    }
    if (isLinkStorageMissing(error)) return null;
    throw error;
  }
}

async function readOAuthLinks(db: Db, userId: string): Promise<Array<{ provider: string; messages_blocked_at: Date | null }>> {
  try {
    return await db.oauth_accounts.findMany({ where: { user_id: userId }, select: { provider: true, messages_blocked_at: true } });
  } catch (error) {
    if (isAnyPrismaColumnMissingError(error, ["oauth_accounts.messages_blocked_at", "messages_blocked_at"])) {
      const rows = await db.oauth_accounts.findMany({ where: { user_id: userId }, select: { provider: true } });
      return rows.map((row) => ({ provider: row.provider, messages_blocked_at: null }));
    }
    if (isLinkStorageMissing(error)) return [];
    throw error;
  }
}

async function readLinks(db: Db, userId: string) {
  const [vk, oauth] = await Promise.all([readVkLink(db, userId), readOAuthLinks(db, userId)]);
  return { vk, oauth };
}

export async function readLinkedAccounts(
  db: Db,
  userId: string,
  options: { isAdminEmail: (email: string) => boolean }
): Promise<LinkedAccountsState | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true, password: true, isAdmin: true }
  });
  if (!user) return null;

  const [{ vk, oauth }, pushDevices, settings] = await Promise.all([
    readLinks(db, userId),
    db.push_subscriptions.count({ where: { user_id: userId } }).catch(() => 0),
    readNotificationSettings(db, userId)
  ]);
  const telegramAccount = oauth.find((account) => account.provider === "telegram") ?? null;

  const telegramConfig = getTelegramLoginConfig();
  const pushKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim() || null;
  const connected: LoginMethods = {
    password: Boolean(user.password),
    yandex: oauth.some((account) => account.provider === "yandex"),
    vk: Boolean(vk),
    telegram: Boolean(telegramAccount)
  };
  const available: LoginMethods = {
    // A password needs an address for the link that sets it.
    password: connected.password || canReceiveAccountEmail(user.email),
    yandex: Boolean(readOAuthEnv("AUTH_YANDEX_ID") && readOAuthEnv("AUTH_YANDEX_SECRET")),
    vk: Boolean(getVkIdConfig()),
    telegram: Boolean(telegramConfig)
  };
  const isAdmin = user.isAdmin || options.isAdminEmail(user.email);

  const methods = Object.fromEntries(
    LOGIN_METHOD_IDS.map((id) => [
      id,
      {
        connected: connected[id],
        // Admin cabinets sign in with email and password only.
        available: id === "password" ? available.password : available[id] && !isAdmin,
        canDisconnect: canDisconnectLoginMethod(connected, id)
      }
    ])
  ) as LinkedAccountsState["methods"];

  return {
    isAdmin,
    methods,
    telegramBot: telegramConfig ? { id: telegramConfig.botId, username: telegramConfig.botUsername } : null,
    notifications: {
      email: { ...resolveEmailChannel(user.email, user.emailVerified), enabled: settings.email },
      vk: {
        enabled: settings.vk,
        status: resolveMessengerChannel({
          available: Boolean(getVkMessagesConfig()),
          linked: connected.vk,
          allowed: Boolean(vk?.messages_allowed)
        })
      },
      telegram: {
        enabled: settings.telegram,
        status: resolveMessengerChannel({
          available: Boolean(telegramConfig),
          linked: connected.telegram,
          allowed: Boolean(telegramAccount && !telegramAccount.messages_blocked_at)
        }),
        botUsername: telegramConfig?.botUsername ?? null
      },
      push: {
        status: pushKey ? (pushDevices > 0 ? "active" : "off") : "unavailable",
        devices: pushDevices,
        publicKey: pushKey
      }
    }
  };
}

export type DisconnectResult = { ok: true } | { ok: false; error: "last_method" | "not_connected" };

// Re-reads the methods inside a transaction so two tabs cannot each remove "the other" method.
export async function disconnectLoginMethod(
  db: Pick<PrismaClient, "$transaction">,
  userId: string,
  method: LoginMethodId
): Promise<DisconnectResult> {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { password: true, vk_link: { select: { id: true } }, oauth_accounts: { select: { provider: true } } }
    });
    if (!user) return { ok: false, error: "not_connected" } as const;
    const methods: LoginMethods = {
      password: Boolean(user.password),
      yandex: user.oauth_accounts.some((account) => account.provider === "yandex"),
      vk: Boolean(user.vk_link),
      telegram: user.oauth_accounts.some((account) => account.provider === "telegram")
    };
    if (!methods[method]) return { ok: false, error: "not_connected" } as const;
    if (!canDisconnectLoginMethod(methods, method)) return { ok: false, error: "last_method" } as const;

    if (method === "password") await tx.user.update({ where: { id: userId }, data: { password: null }, select: { id: true } });
    if (method === "vk") await tx.vk_links.delete({ where: { user_id: userId }, select: { id: true } });
    if (method === "yandex" || method === "telegram") {
      await tx.oauth_accounts.deleteMany({ where: { user_id: userId, provider: method } });
    }
    return { ok: true } as const;
  });
}
