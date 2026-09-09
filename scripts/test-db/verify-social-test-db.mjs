#!/usr/bin/env node

import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.cwd());
const launcher = path.join(root, "scripts", "test-db", "social-test-db.mjs");
const node = process.execPath;

const steps = [
  {
    label: "apply the complete migration history",
    command: [node, launcher, "run", "--", "npx", "prisma", "migrate", "deploy"]
  },
  {
    label: "verify migration status",
    command: [node, launcher, "run", "--", "npx", "prisma", "migrate", "status"]
  },
  {
    label: "generate Prisma Client",
    command: [node, launcher, "run", "--", "npx", "prisma", "generate"]
  },
  {
    label: "assert live disposable schema matches the Prisma datamodel",
    command: [
      node,
      launcher,
      "run",
      "--",
      "npx",
      "prisma",
      "migrate",
      "diff",
      "--from-schema-datasource",
      "prisma/schema.prisma",
      "--to-schema-datamodel",
      "prisma/schema.prisma",
      "--exit-code"
    ]
  },
  {
    label: "assert canonical social tables and migration health",
    command: [node, launcher, "run", "--", node, "--import", "tsx", "scripts/test-db/assert-social-schema-parity.ts"]
  },
  {
    label: "seed deterministic A/B/C fixtures",
    command: [node, launcher, "run", "--", node, "--import", "tsx", "prisma/seed-social-test.ts"]
  }
];

function run(command, args, allowFailure = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with status ${result.status ?? "unknown"}`);
  }
}

try {
  for (const step of steps) {
    process.stdout.write(`\n[community-db-gate] ${step.label}\n`);
    const [command, ...args] = step.command;
    run(command, args);
  }
  process.stdout.write("\n[community-db-gate] disposable migration and fixture gate passed\n");
} catch (error) {
  process.stderr.write(`\n[community-db-gate] FAILED: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
} finally {
  process.stdout.write("\n[community-db-gate] destroying owned disposable database\n");
  run(node, [launcher, "destroy"], true);
}
