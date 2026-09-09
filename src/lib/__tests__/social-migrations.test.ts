import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const SOCIAL_MIGRATIONS = [
  "20260718113000_add_scene_release_reactions",
  "20260718150000_add_artist_social_feed",
  "20260718190000_add_artist_social_media_and_followers",
  "20260718210000_add_scene_release_plays"
] as const;

function readMigration(name: string) {
  return readFileSync(path.join(process.cwd(), "prisma", "migrations", name, "migration.sql"), "utf8");
}

test("social migrations target the canonical lowercase UUID user and release tables", () => {
  const sql = SOCIAL_MIGRATIONS.map(readMigration).join("\n");

  assert.doesNotMatch(sql, /REFERENCES\s+(?:"icecream"\.)?"User"/u);
  assert.doesNotMatch(sql, /REFERENCES\s+(?:"icecream"\.)?"Release"/u);
  assert.doesNotMatch(sql, /(?:user_id|profile_user_id|follower_user_id|release_id)"?\s+TEXT\b/iu);

  assert.match(sql, /REFERENCES\s+"icecream"\."user"\s*\("id"\)/u);
  assert.match(sql, /REFERENCES\s+"icecream"\."release"\s*\("id"\)/u);
});

test("social migration repairs remain safe to re-run on a canonical baseline", () => {
  for (const name of SOCIAL_MIGRATIONS) {
    const sql = readMigration(name);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS/iu, `${name} must tolerate an existing table`);
    assert.match(sql, /CREATE INDEX IF NOT EXISTS/iu, `${name} must tolerate existing indexes`);
  }
});

test("legacy social columns are repaired without deleting rows", () => {
  const sql = SOCIAL_MIGRATIONS.map(readMigration).join("\n");
  const repairedColumns = [
    "release_id",
    "user_id",
    "profile_user_id",
    "follower_user_id"
  ];

  for (const column of repairedColumns) {
    assert.match(
      sql,
      new RegExp(`ALTER COLUMN "${column}" TYPE UUID USING "${column}"::UUID`, "u"),
      `${column} must be converted in place rather than rebuilt`
    );
  }

  assert.doesNotMatch(sql, /^\s*(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/imu);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS "scene_release_reactions_release_id_fkey"/u);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS "artist_profile_posts_user_id_fkey"/u);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS "artist_profile_followers_profile_owner_fkey"/u);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS "scene_release_plays_release_id_fkey"/u);
});
