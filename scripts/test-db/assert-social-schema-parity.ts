import { Prisma, PrismaClient } from "@prisma/client";

import { assertSocialTestDatabaseUrl } from "./social-test-db-policy.mjs";

const target = assertSocialTestDatabaseUrl(process.env.SOCIAL_TEST_DATABASE_URL);
const prisma = new PrismaClient({ datasources: { db: { url: target.url } } });

const REQUIRED_TABLES = [
  "user",
  "release",
  "artist_profile_posts",
  "artist_profile_post_comments",
  "artist_profile_post_likes",
  "artist_profile_followers",
  "scene_release_comments",
  "scene_release_likes",
  "scene_release_reactions",
  "scene_release_plays",
  "social_feed_preferences",
  "direct_conversations",
  "direct_messages",
  "playlist_placements",
  "social_user_blocks",
  "social_reports"
] as const;

type TableRow = { table_name: string };
type MigrationSummary = {
  applied_count: bigint;
  failed_count: bigint;
};
type LegacyRow = { legacy_count: bigint };

async function main() {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'icecream'
      AND table_name IN (${PrismaJoin(REQUIRED_TABLES)})
    ORDER BY table_name
  `;
  const actual = new Set(tables.map((row) => row.table_name));
  const missing = REQUIRED_TABLES.filter((table) => !actual.has(table));
  if (missing.length > 0) {
    throw new Error(`Missing canonical social tables: ${missing.join(", ")}`);
  }

  const [migrationSummary] = await prisma.$queryRaw<MigrationSummary[]>`
    SELECT
      COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied_count,
      COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS failed_count
    FROM "icecream"."_prisma_migrations"
  `;
  if (!migrationSummary || Number(migrationSummary.failed_count) !== 0) {
    throw new Error(`Disposable database contains ${Number(migrationSummary?.failed_count ?? 0)} failed migrations`);
  }

  const [legacy] = await prisma.$queryRaw<LegacyRow[]>`
    SELECT COUNT(*) AS legacy_count
    FROM information_schema.tables
    WHERE table_schema = 'icecream'
      AND table_name IN ('User', 'Release', 'Track')
  `;
  if (Number(legacy?.legacy_count ?? 0) !== 0) {
    throw new Error("Legacy CamelCase core tables remain after the canonical bridge");
  }

  process.stdout.write(`${JSON.stringify({
    database: target.database,
    appliedMigrations: Number(migrationSummary.applied_count),
    canonicalTables: tables.map((row) => row.table_name),
    failedMigrations: 0,
    legacyCoreTables: 0,
    ok: true
  }, null, 2)}\n`);
}

// Prisma.sql cannot interpolate an identifier list into IN safely, so values are
// represented as individually parameterized SQL fragments.
function PrismaJoin(values: readonly string[]) {
  return Prisma.join(values.map((value) => Prisma.sql`${value}`));
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
