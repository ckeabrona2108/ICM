import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";

import { isPrismaTableMissingError } from "@/lib/prisma-errors";

type SqlClient = PrismaClient | Prisma.TransactionClient;

export type LegacyUserRecord = {
  id: string;
  name: string;
  email: string;
  password: string | null;
  avatar: string | null;
  role: string | null;
  artistProfileType: string | null;
  aiTokenBalance: number;
  aiPendingTokenBalance: number;
  personalSiteUrl: string | null;
  vk: string | null;
  telegram: string | null;
};

function toLegacyUserRecord(row: {
  id: string;
  name: string;
  email: string;
  password: string | null;
  avatar: string | null;
  role: string | null;
  artistProfileType: string | null;
  aiTokenBalance: number | null;
  aiPendingTokenBalance: number | null;
}): LegacyUserRecord {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    avatar: row.avatar,
    role: row.role,
    artistProfileType: row.artistProfileType,
    aiTokenBalance: Number(row.aiTokenBalance ?? 0),
    aiPendingTokenBalance: Number(row.aiPendingTokenBalance ?? 0),
    personalSiteUrl: null,
    vk: null,
    telegram: null
  };
}

export function isMissingCanonicalUserTable(error: unknown): boolean {
  return isPrismaTableMissingError(error, "icecream.user") || isPrismaTableMissingError(error, "user");
}

export async function findLegacyUserById(prisma: SqlClient, userId: string): Promise<LegacyUserRecord | null> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    email: string;
    password: string | null;
    avatar: string | null;
    role: string | null;
    artistProfileType: string | null;
    aiTokenBalance: number | null;
    aiPendingTokenBalance: number | null;
  }>>(Prisma.sql`
    SELECT
      "id",
      "name",
      "email",
      "passwordHash" AS "password",
      "avatarUrl" AS "avatar",
      "role"::text AS "role",
      "artistProfileType",
      "aiTokenBalance",
      "aiPendingTokenBalance"
    FROM "icecream"."User"
    WHERE "id" = ${userId}
    LIMIT 1
  `);
  return rows[0] ? toLegacyUserRecord(rows[0]) : null;
}

export async function findLegacyUsersForLogin(prisma: SqlClient, identifier: string): Promise<LegacyUserRecord[]> {
  const normalized = identifier.trim().toLowerCase();
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    email: string;
    password: string | null;
    avatar: string | null;
    role: string | null;
    artistProfileType: string | null;
    aiTokenBalance: number | null;
    aiPendingTokenBalance: number | null;
  }>>(Prisma.sql`
    SELECT
      "id",
      "name",
      "email",
      "passwordHash" AS "password",
      "avatarUrl" AS "avatar",
      "role"::text AS "role",
      "artistProfileType",
      "aiTokenBalance",
      "aiPendingTokenBalance"
    FROM "icecream"."User"
    WHERE lower("email") = ${normalized} OR lower("name") = ${normalized}
    ORDER BY "id" ASC
    LIMIT 2
  `);
  return rows.map(toLegacyUserRecord);
}

export async function findLegacyUserByEmail(prisma: SqlClient, email: string): Promise<LegacyUserRecord | null> {
  const normalized = email.trim().toLowerCase();
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    email: string;
    password: string | null;
    avatar: string | null;
    role: string | null;
    artistProfileType: string | null;
    aiTokenBalance: number | null;
    aiPendingTokenBalance: number | null;
  }>>(Prisma.sql`
    SELECT
      "id",
      "name",
      "email",
      "passwordHash" AS "password",
      "avatarUrl" AS "avatar",
      "role"::text AS "role",
      "artistProfileType",
      "aiTokenBalance",
      "aiPendingTokenBalance"
    FROM "icecream"."User"
    WHERE lower("email") = ${normalized}
    LIMIT 1
  `);
  return rows[0] ? toLegacyUserRecord(rows[0]) : null;
}

export async function createLegacyUser(
  prisma: SqlClient,
  params: { email: string; name: string; passwordHash: string; artistProfileType: "artist" | "producer" | "group" | "label" }
): Promise<LegacyUserRecord> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    email: string;
    password: string | null;
    avatar: string | null;
    role: string | null;
    artistProfileType: string | null;
    aiTokenBalance: number | null;
    aiPendingTokenBalance: number | null;
  }>>(Prisma.sql`
    INSERT INTO "icecream"."User" (
      "id",
      "name",
      "email",
      "passwordHash",
      "role",
      "createdAt",
      "updatedAt",
      "artistProfileType"
    )
    VALUES (
      ${randomUUID()},
      ${params.name},
      ${params.email},
      ${params.passwordHash},
      'USER'::"icecream"."Role",
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      ${params.artistProfileType === "producer" ? "artist" : params.artistProfileType}
    )
    RETURNING
      "id",
      "name",
      "email",
      "passwordHash" AS "password",
      "avatarUrl" AS "avatar",
      "role"::text AS "role",
      "artistProfileType",
      "aiTokenBalance",
      "aiPendingTokenBalance"
  `);
  if (!rows[0]) {
    throw new Error("LEGACY_USER_CREATE_FAILED");
  }
  return toLegacyUserRecord(rows[0]);
}

export async function listLegacyUsersByIds(
  prisma: SqlClient,
  userIds: string[]
): Promise<Map<string, LegacyUserRecord>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    email: string;
    password: string | null;
    avatar: string | null;
    role: string | null;
    artistProfileType: string | null;
    aiTokenBalance: number | null;
    aiPendingTokenBalance: number | null;
  }>>(Prisma.sql`
    SELECT
      "id",
      "name",
      "email",
      "passwordHash" AS "password",
      "avatarUrl" AS "avatar",
      "role"::text AS "role",
      "artistProfileType",
      "aiTokenBalance",
      "aiPendingTokenBalance"
    FROM "icecream"."User"
    WHERE "id" IN (${Prisma.join(userIds)})
  `);
  return new Map(rows.map((row) => {
    const user = toLegacyUserRecord(row);
    return [user.id, user] as const;
  }));
}

export async function listLegacyUsersWithPersonalPosts(
  prisma: SqlClient,
  limit = 48
): Promise<LegacyUserRecord[]> {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    name: string;
    email: string;
    password: string | null;
    avatar: string | null;
    role: string | null;
    artistProfileType: string | null;
    aiTokenBalance: number | null;
    aiPendingTokenBalance: number | null;
  }>>(Prisma.sql`
    SELECT DISTINCT
      u."id",
      u."name",
      u."email",
      u."passwordHash" AS "password",
      u."avatarUrl" AS "avatar",
      u."role"::text AS "role",
      u."artistProfileType",
      u."aiTokenBalance",
      u."aiPendingTokenBalance"
    FROM "icecream"."User" u
    INNER JOIN "icecream"."artist_profile_posts" p
      ON p."user_id" = u."id"
    WHERE p."profile_key" = '__personal__'
    ORDER BY u."id" ASC
    LIMIT ${limit}
  `);
  return rows.map(toLegacyUserRecord);
}
