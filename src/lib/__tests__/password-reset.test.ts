/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import test from "node:test";

import { requestPasswordReset, resetPasswordWithToken } from "@/lib/password-reset";
import { verifyPassword } from "@/lib/password";

function makePrismaStub() {
  const users = [
    {
      id: "user_1",
      email: "artist@example.com",
      name: "Artist",
      passwordHash: "scrypt$old$hash"
    }
  ];
  const tokens: Array<{ identifier: string; token: string; expires: Date }> = [];
  const sessions: Array<{ userId: string; id: string }> = [{ userId: "user_1", id: "sess_1" }];

  const tx = {
    user: {
      update: async ({ where, data }: any) => {
        const user = users.find((item) => item.id === where.id);
        if (!user) throw new Error("User not found");
        user.passwordHash = data.passwordHash;
        return user;
      }
    },
    verificationToken: {
      create: async ({ data }: any) => {
        tokens.push({ identifier: data.identifier, token: data.token, expires: data.expires });
        return data;
      },
      deleteMany: async ({ where }: any) => {
        let removed = 0;
        for (let index = tokens.length - 1; index >= 0; index -= 1) {
          const token = tokens[index];
          const matchesIdentifier = where.identifier ? token.identifier === where.identifier : false;
          const matchesToken = where.token ? token.token === where.token : false;
          const matchesExpired =
            where.OR?.some((clause: any) => {
              if (clause.identifier) return token.identifier === clause.identifier;
              if (clause.expires?.lt) return token.expires < clause.expires.lt;
              return false;
            }) ?? false;
          if (matchesIdentifier || matchesToken || matchesExpired) {
            tokens.splice(index, 1);
            removed += 1;
          }
        }
        return { count: removed };
      }
    },
    session: {
      deleteMany: async ({ where }: any) => {
        let removed = 0;
        for (let index = sessions.length - 1; index >= 0; index -= 1) {
          if (sessions[index]?.userId === where.userId) {
            sessions.splice(index, 1);
            removed += 1;
          }
        }
        return { count: removed };
      }
    }
  };

  return {
    users,
    tokens,
    sessions,
    prisma: {
      user: {
        findUnique: async ({ where }: any) =>
          users.find((item) => item.email === where.email) ?? null
      },
      verificationToken: {
        findUnique: async ({ where }: any) =>
          tokens.find((item) => item.token === where.token) ?? null,
        deleteMany: tx.verificationToken.deleteMany
      },
      session: {
        deleteMany: tx.session.deleteMany
      },
      $transaction: async (handler: (client: any) => Promise<any>) => handler(tx)
    } as any
  };
}

test("requestPasswordReset creates token and returns preview link", async () => {
  const stub = makePrismaStub();

  const result = await requestPasswordReset({
    prisma: stub.prisma,
    email: "artist@example.com",
    notify: async (payload) => payload.resetUrl
  });

  assert.equal(result.accepted, true);
  assert.ok(result.previewUrl);
  assert.equal(stub.tokens.length, 1);
  assert.match(result.previewUrl!, /\/reset-password\?token=/);
});

test("requestPasswordReset ignores unknown email", async () => {
  const stub = makePrismaStub();

  const result = await requestPasswordReset({
    prisma: stub.prisma,
    email: "unknown@example.com"
  });

  assert.equal(result.accepted, true);
  assert.equal(result.previewUrl, null);
  assert.equal(stub.tokens.length, 0);
});

test("requestPasswordReset works for oauth user without password hash", async () => {
  const stub = makePrismaStub();
  stub.users[0]!.passwordHash = null as unknown as string;

  const result = await requestPasswordReset({
    prisma: stub.prisma,
    email: "artist@example.com",
    notify: async (payload) => payload.resetUrl
  });

  assert.equal(result.accepted, true);
  assert.ok(result.previewUrl);
  assert.equal(stub.tokens.length, 1);
});

test("resetPasswordWithToken updates password and clears sessions", async () => {
  const stub = makePrismaStub();

  const issued = await requestPasswordReset({
    prisma: stub.prisma,
    email: "artist@example.com",
    notify: async (payload) => payload.resetUrl
  });

  const token = new URL(issued.previewUrl!).searchParams.get("token");
  assert.ok(token);

  await resetPasswordWithToken({
    prisma: stub.prisma,
    token: token!,
    password: "new-password-123"
  });

  assert.equal(stub.sessions.length, 0);
  assert.equal(stub.tokens.length, 0);
  assert.equal(
    await verifyPassword("new-password-123", stub.users[0]!.passwordHash),
    true
  );
});

test("resetPasswordWithToken rejects expired token", async () => {
  const stub = makePrismaStub();

  const issued = await requestPasswordReset({
    prisma: stub.prisma,
    email: "artist@example.com",
    now: new Date("2026-05-07T10:00:00.000Z"),
    notify: async (payload) => payload.resetUrl
  });

  const token = new URL(issued.previewUrl!).searchParams.get("token");

  await assert.rejects(
    async () => {
      await resetPasswordWithToken({
        prisma: stub.prisma,
        token: token!,
        password: "new-password-123",
        now: new Date("2026-05-07T11:00:01.000Z")
      });
    },
    (error: unknown) => error instanceof Error && error.message === "INVALID_RESET_TOKEN"
  );
});
