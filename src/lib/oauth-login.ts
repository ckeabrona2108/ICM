import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isAnyPrismaTableMissingError } from "@/lib/prisma-errors";
import { checkVkGroupMembership, getVkIdConfig } from "@/lib/vk-id";

// Quick sign-in with Yandex ID, VK ID and Telegram. A provider account maps to one cabinet: VK
// through vk_links (the same row the free single relies on), Yandex and Telegram through
// oauth_accounts. The first
// sign-in joins an existing cabinet with the same confirmed email or creates a new one.

export type OAuthProviderId = "yandex" | "vk" | "telegram";

export const OAUTH_PROVIDER_IDS: readonly OAuthProviderId[] = ["yandex", "vk", "telegram"];

export type OAuthLoginError =
  | "OAuthAdminAccount"
  | "OAuthAccountTaken"
  | "OAuthEmailUnverified"
  | "OAuthUnavailable";

export interface OAuthIdentity {
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string | null | undefined;
  name: string | null | undefined;
}

export interface OAuthUser {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  isAdmin: boolean;
}

export type OAuthResolution = { ok: true; user: OAuthUser } | { ok: false; error: OAuthLoginError };

const OAUTH_TABLES = ["oauth_accounts", "icecream.oauth_accounts", "vk_links", "icecream.vk_links"];
const PLACEHOLDER_EMAIL_DOMAIN = "oauth.icecreammusic.invalid";
const maxNameLength = 120;

const userSelect = { id: true, email: true, name: true, avatar: true, isAdmin: true } as const;

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return (OAUTH_PROVIDER_IDS as readonly string[]).includes(value);
}

