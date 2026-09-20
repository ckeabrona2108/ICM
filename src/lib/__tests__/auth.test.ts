import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcryptjs";

import { authorizeUserCredentials } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

test("password verification accepts current scrypt hashes", async () => {
  const hash = await hashPassword("DevPass123!");
  assert.equal(await verifyPassword("DevPass123!", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
});

test("password verification accepts bcrypt legacy hashes", async () => {
  const hash = await bcrypt.hash("DevPass123!", 10);
  assert.equal(await verifyPassword("DevPass123!", hash), true);
  assert.equal(await verifyPassword("wrong", hash), false);
});

test("password verification rejects plaintext legacy values", async () => {
  assert.equal(await verifyPassword("DevPass123!", "DevPass123!"), false);
});

test("authorizeUserCredentials logs in a seeded-style user with normalized email", async () => {
  const originalFindMany = prisma.user.findMany.bind(prisma.user);
  const passwordHash = await hashPassword("DevPass123!");
  prisma.user.findMany = (async () => [{
    id: "user-1",
    email: "artist.a@local.icm",
    name: "Ckeabrona",
    password: passwordHash,
    avatar: "https://example.com/avatar.png",
    isAdmin: false
  }]) as typeof prisma.user.findMany;

  try {
    const result = await authorizeUserCredentials({
      email: "  ARTIST.A@LOCAL.ICM  ",
      password: "DevPass123!"
    });

    assert.equal(result?.email, "artist.a@local.icm");
    assert.equal(result?.name, "Ckeabrona");
    assert.equal(result?.role, "USER");
  } finally {
    prisma.user.findMany = originalFindMany;
  }
});

test("authorizeUserCredentials rejects invalid password", async () => {
  const originalFindMany = prisma.user.findMany.bind(prisma.user);
  const passwordHash = await hashPassword("DevPass123!");
  prisma.user.findMany = (async () => [{
    id: "user-1",
    email: "artist.a@local.icm",
    name: "Ckeabrona",
    password: passwordHash,
    avatar: null,
    isAdmin: false
  }]) as typeof prisma.user.findMany;

  try {
    const result = await authorizeUserCredentials({
      email: "artist.a@local.icm",
      password: "WrongPass123!"
    });

    assert.equal(result, null);
  } finally {
    prisma.user.findMany = originalFindMany;
  }
});

test("authorizeUserCredentials falls back to the legacy store when a deployed column is missing", async () => {
  const originalFindMany = prisma.user.findMany.bind(prisma.user);
  const originalQueryRaw = prisma.$queryRaw.bind(prisma);
  const passwordHash = await hashPassword("DevPass123!");

  prisma.user.findMany = (async () => {
    throw new Error('The column `user.isAdmin` does not exist in the current database.');
  }) as typeof prisma.user.findMany;
  prisma.$queryRaw = (async () => [{
    id: "legacy-user-1",
    email: "artist.a@local.icm",
    name: "Ckeabrona",
    password: passwordHash,
    avatar: null,
    role: "USER",
    artistProfileType: "artist",
    aiTokenBalance: 0,
    aiPendingTokenBalance: 0
  }]) as typeof prisma.$queryRaw;

  try {
    const result = await authorizeUserCredentials({
      email: "artist.a@local.icm",
      password: "DevPass123!"
    });

    assert.equal(result?.id, "legacy-user-1");
    assert.equal(result?.role, "USER");
  } finally {
    prisma.user.findMany = originalFindMany;
    prisma.$queryRaw = originalQueryRaw;
  }
});
