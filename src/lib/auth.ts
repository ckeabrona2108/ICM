import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyPassword } from "@/lib/password";
import { findLegacyUsersForLogin, isMissingCanonicalUserTable } from "@/lib/legacy-user-store";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { normalizeNextImageSrc } from "@/lib/image-src";

const devFallbackSecret = "icm-dev-nextauth-secret-change-me";
const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? devFallbackSecret;
const sessionMaxAgeSeconds = Number(process.env.NEXTAUTH_SESSION_MAX_AGE ?? 60 * 60 * 24 * 30);

const loginSchema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(4)
});

function normalizeLoginIdentifier(value: string) {
  return value.trim().toLowerCase();
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
    if (!isMissingCanonicalUserTable(error)) throw error;
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

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: normalizeNextImageSrc(user.avatar) ?? null,
    role: resolveUserRole({ email: user.email, isAdmin: user.isAdmin })
  };
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
    signIn: "/login"
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
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        if (typeof user.email === "string") token.email = user.email;
        if (typeof user.name === "string") token.name = user.name;
        if ("image" in user) {
          token.picture =
            typeof user.image === "string" ? normalizeNextImageSrc(user.image) ?? undefined : undefined;
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
