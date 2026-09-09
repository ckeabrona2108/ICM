#!/usr/bin/env node

import path from "node:path";
import { spawnSync } from "node:child_process";

import { cleanupOwnedNextDist, prepareOwnedNextDist } from "./next-dist-ownership.mjs";

const root = path.resolve(process.cwd());
const launcher = path.join(root, "scripts", "test-db", "social-test-db.mjs");
const node = process.execPath;
const baseUrl = process.env.E2E_BASE_URL?.trim() || "http://127.0.0.1:3107";
const nextDist = prepareOwnedNextDist({
  workspaceRoot: root,
  instance: process.env.SOCIAL_TEST_DB_INSTANCE
});
const childEnvironment = {
  ...process.env,
  E2E_BASE_URL: baseUrl,
  NEXT_DIST_DIR: nextDist.relativeDistDir
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: childEnvironment,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with status ${result.status ?? "unknown"}`);
  }
  return result.status ?? 1;
}

function inDisposableEnvironment(command, args) {
  return run(node, [launcher, "run", "--", command, ...args]);
}

try {
  inDisposableEnvironment("npx", ["prisma", "migrate", "deploy"]);
  inDisposableEnvironment("npx", ["prisma", "migrate", "status"]);
  inDisposableEnvironment("npx", ["prisma", "generate"]);
  inDisposableEnvironment(node, ["--import", "tsx", "prisma/seed-social-test.ts"]);
  inDisposableEnvironment("npx", ["playwright", "test"]);
} catch (error) {
  process.stderr.write(`[community-e2e] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  try {
    cleanupOwnedNextDist(nextDist);
  } finally {
    run(node, [launcher, "destroy"], { allowFailure: true });
  }
}
