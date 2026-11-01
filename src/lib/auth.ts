import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { OAuthConfig, Provider } from "next-auth/providers/index";
import YandexProvider from "next-auth/providers/yandex";
import { z } from "zod";

import { verifyPassword } from "@/lib/password";
import { findLegacyUsersForLogin, isMissingCanonicalUserTable } from "@/lib/legacy-user-store";
import { prisma } from "@/lib/prisma";
import { isAnyPrismaColumnMissingError } from "@/lib/prisma-errors";
import { consumeRateLimit } from "@/lib/rate-limit";
import { normalizeNextImageSrc } from "@/lib/image-src";
import { isOAuthProvider, readOAuthEnv, resolveOAuthUser } from "@/lib/oauth-login";
import { exchangeVkIdCode, fetchVkIdUserInfo, getVkIdClientId, type VkIdUserInfo } from "@/lib/vk-id";

const devFallbackSecret = "icm-dev-nextauth-secret-change-me";
const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? devFallbackSecret;
const sessionMaxAgeSeconds = Number(process.env.NEXTAUTH_SESSION_MAX_AGE ?? 60 * 60 * 24 * 30);
const maxSessionEmailLength = 254;
const maxSessionNameLength = 160;
const maxSessionImageLength = 2_048;

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(4)
});

function normalizeLoginIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function limitSessionText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength ? trimmed : null;
}

function resolveSessionImage(value: string | null | undefined) {
  if (value?.trim().startsWith("data:")) return null;
  return limitSessionText(normalizeNextImageSrc(value), maxSessionImageLength);
}

function shouldUseLegacyUserStore(error: unknown) {
  return (
    isMissingCanonicalUserTable(error) ||
    isAnyPrismaColumnMissingError(error, [
      "user.password",
      "password",
      "user.avatar",
      "avatar",
      "user.isAdmin",
      "isAdmin"
    ])
  );
}

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function resolveUserRole(params: { email: string; isAdmin: boolean | null | undefined }) {
  if (params.isAdmin || adminEmails.has(params.email.toLowerCase())) return "ADMIN" as const;
  return "USER" as const;
}

function toSessionUser(user: {
  id: string;
  email: string;
  name: string | null;
  avatar: string | null;
  isAdmin: boolean | null | undefined;
}) {
  return {
    id: user.id,
    // JWT sessions are stored in cookies. Bound these optional profile fields so
    // malformed legacy data can never make every request exceed header limits.
    email: limitSessionText(user.email, maxSessionEmailLength) ?? user.email,
    name: limitSessionText(user.name, maxSessionNameLength) ?? "",
    image: resolveSessionImage(user.avatar),
    role: resolveUserRole({ email: user.email, isAdmin: user.isAdmin })
  };
}

export async function authorizeUserCredentials(credentials: unknown) {
  const parsed = loginSchema.safeParse(credentials);
  if (!parsed.success) return null;

  const identifier = normalizeLoginIdentifier(parsed.data.email);
  const rateLimit = consumeRateLimit({
    key: `auth:login:${identifier}`,
    limit: 10,
    windowMs: 15 * 60_000
  });
  if (!rateLimit.allowed) return null;

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { equals: identifier, mode: "insensitive" } },
        { name: { equals: parsed.data.email.trim(), mode: "insensitive" } }
      ]
    },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      avatar: true,
      isAdmin: true
    },
    take: 2,
    orderBy: {
      id: "asc"
    }
  }).catch(async (error) => {
    // Some deployed databases still use the legacy User table. A missing optional
    // column must not turn a valid login into a 500 response.
    if (!shouldUseLegacyUserStore(error)) throw error;
    const legacyUsers = await findLegacyUsersForLogin(prisma, parsed.data.email);
    return legacyUsers.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      password: user.password,
      avatar: user.avatar,
      isAdmin: user.role === "ADMIN"
    }));
  });

  if (users.length !== 1) {
    if (users.length > 1) {
      console.error("[auth] ambiguous identifier match during login", { identifier });
    }
    return null;
  }

  const user = users[0];
  if (!user?.password) return null;

  const isPasswordValid = await verifyPassword(parsed.data.password, user.password);
  if (!isPasswordValid) return null;

  return toSessionUser(user);
}

