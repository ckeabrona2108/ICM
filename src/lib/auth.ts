import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";

const devFallbackSecret = "icm-dev-nextauth-secret-change-me";
const nextAuthSecret =
  process.env.NEXTAUTH_SECRET ?? devFallbackSecret;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4)
});

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function resolveUserRole(email: string, role: "USER" | "MODERATOR" | "ADMIN"): "USER" | "MODERATOR" | "ADMIN" {
  return adminEmails.has(email.toLowerCase()) ? "ADMIN" : role;
}

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  session: {
    strategy: "jwt"
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

        if (!parsed.success) {
          return null;
        }

        let user:
          | {
              id: string;
              email: string;
              name: string;
              passwordHash: string | null;
              role: "USER" | "MODERATOR" | "ADMIN";
            }
          | null = null;
        try {
          user = await prisma.user.findUnique({
            where: { email: parsed.data.email.toLowerCase() },
            // Keep auth query minimal so login does not break on optional profile columns.
            select: {
              id: true,
              email: true,
              name: true,
              passwordHash: true,
              role: true
            }
          });
        } catch (error) {
          console.error("[auth] authorize query failed", error);
          return null;
        }

        if (!user?.passwordHash) {
          return null;
        }

        const isPasswordValid = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!isPasswordValid) {
          return null;
        }

        const role = resolveUserRole(user.email, user.role);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: null,
          role
        };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        if (typeof user.name === "string") {
          token.name = user.name;
        }
        if ("image" in user) {
          token.picture = typeof user.image === "string" ? user.image : undefined;
        }
      }
      if (token.email) {
        token.role = resolveUserRole(
          token.email,
          (token.role as "USER" | "MODERATOR" | "ADMIN" | undefined) ?? "USER"
        );
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as "USER" | "ADMIN" | "MODERATOR" | undefined) ?? "USER";
        if (typeof token.name === "string") {
          session.user.name = token.name;
        }
        if (typeof token.picture === "string") {
          session.user.image = token.picture;
        }
      }
      return session;
    }
  }
};
