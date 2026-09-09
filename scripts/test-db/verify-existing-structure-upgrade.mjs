#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const node = process.execPath;
const launcher = path.join(root, "scripts", "test-db", "social-test-db.mjs");
const workspaceHash = createHash("sha256").update(root).digest("hex").slice(0, 12);
const rehearsalInstance = "upgrade";
process.env.SOCIAL_TEST_DB_INSTANCE = rehearsalInstance;
process.env.SOCIAL_TEST_DB_PORT = process.env.SOCIAL_UPGRADE_TEST_DB_PORT ?? "55433";
const runtimeRoot = path.join(os.tmpdir(), `icm-pg-${workspaceHash}-${rehearsalInstance}`);
const structureSql = path.join(runtimeRoot, "existing-structure-rehearsal.sql");
const appliedCutoff = "20260727120000_add_artist_profile_post_release_link";
const canonicalBridge = "20260718100000_baseline_canonical_icecream_schema";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.quiet ? "utf8" : undefined,
    env: process.env,
    stdio: options.quiet ? "pipe" : "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.quiet ? String(result.stderr || result.stdout || "").trim() : "";
    throw new Error(`${path.basename(command)} exited with status ${result.status ?? "unknown"}${detail ? `: ${detail}` : ""}`);
  }
}

function launcherRun(args, options) {
  run(node, [launcher, "run", "--", ...args], options);
}

function historicalAppliedMigrations() {
  return readdirSync(path.join(root, "prisma", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name <= appliedCutoff && name !== canonicalBridge)
    .sort();
}

try {
  process.stdout.write("[community-db-upgrade] starting owned disposable PostgreSQL\n");
  run(node, [launcher, "start"], { quiet: true });

  process.stdout.write("[community-db-upgrade] creating a structure-only canonical snapshot\n");
  launcherRun([
    "npx", "prisma", "migrate", "diff",
    "--from-empty",
    "--to-schema-datamodel", "prisma/schema.prisma",
    "--script",
    "--output", structureSql
  ], { quiet: true });
  process.stdout.write("[community-db-upgrade] applying the structure snapshot to an empty disposable database\n");
  launcherRun([
    "npx", "prisma", "db", "execute",
    "--file", structureSql,
    "--schema", "prisma/schema.prisma"
  ], { quiet: true });
  process.stdout.write("[community-db-upgrade] canonical structure snapshot applied\n");

  const applied = historicalAppliedMigrations();
  process.stdout.write(`[community-db-upgrade] recording ${applied.length} historical migrations on the disposable snapshot\n`);
  for (const migration of applied) {
    launcherRun(["npx", "prisma", "migrate", "resolve", "--applied", migration], { quiet: true });
  }

  // This bridge converts the legacy CamelCase layout into the canonical schema.
  // An already-canonical database must baseline it instead of executing it:
  // duplicate canonical enum/table DDL fails before pending migrations can run.
  // The resolve happens only on this owned structure-only clone.
  process.stdout.write(`[community-db-upgrade] baselining canonical bridge ${canonicalBridge}\n`);
  launcherRun(["npx", "prisma", "migrate", "resolve", "--applied", canonicalBridge], { quiet: true });

  process.stdout.write("[community-db-upgrade] applying pending migrations after the canonical bridge\n");
  launcherRun(["npx", "prisma", "migrate", "deploy"]);
  launcherRun([
    "npx", "prisma", "migrate", "diff",
    "--from-schema-datasource", "prisma/schema.prisma",
    "--to-schema-datamodel", "prisma/schema.prisma",
    "--exit-code"
  ]);
  launcherRun([node, "--import", "tsx", "scripts/test-db/assert-social-schema-parity.ts"]);
  process.stdout.write("[community-db-upgrade] structure-only upgrade rehearsal passed\n");
} catch (error) {
  process.stderr.write(`[community-db-upgrade] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  rmSync(structureSql, { force: true });
  spawnSync(node, [launcher, "destroy"], { cwd: root, env: process.env, stdio: "inherit" });
}