// VK ID is OAuth 2.1 with PKCE and wants the device_id from the callback in the token
// request, which the stock VK provider (old oauth.vk.com) cannot send.
type VkIdProfile = Omit<VkIdUserInfo, "email"> & { email?: string };

function VkIdProvider(clientId: string): OAuthConfig<VkIdProfile> {
  return {
    id: "vk",
    name: "VK ID",
    type: "oauth",
    clientId,
    client: { token_endpoint_auth_method: "none" },
    checks: ["pkce", "state"],
    authorization: { url: "https://id.vk.ru/authorize", params: { scope: "email" } },
    token: {
      url: "https://id.vk.ru/oauth2/auth",
      async request({ params, checks, provider }) {
        const { accessToken } = await exchangeVkIdCode({
          clientId,
          code: params.code ?? "",
          codeVerifier: checks.code_verifier ?? "",
          deviceId: typeof params.device_id === "string" ? params.device_id : "",
          redirectUri: provider.callbackUrl,
          state: params.state ?? ""
        });
        return { tokens: { access_token: accessToken, token_type: "bearer" } };
      }
    },
    userinfo: {
      url: "https://id.vk.ru/oauth2/user_info",
      async request({ tokens }) {
        const info = await fetchVkIdUserInfo({ clientId, accessToken: tokens.access_token ?? "" });
        return { ...info, email: info.email ?? undefined };
      }
    },
    profile(profile) {
      return { id: profile.vkUserId, name: profile.name, email: profile.email ?? null, image: null };
    }
  };
}

function buildOAuthProviders(): Provider[] {
  const providers: Provider[] = [];
  const yandexId = readOAuthEnv("AUTH_YANDEX_ID");
  const yandexSecret = readOAuthEnv("AUTH_YANDEX_SECRET");
  if (yandexId && yandexSecret) {
    providers.push(YandexProvider({ clientId: yandexId, clientSecret: yandexSecret }));
  }
  const vkClientId = getVkIdClientId();
  if (vkClientId) providers.push(VkIdProvider(vkClientId));
  return providers;
}

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  session: {
    strategy: "jwt",
    maxAge: sessionMaxAgeSeconds,
    updateAge: 60 * 60 * 24
  },
  jwt: {
    maxAge: sessionMaxAgeSeconds
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        return authorizeUserCredentials(credentials);
      }
    }),
    ...buildOAuthProviders()
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.type !== "oauth" || !isOAuthProvider(account.provider)) return true;
      const resolution = await resolveOAuthUser(
        {
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          email: user.email,
          name: user.name
        },
        { isAdminEmail: (email) => adminEmails.has(email.toLowerCase()) }
      );
      if (!resolution.ok) return `/login?error=${resolution.error}`;
      // Without an adapter NextAuth builds the token from this same object, so the
      // provider profile is swapped for the cabinet it belongs to.
      Object.assign(user, toSessionUser(resolution.user));
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role;
        token.email = limitSessionText(user.email, maxSessionEmailLength) ?? undefined;
        token.name = limitSessionText(user.name, maxSessionNameLength) ?? undefined;
        if ("image" in user) {
          token.picture =
            typeof user.image === "string" ? resolveSessionImage(user.image) ?? undefined : undefined;
        }
      }

      if (typeof token.email === "string" && adminEmails.has(token.email.toLowerCase())) {
        token.role = "ADMIN";
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as "USER" | "ADMIN" | undefined) ?? "USER";
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.picture === "string") {
          session.user.image = normalizeNextImageSrc(token.picture) ?? undefined;
        }
      }
      return session;
    }
  }
};