// `docker run --env-file` keeps quotes literally, so values may arrive wrapped in them.
export function readOAuthEnv(name: string): string {
  return (process.env[name]?.trim() ?? "").replace(/^(["'])(.*)\1$/u, "$2").trim();
}

// VK often hides the email; the cabinet still needs a unique one. The reserved .invalid
// domain keeps mail from ever leaving for it.
export function buildOAuthPlaceholderEmail(provider: OAuthProviderId, providerAccountId: string): string {
  return `${provider}-${providerAccountId}@${PLACEHOLDER_EMAIL_DOMAIN}`.toLowerCase();
}

export function isOAuthPlaceholderEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${PLACEHOLDER_EMAIL_DOMAIN}`);
}

export function normalizeOAuthEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase() ?? "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed) && trimmed.length <= 254 ? trimmed : null;
}

export function normalizeOAuthName(name: string | null | undefined): string {
  const trimmed = name?.replace(/\s+/gu, " ").trim() ?? "";
  return trimmed.length >= 2 ? trimmed.slice(0, maxNameLength) : "Артист";
}

async function findLinkedUser(identity: OAuthIdentity): Promise<OAuthUser | null> {
  if (identity.provider === "vk") {
    const link = await prisma.vk_links.findUnique({
      where: { vk_user_id: identity.providerAccountId },
      select: { user: { select: userSelect } }
    });
    return link?.user ?? null;
  }
  const account = await prisma.oauth_accounts.findUnique({
    where: {
      provider_provider_account_id: {
        provider: identity.provider,
        provider_account_id: identity.providerAccountId
      }
    },
    select: { user: { select: userSelect } }
  });
  return account?.user ?? null;
}

async function readVkMembership(vkUserId: string) {
  const config = getVkIdConfig();
  if (!config) return { is_group_member: false, member_checked_at: null };
  try {
    const isMember = await checkVkGroupMembership({ config, vkUserId });
    return { is_group_member: isMember, member_checked_at: new Date() };
  } catch (error) {
    // The artist can re-check the subscription from the cabinet later.
    console.error("[oauth-login] VK membership check failed", error);
    return { is_group_member: false, member_checked_at: null };
  }
}

async function linkData(identity: OAuthIdentity) {
  if (identity.provider === "vk") {
    return { vk: { vk_user_id: identity.providerAccountId, ...(await readVkMembership(identity.providerAccountId)) } };
  }
  return { oauth: { provider: identity.provider, provider_account_id: identity.providerAccountId } };
}

async function hasOtherLink(userId: string, provider: OAuthProviderId): Promise<boolean> {
  if (provider === "vk") {
    return Boolean(await prisma.vk_links.findUnique({ where: { user_id: userId }, select: { id: true } }));
  }
  return Boolean(
    await prisma.oauth_accounts.findUnique({
      where: { user_id_provider: { user_id: userId, provider } },
      select: { id: true }
    })
  );
}

// `select` keeps the insert from reading back columns a pending migration may not have added yet.
async function createLink(userId: string, link: Awaited<ReturnType<typeof linkData>>) {
  if (link.vk) await prisma.vk_links.create({ data: { user_id: userId, ...link.vk }, select: { id: true } });
  if (link.oauth) await prisma.oauth_accounts.create({ data: { user_id: userId, ...link.oauth }, select: { id: true } });
}

async function resolveOnce(
  identity: OAuthIdentity,
  options: { isAdminEmail: (email: string) => boolean }
): Promise<OAuthResolution> {
  const linked = await findLinkedUser(identity);
  if (linked) return { ok: true, user: linked };

  const email = normalizeOAuthEmail(identity.email);
  const link = await linkData(identity);

  if (email) {
    const existing = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { ...userSelect, emailVerified: true }
    });
    if (existing) {
      // Admin cabinets are never joined by email alone.
      if (existing.isAdmin || options.isAdminEmail(existing.email)) return { ok: false, error: "OAuthAdminAccount" };
      // Registration does not prove the address, so anyone could have taken it first. Only a
      // confirmed address (confirmation link, password reset, earlier OAuth sign-up) is joined.
      if (!existing.emailVerified) return { ok: false, error: "OAuthEmailUnverified" };
      if (await hasOtherLink(existing.id, identity.provider)) return { ok: false, error: "OAuthAccountTaken" };
      await createLink(existing.id, link);
      return {
        ok: true,
        user: { id: existing.id, email: existing.email, name: existing.name, avatar: existing.avatar, isAdmin: existing.isAdmin }
      };
    }
  }

  const user = await prisma.user.create({
    data: {
      email: email ?? buildOAuthPlaceholderEmail(identity.provider, identity.providerAccountId),
      emailVerified: email ? new Date() : null,
      name: normalizeOAuthName(identity.name),
      ...(link.vk ? { vk_link: { create: link.vk } } : {}),
      ...(link.oauth ? { oauth_accounts: { create: link.oauth } } : {})
    },
    select: userSelect
  });
  return { ok: true, user };
}

export async function resolveOAuthUser(
  identity: OAuthIdentity,
  options: { isAdminEmail: (email: string) => boolean }
): Promise<OAuthResolution> {
  try {
    return await resolveOnce(identity, options);
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, OAUTH_TABLES)) {
      console.error("[oauth-login] link tables are missing; run the migrations");
      return { ok: false, error: "OAuthUnavailable" };
    }
    // Two sign-ins raced for the same account: the other one created the link.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const linked = await findLinkedUser(identity).catch(() => null);
      return linked ? { ok: true, user: linked } : { ok: false, error: "OAuthAccountTaken" };
    }
    console.error("[oauth-login] sign-in failed", { provider: identity.provider, error });
    return { ok: false, error: "OAuthUnavailable" };
  }
}

// Linking from the profile, while signed in to the cabinet: no email matching, the provider
// account simply joins this cabinet unless another cabinet already has it.
export type OAuthLinkError = "admin" | "taken" | "already_linked" | "unavailable";
export type OAuthLinkResult = { ok: true; created: boolean } | { ok: false; error: OAuthLinkError };

async function linkOnce(
  userId: string,
  identity: OAuthIdentity,
  options: { isAdminEmail: (email: string) => boolean }
): Promise<OAuthLinkResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isAdmin: true } });
  if (!user) return { ok: false, error: "unavailable" };
  // Admin cabinets sign in with email and password only, so they never get a provider link.
  if (user.isAdmin || options.isAdminEmail(user.email)) return { ok: false, error: "admin" };

  const linked = await findLinkedUser(identity);
  if (linked) return linked.id === userId ? { ok: true, created: false } : { ok: false, error: "taken" };
  if (await hasOtherLink(userId, identity.provider)) return { ok: false, error: "already_linked" };

  await createLink(userId, await linkData(identity));
  return { ok: true, created: true };
}

export async function linkOAuthIdentity(
  userId: string,
  identity: OAuthIdentity,
  options: { isAdminEmail: (email: string) => boolean }
): Promise<OAuthLinkResult> {
  try {
    return await linkOnce(userId, identity, options);
  } catch (error) {
    if (isAnyPrismaTableMissingError(error, OAUTH_TABLES)) return { ok: false, error: "unavailable" };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const linked = await findLinkedUser(identity).catch(() => null);
      return linked?.id === userId ? { ok: true, created: false } : { ok: false, error: "taken" };
    }
    console.error("[oauth-login] link failed", { provider: identity.provider, error });
    return { ok: false, error: "unavailable" };
  }
}
