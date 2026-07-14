import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";

import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

const devFallbackSecret = "icm-dev-nextauth-secret-change-me";
const nextAuthSecret = process.env.NEXTAUTH_SECRET ?? devFallbackSecret;
const sessionMaxAgeSeconds = Number(process.env.NEXTAUTH_SESSION_MAX_AGE ?? 60 * 60 * 24 * 30);

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(4)
});

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
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const email = parsed.data.email;
        const users = await prisma.user.findMany({
          where: {
            email: {
              equals: email,
              mode: "insensitive"
            }
          },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            isAdmin: true
          },
          take: 2,
          orderBy: {
            id: "asc"
          }
        });

        if (users.length !== 1) {
          if (users.length > 1) {
            console.error("[auth] ambiguous email match during login", {
              email
            });
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
          image: null,
          role: resolveUserRole({ email: user.email, isAdmin: user.isAdmin })
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        if (typeof user.name === "string") token.name = user.name;
        if ("image" in user) token.picture = typeof user.image === "string" ? user.image : undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as "USER" | "ADMIN" | undefined) ?? "USER";
        if (typeof token.name === "string") session.user.name = token.name;
        if (typeof token.picture === "string") session.user.image = token.picture;
      }
      return session;
    }
  }
};
