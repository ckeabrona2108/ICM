import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

function source(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

test("post permalinks use a direct target query instead of relying on the bounded feed window", () => {
  const feed = source("../public-feed-service.ts");
  assert.match(feed, /params\.id\.startsWith\("post_"\)/u);
  assert.match(feed, /targetPostId:\s*postId/u);
  assert.match(feed, /targetReleaseId:\s*releaseId/u);
  assert.match(feed, /getPublicNewsBySlug\(params\.prisma, newsId\)/u);
});

test("feed continuation pushes its composite cursor down to source queries", () => {
  const feed = source("../public-feed-service.ts");
  const community = source("../dashboard-community-service.ts");
  assert.match(feed, /before: params\.cursor \? \{ publishedAt: params\.cursor\.publishedAt, itemId: params\.cursor\.id \}/u);
  assert.match(community, /created_at: \{ lt: before\.publishedAt \}/u);
  assert.match(community, /id: \{ lte: before\.postId \}/u);
  assert.match(community, /orderBy: \[\{ created_at: "desc" \}, \{ id: "desc" \}\]/u);
});

test("community aggregates count only live comments independently from hydrated comment pages", () => {
  const community = source("../dashboard-community-service.ts");
  assert.match(community, /deleted_at:\s*null/u);
  assert.match(community, /postCommentCountMap\.get\(item\.id\)/u);
  assert.match(community, /releaseCommentCountMap\.get\(item\.releaseId\)/u);
});

test("profile social stats render unknown values while the snapshot is loading", () => {
  const profile = source("../../components/landing/artist-profile-social.tsx");
  assert.match(profile, /snapshot\?\.stats\.followers \?\? "—"/u);
  assert.match(profile, /snapshot\?\.stats\.likes \?\? null/u);
});

test("audience migration is constrained and indexed", () => {
  const migration = source("../../../prisma/migrations/20260819142000_add_artist_post_audience/migration.sql");
  assert.match(migration, /CHECK \(audience IN \('PUBLIC', 'FOLLOWERS', 'PRIVATE'\)\)/u);
  assert.match(migration, /artist_profile_posts\(audience, created_at, id\)/u);
});

test("private post creation does not enqueue follower notifications", () => {
  const social = source("../artist-social-service.ts");
  assert.match(social, /if \(params\.audience === "PRIVATE"\) return;/u);
});

test("feed collaboration contract keeps legacy label and adds richer domain presentation fields", () => {
  const contract = source("../feed-contract.ts");
  assert.match(contract, /label:\s*string/u);
  assert.match(contract, /rawIntent:\s*CollaborationIntent/u);
  assert.match(contract, /intentCategory:\s*CollaborationIntentCategory/u);
  assert.match(contract, /displayIntent:\s*string/u);
  assert.match(contract, /rawRole:\s*CollaborationRole/u);
  assert.match(contract, /displayRole:\s*string/u);
});
