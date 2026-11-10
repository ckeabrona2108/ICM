import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveAdminPageAccess } from "@/lib/admin-page-guard";
import { resolveNextAuthSecret } from "@/lib/auth-secret";
import { authorizeUserCredentials, consumeLoginIpAttempt, readLoginRequestIp } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

test("admin pages require a signed-in admin", () => {
  assert.equal(resolveAdminPageAccess(null), "login");
  assert.equal(resolveAdminPageAccess({ user: { id: "", role: "ADMIN" } } as never), "login");
  assert.equal(resolveAdminPageAccess({ user: { id: "u1", role: "USER" } } as never), "forbidden");
  assert.equal(resolveAdminPageAccess({ user: { id: "u1" } } as never), "forbidden");
  assert.equal(resolveAdminPageAccess({ user: { id: "u1", role: "ADMIN" } } as never), "ok");
});

test("production never signs sessions with a missing or public NextAuth secret", () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal(resolveNextAuthSecret({ NODE_ENV: "production" }), undefined);
    assert.equal(resolveNextAuthSecret({ NODE_ENV: "production", NEXTAUTH_SECRET: "  " }), undefined);
    assert.equal(
      resolveNextAuthSecret({ NODE_ENV: "production", NEXTAUTH_SECRET: "icm-dev-nextauth-secret-change-me" }),
      undefined
    );
    assert.equal(resolveNextAuthSecret({ NODE_ENV: "production", NEXTAUTH_SECRET: "replace_with_long_secret" }), undefined);
  } finally {
    console.error = originalError;
  }
  assert.equal(resolveNextAuthSecret({ NODE_ENV: "production", NEXTAUTH_SECRET: "a-real-random-secret" }), "a-real-random-secret");
  assert.equal(resolveNextAuthSecret({ NODE_ENV: "development" }), "icm-dev-nextauth-secret-change-me");
});

test("login attempts are capped per IP across different accounts", () => {
  const ip = `203.0.113.${Math.floor(Math.random() * 250)}-${Date.now()}`;
  const now = 5_000_000;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    assert.equal(consumeLoginIpAttempt(ip, now + attempt), true);
  }
  assert.equal(consumeLoginIpAttempt(ip, now + 31), false);
  assert.equal(consumeLoginIpAttempt(ip, now + 15 * 60_000 + 1), true);
  assert.equal(consumeLoginIpAttempt(null, now), true);
});

test("login IP is read from NextAuth's plain header object", () => {
  assert.equal(readLoginRequestIp({ headers: { "x-real-ip": "198.51.100.7" } }), "198.51.100.7");
  assert.equal(readLoginRequestIp({ headers: { "x-forwarded-for": "10.0.0.1, 198.51.100.8" } }), "198.51.100.8");
  assert.equal(readLoginRequestIp(undefined), null);
});

test("a blocked IP cannot log in even with the right password", async () => {
  const ip = `198.51.100.${Date.now()}`;
  for (let attempt = 0; attempt < 30; attempt += 1) consumeLoginIpAttempt(ip);

  const originalFindMany = prisma.user.findMany.bind(prisma.user);
  const passwordHash = await hashPassword("DevPass123!");
  let lookedUp = false;
  prisma.user.findMany = (async () => {
    lookedUp = true;
    return [{ id: "user-1", email: "a@local.icm", name: "A", password: passwordHash, avatar: null, isAdmin: false }];
  }) as typeof prisma.user.findMany;

  try {
    const result = await authorizeUserCredentials({ email: "a@local.icm", password: "DevPass123!" }, { ip });
    assert.equal(result, null);
    assert.equal(lookedUp, false);
  } finally {
    prisma.user.findMany = originalFindMany;
  }
});
